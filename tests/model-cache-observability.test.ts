import {tag} from './setup.ts';
import assert from 'node:assert/strict';
import {after,afterEach,test} from 'node:test';
import {sql,closeDb} from '@aihot/backend/db';
import {modelsOverview} from '@aihot/backend/admin/models';
import {rejectReceivedResponse} from '@aihot/backend/providers/receipts';

const version=`cache-observe-${tag()}`;
afterEach(async()=>{await sql`DELETE FROM receipts WHERE request->>'promptVersion'=${version}`;});
after(async()=>{await closeDb();});
async function fixture(usage:unknown,extra:Record<string,unknown>={},cost=0.1,basis='estimated'){
 const request={promptVersion:version,runtime:'pi-agent-core',runtimeVersion:'1.2.0',reasoningEffort:'low',templateHash:'fixed',promptAudit:{version:'prompt-audit-v1',prefixChars:800},...extra};
 const [r]=await sql`INSERT INTO receipts(logical_key,service,model,purpose,status,request,attempts) VALUES(${tag()},'deepseek','deepseek-flash','score_article','received',${sql.json(request)},1) RETURNING id`;
 await sql`INSERT INTO receipt_attempts(receipt_id,attempt,service,model,status,usage,cost,currency,cost_basis,latency_ms) VALUES(${r!.id},1,'deepseek','deepseek-flash','received',${sql.json(usage as never)},${cost},'USD',${basis},100)`;
 return Number(r!.id);
}

test('invalid output keeps its charged usage and marks only the current attempt unusable',async()=>{
 const id=await fixture({prompt_tokens:1000,completion_tokens:100,prompt_cache_hit_tokens:640,prompt_cache_miss_tokens:360});
 await rejectReceivedResponse(id,'unusable output: bad JSON',1);
 const [a]=await sql`SELECT status,usage,cost,error FROM receipt_attempts WHERE receipt_id=${id}`;
 assert.equal(a!.status,'failed');assert.equal(a!.usage.prompt_tokens,1000);assert.equal(Number(a!.cost),0.1);assert.match(a!.error,/unusable output/);
 // Later attempts must not rewrite the earlier paid evidence.
 await sql`INSERT INTO receipt_attempts(receipt_id,attempt,service,model,status,usage,cost,currency,cost_basis) VALUES(${id},2,'deepseek','deepseek-flash','received',${sql.json({prompt_tokens:2000})},0.1,'USD','estimated')`;
 await sql`UPDATE receipts SET status='received',attempts=2 WHERE id=${id}`;
 await rejectReceivedResponse(id,'unusable output: second answer',2);
 const rows=await sql`SELECT attempt,error FROM receipt_attempts WHERE receipt_id=${id} ORDER BY attempt`;
 assert.match(rows[0]!.error,/bad JSON/);assert.match(rows[1]!.error,/second answer/);
});

test('native cache coverage and reasoning remain explicit; malformed counters do not crash aggregation',async()=>{
 const bad=await fixture({prompt_tokens:1000,completion_tokens:100,prompt_cache_hit_tokens:640,prompt_cache_miss_tokens:360});
 await rejectReceivedResponse(bad,'unusable output: fixture',1);
 const otherBad=await fixture({prompt_tokens:2000});await rejectReceivedResponse(otherBad,'unusable output: fixture',1);
 await fixture({prompt_tokens:1000,completion_tokens:100,prompt_cache_hit_tokens:640,prompt_cache_miss_tokens:360,completion_tokens_details:{reasoning_tokens:60}});
 await fixture({prompt_tokens:2000,completion_tokens:200}, {},0.2,'actual');
 await fixture({prompt_tokens:1000,completion_tokens:100,prompt_cache_hit_tokens:'not-a-number'});
 await fixture({prompt_tokens:1000,completion_tokens:100,prompt_cache_hit_tokens:50.5,prompt_cache_miss_tokens:949.5});
 await fixture({prompt_tokens:'bad',completion_tokens:-2,prompt_cache_hit_tokens:64});
 await fixture({prompt_tokens:12000,completion_tokens:100,prompt_cache_hit_tokens:8000,prompt_cache_miss_tokens:4000,completion_tokens_details:{reasoning_tokens:101}},{runtimeVersion:'1.3.0'});
 const overview=await modelsOverview(1),rows=overview.capabilities.find(c=>c.key==='score')!.usage.filter(u=>u.promptVersion===version);
 const small=rows.find(u=>u.runtimeVersion==='1.2.0'&&u.inputBand==='0-2k')!;
 assert.ok(small);assert.equal(small.calls,6);assert.equal(small.ok,4);assert.equal(small.failed,2);
 assert.equal(small.cacheKnownCalls,2);assert.equal(small.cacheUnknownCalls,4);
 assert.equal(small.cacheKnownInput,2000);assert.equal(small.cachedInput,1280);assert.equal(small.uncachedInput,720);assert.equal(small.cacheHitRate,0.64);
 assert.equal(small.reasoningTokens,60);assert.equal(small.reasoningKnownCalls,1);
 assert.equal(small.fixedPrefixChars,800);assert.equal(small.estimatedCost,0.5);assert.equal(small.actualCost,0.2);
 const unknown=rows.find(u=>u.inputBand==='unknown')!;assert.equal(unknown.cacheHitRate,null);assert.equal(unknown.reasoningTokens,null);
 const large=rows.find(u=>u.runtimeVersion==='1.3.0')!;assert.equal(large.inputBand,'8k-32k');assert.equal(large.reasoningTokens,null);
});

test('a delayed rejection of an old response cannot fail a pending or successful retry',async()=>{
 const id=await fixture({prompt_tokens:1000,completion_tokens:100});
 await rejectReceivedResponse(id,'unusable output: first answer',1);
 await sql`UPDATE receipts SET status='pending',attempts=2 WHERE id=${id}`;
 await sql`INSERT INTO receipt_attempts(receipt_id,attempt,service,model,status) VALUES(${id},2,'deepseek','deepseek-flash','pending')`;
 await rejectReceivedResponse(id,'unusable output: delayed old answer',1);
 let [r]=await sql`SELECT status FROM receipts WHERE id=${id}`;assert.equal(r!.status,'pending');
 await sql`UPDATE receipts SET status='completed' WHERE id=${id}`;
 await sql`UPDATE receipt_attempts SET status='received' WHERE receipt_id=${id} AND attempt=2`;
 await rejectReceivedResponse(id,'unusable output: delayed old answer',1);
 [r]=await sql`SELECT status FROM receipts WHERE id=${id}`;assert.equal(r!.status,'completed');
 const [a]=await sql`SELECT status FROM receipt_attempts WHERE receipt_id=${id} AND attempt=2`;assert.equal(a!.status,'received');
 await sql`DELETE FROM receipts WHERE id=${id}`;
});
