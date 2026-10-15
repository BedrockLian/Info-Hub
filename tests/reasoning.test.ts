import {stub,tag} from './setup.ts';
import assert from 'node:assert/strict';
import {after,before,mock,test} from 'node:test';
import {z} from 'zod';
import {chatJson,ModelOutputError} from '@aihot/backend/providers/llm';
import {config} from '@aihot/backend/config';
import {sql,closeDb} from '@aihot/backend/db';
import {BudgetExceededError} from '@aihot/backend/providers/receipts';
import {sha256} from '@aihot/backend/lib/ids';
import {modelsOverview} from '@aihot/backend/admin/models';

const subject=`reasoning-${tag()}`;
const requests: Record<string,any>[]=[];
let truncated=false;
const provider=await stub((_hit,req)=>{
  requests.push(JSON.parse(req.body));
  return {choices:[{message:{content:'{"ok":true}'},finish_reason:truncated?'length':'stop'}],usage:{prompt_tokens:100,prompt_cache_hit_tokens:64,prompt_cache_miss_tokens:36,completion_tokens:200,completion_tokens_details:{reasoning_tokens:150}}};
});
// Exercise the private provider checks and real local HTTP transport without paid/external egress.
const realFetch=globalThis.fetch;
globalThis.fetch=((url,init)=>{
  assert.equal(String(url),'https://api.deepseek.com/v1/chat/completions');
  return realFetch(`${provider.url}/v1/chat/completions`,init);
}) as typeof fetch;
Object.assign(process.env,{LLM_MODEL:'deepseek-flash',LLM_BASE_URL:'https://api.deepseek.com/v1',LLM_API_KEY:'test-key',LLM_EXTRA_JSON:'{"thinking":{"type":"disabled"},"reasoning_effort":"max"}'});
config.privateSite=true;
// Provider scheduling uses the process clock; a fixed Sunday keeps this test independent of peak hours.
before(()=>mock.timers.enable({apis:['Date'],now:Date.UTC(2026,9,11)}));
const call=(purpose:string,extra={})=>chatJson({model:'default',purpose,subject,promptVersion:'test',system:'Return JSON',user:'text',schema:z.object({ok:z.boolean()}),maxTokens:512,...extra});
after(async()=>{
  globalThis.fetch=realFetch;
  await provider.close();
  await sql`DELETE FROM receipts WHERE subject=${subject}`;
  await closeDb();
  mock.timers.reset();
});

test('private Flash sends scene-specific effort instead of the conflicting global default; receipts show the effective policy',async()=>{
  const scenes: Array<[string,string,number]>=[
    ['prefilter_article','low',4096],['score_article','low',4096],['understand_article','low',16384],
    ['structure_article','none',512],['summarize_article','none',512],
    ['group_article','low',4096],['group_signal','low',4096],['group_story','low',4096],
    ['group_review','low',4096],['group_story_review','low',4096],['story_digest','low',4096],
    ['report_lead','none',512],['report_curate','low',4096],['report_weekly','low',4096],['report_monthly','low',4096],
    ['translate_body','none',512],['translate_quoted','none',512],['monitor.recognize','low',4096],
  ];
  for(const [purpose,effort,tokens] of scenes){
    const result=await call(purpose,purpose==='understand_article'?{maxTokens:16384}:{});
    const sent=requests.at(-1)!;
    assert.equal(sent.reasoning_effort,effort,purpose);
    assert.equal(sent.thinking.type,effort==='none'?'disabled':'enabled',purpose);
    assert.equal(sent.max_tokens,tokens,purpose);
    if(effort!=='none')assert.ok(!Object.hasOwn(sent,'temperature'),'thinking ignores temperature; do not pretend it controls sampling');
    const [row]=await sql`SELECT request FROM receipts WHERE id=${result.receiptId}`;
    assert.equal(row!.request.reasoningEffort,effort);
    assert.equal(row!.request.maxTokens,tokens);
    assert.equal(row!.request.reasoningPolicy,'infohub-intelligence-v3');
    assert.equal(row!.request.runtime,'pi-agent-core');
    assert.equal(row!.request.instructionPolicy,'infohub-concise-v1');
    assert.match(sent.messages[0].content,/执行篇幅约束/);
    assert.equal(row!.request.systemHash,sha256(sent.messages[0].content),'receipt hashes the actual augmented prompt');
    if(effort!=='none')assert.ok(row!.request.softThinkingTokens>0);
  }
});

test('changed effort cannot reuse the old disabled response; repeated effective requests reuse their receipt',async()=>{
  config.privateSite=false;
  try {
    const old=await call('score_article',{user:'identity fixture'});
    config.privateSite=true;
    const current=await call('score_article',{user:'identity fixture'});
    assert.notEqual(current.receiptId,old.receiptId);
    const repeated=await call('score_article',{user:'identity fixture',temperature:1});
    assert.equal(repeated.receiptId,current.receiptId);
    assert.equal(repeated.reused,true);
  } finally {config.privateSite=true;}
});

test('public direct calls preserve JSON text serialization of object inputs',async()=>{
  config.privateSite=false;
  try {
    await call('score_article',{user:{article:'object input'}});
    assert.equal(requests.at(-1)!.messages.at(-1).content,'{"article":"object input"}');
  } finally {config.privateSite=true;}
});

test('unknown purposes and public deployments retain explicit provider configuration',async()=>{
  for(const purpose of ['other-purpose','constructor','__proto__']){
    await call(purpose);
    assert.equal(requests.at(-1)!.thinking.type,'disabled');
    assert.equal(requests.at(-1)!.max_tokens,512);
    assert.ok(!requests.at(-1)!.messages[0].content.includes('执行篇幅约束'));
  }
  config.privateSite=false;
  try {
    await call('group_review',{user:'public fixture'});
    assert.equal(requests.at(-1)!.thinking.type,'disabled');
    assert.equal(requests.at(-1)!.reasoning_effort,'max');
    assert.equal(requests.at(-1)!.max_tokens,512);
  } finally {config.privateSite=true;}
});

test('Pi reuses validated results across article IDs while language and explicit rejudgement remain isolated',async()=>{
  const hits=provider.hits();
  const first=await call('summarize_article',{user:'same article content for cache',subject:subject+'-first'});
  const second=await call('summarize_article',{user:'same article content for cache',subject:subject+'-second'});
  assert.equal(second.receiptId,first.receiptId);assert.equal(second.reused,true);assert.equal(provider.hits(),hits+1);
  await call('summarize_article',{user:'same article content for cache',targetLanguage:'en'});
  assert.equal(provider.hits(),hits+2);
  await call('summarize_article',{user:'same article content for cache',attemptTag:'explicit-rejudge'});
  assert.equal(provider.hits(),hits+3);
  const [stats]=await sql`SELECT count(*)::int AS lookups,count(*) FILTER(WHERE reused)::int AS hits FROM model_result_cache_events WHERE receipt_id=${first.receiptId}`;
  assert.equal(stats!.lookups,2);assert.equal(stats!.hits,1);
  await sql`DELETE FROM receipts WHERE subject IN (${subject+'-first'},${subject+'-second'})`;
});

test('admin cache metrics use native token details and report result reuse separately',async()=>{
  const overview=await modelsOverview(1);
  const score=overview.capabilities.find(c=>c.key==='score')!;
  const usage=score.usage.find(u=>u.promptVersion==='test'&&u.model==='deepseek-flash'&&u.runtime==='pi-agent-core')!;
  assert.equal(usage.cacheHitRate,0.64);
  assert.ok(usage.cachedInput!>0);
  assert.equal(usage.estimate?.currency,'USD');
  assert.ok(score.resultCache.lookups>0);
  assert.ok(score.resultCache.hits>0);
});

test('reasoning output ceiling is reserved before sending and still obeys the money stop',async()=>{
  const saved=config.modelBudgetDayUsd;
  const [spent]=await sql`SELECT coalesce(sum(budget_charge_usd),0) AS day FROM receipt_attempts WHERE origin='live' AND started_at>now()-interval '1 day'`;
  config.modelBudgetDayUsd=Number(spent!.day)+0.002;
  try {
    await call('budget-baseline',{user:'short output still fits'});
    const hits=provider.hits();
    await assert.rejects(call('score_article',{user:'budget fixture'}),BudgetExceededError);
    assert.equal(provider.hits(),hits);
  } finally {config.modelBudgetDayUsd=saved;}
});

test('length-truncated reasoning responses are rejected even when the final JSON parses',async()=>{
  truncated=true;
  try {
    await assert.rejects(call('group_review',{user:'truncation fixture'}),ModelOutputError);
    const [row]=await sql`SELECT status,error FROM receipts WHERE subject=${subject} AND purpose='group_review' ORDER BY id DESC LIMIT 1`;
    assert.equal(row!.status,'failed');
    assert.match(row!.error,/length/);
  } finally {truncated=false;}
});
