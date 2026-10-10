import './setup.ts';
import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {readFileSync} from 'node:fs';
const {sql}=await import('@aihot/backend/db');
const {paidRequest,BudgetExceededError,ProviderRejectedError}=await import('@aihot/backend/providers/receipts');
const {config}=await import('@aihot/backend/config');
const service=`money-test-${Date.now()}`;
after(async()=>{await sql`DELETE FROM receipt_attempts WHERE service = ${service}`;await sql`DELETE FROM receipts WHERE service = ${service}`;await sql.end();});
test('HTTP 402 releases money, server errors retain reserves, and rejected requests count against request limits',async()=>{
 const rejectedService=`${service}-rejected`;
 const saved={day:config.modelBudgetDayUsd,month:config.modelBudgetMonthUsd};
 config.modelBudgetDayUsd=10;config.modelBudgetMonthUsd=10;
 try {
  await sql`INSERT INTO budgets (service,per_minute,per_hour,per_day) VALUES (${rejectedService},1,100,500)`;
  const request={service:rejectedService,purpose:'budget-test',identity:{rejectedService},maxCostUsd:0.06};
  await assert.rejects(paidRequest(request,async()=>{throw new ProviderRejectedError('HTTP 402: insufficient balance',402,false);}),ProviderRejectedError);
  const [attempt]=await sql<{status:string;charge:string}[]>`SELECT status,budget_charge_usd AS charge FROM receipt_attempts WHERE service=${rejectedService}`;
  assert.equal(attempt!.status,'failed');
  assert.equal(Number(attempt!.charge),0);
  await assert.rejects(paidRequest(request,async()=>{assert.fail('request limit must prevent sending');}),BudgetExceededError);
  await sql`UPDATE budgets SET per_minute=3 WHERE service=${rejectedService}`;
  await assert.rejects(paidRequest({...request,identity:{rejectedService,serverError:true},maxCostUsd:0.02},async()=>{
   throw new ProviderRejectedError('HTTP 503: service unavailable',503,true);
  }),ProviderRejectedError);
  const [serverError]=await sql<{charge:string}[]>`SELECT budget_charge_usd AS charge FROM receipt_attempts WHERE service=${rejectedService} AND error LIKE 'HTTP 503:%'`;
  assert.equal(Number(serverError!.charge),0.02,'server errors retain the conservative reserve');
  await sql`DELETE FROM receipt_attempts WHERE service=${rejectedService} AND error LIKE 'HTTP 503:%'`;
  // Simulate the historical reservation, then verify the repair leaves unknown outcomes alone.
  const repair=readFileSync(new URL('../database/migrations/0041_release_rejected_model_reservations.sql',import.meta.url),'utf8');
  await sql`UPDATE receipt_attempts SET service='llm',status='unknown',budget_charge_usd=0.06 WHERE service=${rejectedService}`;
  await sql.unsafe(repair);
  const [unknown]=await sql<{charge:string}[]>`SELECT budget_charge_usd AS charge FROM receipt_attempts WHERE receipt_id IN (SELECT id FROM receipts WHERE service=${rejectedService})`;
  assert.equal(Number(unknown!.charge),0.06);
  await sql`UPDATE receipt_attempts SET status='failed' WHERE receipt_id IN (SELECT id FROM receipts WHERE service=${rejectedService})`;
  await sql.unsafe(repair);
  const [repaired]=await sql<{charge:string}[]>`SELECT budget_charge_usd AS charge FROM receipt_attempts WHERE receipt_id IN (SELECT id FROM receipts WHERE service=${rejectedService})`;
  assert.equal(Number(repaired!.charge),0);
 } finally {
  config.modelBudgetDayUsd=saved.day;config.modelBudgetMonthUsd=saved.month;
  await sql`DELETE FROM receipt_attempts WHERE receipt_id IN (SELECT id FROM receipts WHERE service=${rejectedService})`;
  await sql`DELETE FROM receipts WHERE service=${rejectedService}`;
  await sql`DELETE FROM budgets WHERE service=${rejectedService}`;
 }
});
test('parallel calls reserve money before sending; unknown attempts keep their reserve and reuse does not spend again',async()=>{
 const saved={day:config.modelBudgetDayUsd,month:config.modelBudgetMonthUsd};
 config.modelBudgetDayUsd=0.10;config.modelBudgetMonthUsd=0.20;
 let sent=0;
 const request=(n:number)=>({service,purpose:'budget-test',identity:{n,service},maxCostUsd:0.06});
 try {
  const results=await Promise.allSettled([1,2].map(n=>paidRequest(request(n),async()=>{sent++;throw Error('unknown after sending');})));
  assert.equal(sent,1);
  assert.ok(results.some(r=>r.status==='rejected' && r.reason instanceof BudgetExceededError));
  await sql`UPDATE receipt_attempts SET started_at = now() - interval '2 days' WHERE service = ${service}`;
  await paidRequest(request(3),async()=>({response:{ok:true},cost:{amount:0.01,currency:'USD',basis:'estimated'}}));
  const again=await paidRequest(request(3),async()=>{sent++;return {response:{}};});
  assert.equal(again.reused,true);assert.equal(sent,1);
  await sql`UPDATE receipt_attempts SET budget_charge_usd = 0.19, started_at = now() - interval '2 days' WHERE service = ${service} AND status='unknown'`;
  await assert.rejects(paidRequest(request(4),async()=>{sent++;return {response:{}};}),BudgetExceededError);
  assert.equal(sent,1);
 } finally {config.modelBudgetDayUsd=saved.day;config.modelBudgetMonthUsd=saved.month;}
});
