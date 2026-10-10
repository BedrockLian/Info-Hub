import assert from 'node:assert/strict';
import {test} from 'node:test';
import {modelWindow} from '../packages/backend/src/providers/off-peak.ts';

test('DeepSeek weekday peaks and safety margins defer to the next valley; weekends remain available',()=>{
 for(const at of ['2026-10-12T01:00:00Z','2026-10-12T03:59:59Z','2026-10-12T06:00:00Z','2026-10-12T09:59:59Z'])assert.equal(modelWindow(new Date(at),120000).allowed,false,at);
 for(const at of ['2026-10-12T00:00:00Z','2026-10-12T04:00:00Z','2026-10-12T05:00:00Z','2026-10-12T10:00:00Z','2026-10-10T02:00:00Z','2026-10-11T07:00:00Z'])assert.equal(modelWindow(new Date(at),120000).allowed,true,at);
 const margin=modelWindow(new Date('2026-10-12T00:58:00Z'),120000);
 assert.equal(margin.allowed,false);assert.equal(margin.retryAfterSeconds,10800+120);
 assert.equal(modelWindow(new Date('2026-10-12T05:58:00Z'),120000).retryAfterSeconds,14400+120);
});

test('deferred event work keeps its next eligible time rather than burning queue retries',async()=>{
 const {runDeferred}=await import('../packages/backend/src/jobs/defer.ts');
 const {BudgetExceededError}=await import('../packages/backend/src/providers/receipts.ts');
 let after=0;
 assert.deepEqual(await runDeferred(async()=>{throw new BudgetExceededError('deepseek','off-peak schedule',7200);},async seconds=>{after=seconds;}),{deferred:true});
 assert.equal(after,7200);
 await assert.rejects(runDeferred(async()=>{throw Error('real failure');},async()=>{}),/real failure/);
});
