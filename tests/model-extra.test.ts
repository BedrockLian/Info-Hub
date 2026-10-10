import './setup.ts';
import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {z} from 'zod';
const {chatJson}=await import('@aihot/backend/providers/llm');
const {sql}=await import('@aihot/backend/db');
const {config}=await import('@aihot/backend/config');
process.env.LLM_BASE_URL='https://api.deepseek.com/v1';
process.env.LLM_API_KEY='test-unused';
process.env.LLM_MODEL='deepseek-flash';
after(async()=>{await sql.end();});
test('extra JSON cannot replace the billed model, messages, output ceiling or number of responses',async()=>{
 for(const key of ['model','messages','max_tokens','max_completion_tokens','stream','n']) {
  process.env.LLM_EXTRA_JSON=JSON.stringify({[key]:'override'});
  await assert.rejects(chatJson({model:'default',purpose:'test',subject:'extra',promptVersion:'test',system:'system',user:'text',schema:z.object({})}),new RegExp(`cannot override ${key}`));
 }
 for(const value of ['null','[]','"text"']){
  process.env.LLM_EXTRA_JSON=value;
  await assert.rejects(chatJson({model:'default',purpose:'test',subject:'extra',promptVersion:'test',system:'system',user:'text',schema:z.object({})}),/JSON object/);
 }
});
test('private mode rejects tools and arbitrary payload extensions before a provider request',async()=>{
 const previous=config.privateSite;config.privateSite=true;
 try {
  for(const key of ['tools','tool_choice','response_format','unknown']){
   process.env.LLM_EXTRA_JSON=JSON.stringify({[key]:{description:'large input'.repeat(1000)}});
   await assert.rejects(chatJson({model:'default',purpose:'test',subject:'extra',promptVersion:'test',system:'system',user:'text',schema:z.object({})}),/does not allow extra parameter/);
  }
 }finally{config.privateSite=previous;delete process.env.LLM_EXTRA_JSON;}
});
