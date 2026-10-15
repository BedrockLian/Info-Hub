import type {PgBoss} from 'pg-boss';
import {ensureQueue,enqueue,QUEUES} from './queue.ts';
import {runDeferred} from './defer.ts';
import {enrichDaily} from '../reports/daily.ts';
export async function registerReportJobs(boss:PgBoss){
 await ensureQueue(QUEUES.reportEnrich);
 await boss.work<{date:string}>(QUEUES.reportEnrich,{localConcurrency:1,pollingIntervalSeconds:2},async([job])=>{
  if(!job)return;
  return runDeferred(()=>enrichDaily(job.data.date),seconds=>enqueue(QUEUES.reportEnrich,{date:job.data.date},{singletonKey:job.data.date,startAfter:seconds}));
 });
}
