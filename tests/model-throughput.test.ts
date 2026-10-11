import {tag} from './setup.ts';
import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {existsSync,readFileSync} from 'node:fs';
import {sql,closeDb} from '@aihot/backend/db';
import {paidRequest,BudgetExceededError} from '@aihot/backend/providers/receipts';
import {config} from '@aihot/backend/config';

const repair=new URL('../database/migrations/0042_model_throughput_and_recovery.sql',import.meta.url);
after(closeDb);
test('500 cheap calls do not exhaust the money budget; migration preserves operator limits and recovers only eligible failures',async()=>{
 const key=`throughput-${tag()}`;
 const [saved]=await sql`SELECT * FROM budgets WHERE service='llm'`;
 try {
  await sql`UPDATE budgets SET per_minute=10,per_hour=100,per_day=500 WHERE service='llm'`;
  await sql`INSERT INTO sources (id,name,kind,tier) VALUES (${key},'Throughput test','rss','T2')`;
  for (const [suffix,state,error] of [['402','failed','HTTP 402: insufficient balance'],['other','failed','HTTP 403: forbidden'],['day','new','Budget for llm exhausted (day)'],['money','new','Budget for llm exhausted (USD rolling 24h)']]) {
   await sql`INSERT INTO articles (id,source_id,identity_key,url,title,discovered_at,timeline_at,processing_state,processing_error,processing_attempts,processing_retry_at)
    VALUES (${`${key}-${suffix}`},${key},${`${key}-${suffix}`},${`https://example.org/${key}/${suffix}`},'Test',now(),now(),${state!},${error!},1,now()+interval '1 hour')`;
  }
  const [fixture]=await sql`INSERT INTO receipts (logical_key,service,purpose,subject,status,attempts) VALUES (${key},'llm','throughput-fixture',${key},'completed',500) RETURNING id`;
  await sql`INSERT INTO receipt_attempts (receipt_id,attempt,service,status,started_at,budget_charge_usd)
    SELECT ${fixture!.id},n,'llm','received',now()-interval '2 hours',0.0002 FROM generate_series(1,500) n`;
  if(existsSync(repair))await sql.unsafe(readFileSync(repair,'utf8'));
  let sent=0;
  await paidRequest({service:'llm',purpose:'throughput-test',subject:key,identity:{key},maxCostUsd:0.01},async()=>{
   sent++;return {response:{ok:true},cost:{amount:0.001,currency:'USD',basis:'estimated'}};
  });
  assert.equal(sent,1);
  await assert.rejects(paidRequest({service:'llm',purpose:'throughput-test',subject:key,identity:{key,overMoney:true},maxCostUsd:config.modelBudgetDayUsd},async()=>assert.fail('money limit must still prevent sending')),
   (error:unknown)=>error instanceof BudgetExceededError && error.message.includes('USD rolling 24h'));
  const rows=await sql`SELECT id,processing_state,processing_attempts,processing_retry_at FROM articles WHERE source_id=${key}`;
  const row=(suffix:string)=>rows.find(r=>r.id===`${key}-${suffix}`)!;
  assert.equal(row('402').processing_state,'new');
  assert.equal(row('402').processing_attempts,0);
  assert.equal(row('other').processing_state,'failed');
  assert.equal(row('day').processing_retry_at,null);
  assert.ok(row('money').processing_retry_at);
  await sql`UPDATE budgets SET per_day=0 WHERE service='llm'`;
  await sql.unsafe(readFileSync(repair,'utf8'));
  await assert.rejects(paidRequest({service:'llm',purpose:'throughput-test',subject:key,identity:{key,stopped:true},maxCostUsd:0.01},async()=>assert.fail('operator stop must remain effective')),BudgetExceededError);
  await sql`UPDATE budgets SET per_minute=20,per_day=500 WHERE service='llm'`;
  await sql.unsafe(readFileSync(repair,'utf8'));
  const [custom]=await sql`SELECT per_day FROM budgets WHERE service='llm'`;
  assert.equal(custom!.per_day,500,'custom operator limits are not overwritten');
 } finally {
  await sql`DELETE FROM receipts WHERE subject=${key}`;
  await sql`DELETE FROM articles WHERE source_id=${key}`;
  await sql`DELETE FROM sources WHERE id=${key}`;
  await sql`UPDATE budgets SET per_minute=${saved!.per_minute},per_hour=${saved!.per_hour},per_day=${saved!.per_day},note=${saved!.note} WHERE service='llm'`;
 }
});
