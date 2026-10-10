import './setup.ts';
import assert from 'node:assert/strict';
import {after,test} from 'node:test';
const {sql}=await import('@aihot/backend/db');
const {paidRequest,BudgetExceededError}=await import('@aihot/backend/providers/receipts');
const {config}=await import('@aihot/backend/config');
const service=`money-test-${Date.now()}`;
after(async()=>{await sql`DELETE FROM receipt_attempts WHERE service = ${service}`;await sql`DELETE FROM receipts WHERE service = ${service}`;await sql.end();});
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
