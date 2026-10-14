import {Agent} from '@earendil-works/pi-agent-core';
import {createAssistantMessageEventStream,type AssistantMessage,type Model} from '@earendil-works/pi-ai';
import type {CallOutcome} from './receipts.ts';
import {cacheUsage,estimateFlashUsd} from './pricing.ts';

export const PI_RUNTIME_VERSION='1.2.0';

/** One clean Pi agent per article task, custom transport retains native usage and receipt semantics. */
export async function piAgentRequest(input:{body:Record<string,unknown>;baseUrl:string;apiKey:string;effort:'none'|'low'|'high';send:(body:Record<string,unknown>,signal?:AbortSignal)=>Promise<CallOutcome>}):Promise<CallOutcome>{
  const model:Model<'openai-completions'>={id:String(input.body.model),name:'Info-Hub DeepSeek',api:'openai-completions',provider:'deepseek',baseUrl:input.baseUrl,
    reasoning:true,input:['text'],contextWindow:1000000,maxTokens:Number(input.body.max_tokens),cost:{input:0.15,output:0.60,cacheRead:0.003,cacheWrite:0.15}};
  const messages=input.body.messages as Array<{role:string;content:string}>;
  const system=messages.find(m=>m.role==='system')?.content??'';
  const user=messages.find(m=>m.role==='user')?.content;
  if(typeof user!=='string')throw new Error('Pi editorial runtime requires one text-only article task');
  let outcome:CallOutcome|undefined,failure:unknown,requests=0;
  const agent=new Agent({
    initialState:{model,systemPrompt:system,thinkingLevel:input.effort==='none'?'off':input.effort,tools:[]},
    getApiKey:()=>input.apiKey,
    finishTurn:()=>({action:'end'}),
    streamFn:(_model,context,options)=>{
      const stream=createAssistantMessageEventStream();
      const message:AssistantMessage={role:'assistant',content:[],api:model.api,provider:model.provider,model:model.id,timestamp:Date.now(),stopReason:'stop',
        usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}};
      void (async()=>{
        try{
          if(++requests!==1)throw new Error('Pi task attempted more than one provider call');
          if(options?.apiKey!==input.apiKey)throw new Error('Pi credential resolution mismatch');
          const wire=context.messages.map(m=>{
            if(m.role!=='system'&&m.role!=='user')throw new Error('Pi editorial task attempted transcript carry-over');
            return {role:m.role,content:typeof m.content==='string'?m.content:m.content.map(c=>c.type==='text'?c.text:'').join('')};
          });
          if(JSON.stringify(wire)!==JSON.stringify(messages))throw new Error('Pi transcript differs from the reserved request');
          outcome=await input.send({...input.body,messages:wire},options?.signal);
          const raw=outcome.response as {choices?:Array<{message?:{content?:string};finish_reason?:string}>};
          const u=outcome.usage??{};
          message.content=[{type:'text',text:raw.choices?.[0]?.message?.content??''}];
          message.stopReason=raw.choices?.[0]?.finish_reason==='length'?'length':'stop';
          const cache=cacheUsage(u),output=Number(u.completion_tokens??0);
          message.usage={...message.usage,input:cache.miss,output,cacheRead:cache.hit,totalTokens:Number(u.total_tokens??(cache.miss+cache.hit+output)),
            cost:{input:cache.miss*0.15/1e6,output:output*0.60/1e6,cacheRead:cache.hit*0.003/1e6,cacheWrite:0,total:estimateFlashUsd(u)??0}};
          stream.push({type:'done',reason:message.stopReason,message});
        }catch(error){failure=error;message.stopReason='error';message.errorMessage='Editorial provider request failed';stream.push({type:'error',reason:'error',error:message});}
      })();
      return stream;
    },
  });
  await agent.prompt([{role:'user',content:user,timestamp:Date.now()}]);
  await agent.waitForIdle();
  if(failure)throw failure;
  if(!outcome)throw new Error('Pi task ended without a provider response');
  return outcome;
}
