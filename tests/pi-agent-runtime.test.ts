import assert from 'node:assert/strict';
import {test} from 'node:test';
import {piAgentRequest} from '../packages/backend/src/providers/pi-agent.ts';
import {TemplateBatcher} from '../packages/backend/src/providers/pi-batch.ts';
import {stablePrompt} from '../packages/backend/src/providers/prompt-layout.ts';
import {z} from 'zod';
import {createPiModelRuntime} from '../packages/backend/src/providers/pi-ai.ts';
import {createAssistantMessageEventStream,type AssistantMessage} from '@earendil-works/pi-ai';

const body=(text:string)=>({model:'deepseek-flash',max_tokens:4096,messages:[{role:'system',content:'Stable rules'},{role:'user',content:text}]});
test('real Pi agents preserve native requests and usage without carrying another article into the transcript',async()=>{
  const calls:unknown[]=[];
  for(const text of ['article A','article B']){
    const result=await piAgentRequest({body:body(text),baseUrl:'https://api.deepseek.com/v1',apiKey:'test-only',effort:'low',send:async wire=>{
      calls.push(wire);return {response:{choices:[{message:{content:'{"ok":true}'},finish_reason:'stop'}]},usage:{prompt_tokens:100,prompt_cache_hit_tokens:64,prompt_cache_miss_tokens:36,completion_tokens:10}};
    }});
    assert.equal(result.usage?.prompt_cache_hit_tokens,64);
    assert.deepEqual(calls.at(-1),body(text));
  }
  assert.equal(calls.length,2);
});

test('Pi transport preserves a provider failure without hidden retries',async()=>{
  const failure=new Error('provider rejected');let calls=0;
  await assert.rejects(piAgentRequest({body:body('bad'),baseUrl:'https://api.deepseek.com/v1',apiKey:'test-only',effort:'none',send:async()=>{calls++;throw failure;}}),error=>error===failure);
  assert.equal(calls,1);
});

test('template batches are bounded, group compatible tasks and isolate a failed article',async()=>{
  const batcher=new TemplateBatcher(2,8,1);let active=0,peak=0;const order:string[]=[];
  const run=(name:string)=>async()=>{active++;peak=Math.max(peak,active);order.push(name);await new Promise(r=>setTimeout(r,2));active--;if(name==='A2')throw Error('one article failed');return name;};
  const settled=await Promise.allSettled([batcher.submit('A',run('A1')),batcher.submit('B',run('B1')),batcher.submit('A',run('A2')),batcher.submit('A',run('A3'))]);
  assert.equal(peak,2);assert.equal(settled.filter(r=>r.status==='fulfilled').length,3);
  assert.deepEqual(order,['A1','A2','A3','B1']);
});

test('dynamic summary dates and IDs are separated from the reusable instruction/schema prefix',()=>{
  const schema=z.object({ok:z.boolean()});
  const a=stablePrompt('','Rules\r\n\r\n【时间锚点】A date\narticle A','summarize_article',schema,true);
  const b=stablePrompt('','Rules\n\n【时间锚点】B date\narticle B','summarize_article',schema,true);
  assert.equal(a.system,b.system);assert.notEqual(a.user,b.user);assert.match(a.system,/固定结果结构/);assert.ok(!a.system.includes('A date'));
});

test('Pi AI registers the configured DeepSeek model and resolves its existing key at dispatch',async()=>{
  let resolvedKey:unknown;
  const stream=()=>{const events=createAssistantMessageEventStream();events.push({type:'done',reason:'stop',message:{role:'assistant',content:[{type:'text',text:'ok'}],api:'openai-completions',provider:'deepseek',model:'deepseek-flash',stopReason:'stop',timestamp:0,usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}} as AssistantMessage});return events;};
  const runtime=createPiModelRuntime({modelId:'deepseek-flash',baseUrl:'https://api.deepseek.com/v1',apiKey:'test-existing-key',maxTokens:4096,streams:{stream:(_m,_c,o)=>{resolvedKey=o?.apiKey;return stream();},streamSimple:(_m,_c,o)=>{resolvedKey=o?.apiKey;return stream();}}});
  assert.equal(runtime.models.getModel('deepseek','deepseek-flash'),runtime.model);
  assert.equal(runtime.model.baseUrl,'https://api.deepseek.com/v1');
  assert.equal(runtime.model.compat?.supportsDeveloperRole,false);
  const result=await runtime.models.completeSimple(runtime.model,{systemPrompt:'fixed',messages:[{role:'user',content:'article',timestamp:0}]},{reasoning:'low'});
  assert.equal(result.stopReason,'stop');assert.equal(resolvedKey,'test-existing-key');
});

test('all editorial scenes share a fixed prefix before scene rules and changing article material',()=>{
  const schema=z.object({ok:z.boolean()});
  const a=stablePrompt('Score rules','article A','score_article',schema,true);
  const b=stablePrompt('Timeline rules','article B','story_digest',schema,true);
  const shared=a.system.slice(0,a.system.indexOf('Score rules'));
  assert.match(shared,/编辑规则版本：infohub-pi-editor-v1/);
  assert.ok(b.system.startsWith(shared));
  assert.ok(!shared.includes('article A'));assert.equal(a.user,'article A');assert.equal(b.user,'article B');
});
