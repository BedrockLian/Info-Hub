import './setup.ts';
import assert from 'node:assert/strict';
import {after, test} from 'node:test';
import type {PgBoss} from 'pg-boss';
import {sql} from '@aihot/backend/db';
import {upsertMaterial} from '@aihot/backend/content/materials';
import {processArticle,queueProcessing,registerExtractionJobs,requeueFailed,sweepUnprocessed} from '@aihot/backend/jobs/content';
import {stopBoss} from '@aihot/backend/jobs/queue';
import {runsOverview} from '@aihot/backend/admin/runs';
import {collectFindings} from '@aihot/backend/operations/alerts';
import {fetchItemsByIds} from '@aihot/backend/publication/items';
import {stub,tag} from './setup.ts';

const sourceId=`pause-${tag()}`;
after(async()=>{try{await stopBoss();await sql`DELETE FROM receipts WHERE purpose=${sourceId}`;await sql`DELETE FROM articles WHERE source_id=${sourceId}`;await sql`DELETE FROM sources WHERE id=${sourceId}`;}finally{await sql.end();}});

test('a disabled source pauses queued analysis and extraction without losing retries, articles or paid receipts; enabling resumes new work',async()=>{
 const server=await stub(()=>({unexpected:'network request'}));
 try{
  await sql`INSERT INTO sources(id,name,kind,enabled,config) VALUES(${sourceId},'Pause fixture','rss',false,'{}')`;
  const {articleId}=await upsertMaterial({sourceId,url:`${server.url}/article`,title:'A paused research article',bodyText:null,excerpt:null,via:'fetch',publishedAt:new Date()});
  await sql`UPDATE articles SET processing_state='new',processing_attempts=2,processing_error='retained-error',processing_queued_at=now(),created_at=now()-interval '1 hour' WHERE id=${articleId}`;
  const [receipt]=await sql`INSERT INTO receipts(logical_key,service,purpose,subject,status,attempts) VALUES(${tag()},'llm',${sourceId},${`article:${articleId}@1`},'received',1) RETURNING id`;
  await sql`INSERT INTO receipt_attempts(receipt_id,attempt,service,status,usage,cost,currency,cost_basis) VALUES(${receipt!.id},1,'llm','received','{"prompt_tokens":100}',0.01,'USD','estimated')`;
  const before=await sql`SELECT * FROM receipt_attempts WHERE receipt_id=${receipt!.id}`;
  assert.deepEqual(await processArticle(articleId),{state:'paused'});
  assert.equal(await queueProcessing(articleId),null);
  let extract: ((jobs:Array<{data:{articleId:string}}>)=>Promise<unknown>)|undefined;
  const fake={work:async(_name:string,_options:unknown,handler:typeof extract)=>{extract=handler;}};
  await registerExtractionJobs(fake as unknown as PgBoss);
  assert.ok(extract);
  assert.deepEqual(await extract([{data:{articleId}}]),{state:'paused'});
  await sweepUnprocessed();
  const [paused]=await sql`SELECT processing_state,processing_attempts,processing_error,processing_queued_at FROM articles WHERE id=${articleId}`;
  assert.equal(paused.processing_state,'new');assert.equal(paused.processing_attempts,2);assert.equal(paused.processing_error,'retained-error');assert.equal(paused.processing_queued_at,null);
  assert.equal(server.hits(),0);
  assert.deepEqual(await sql`SELECT * FROM receipt_attempts WHERE receipt_id=${receipt!.id}`,before);
  await sql`UPDATE sources SET enabled=true WHERE id=${sourceId}`;
  assert.ok(await queueProcessing(articleId));
  const [resumed]=await sql`SELECT processing_queued_at FROM articles WHERE id=${articleId}`;
  assert.ok(resumed.processing_queued_at);
 }finally{await server.close();}
});

test('bulk retry excludes failures from disabled sources and preserves their recovery evidence',async()=>{
 await sql`UPDATE sources SET enabled=false WHERE id=${sourceId}`;
 const {articleId}=await upsertMaterial({sourceId,url:`https://pause.example/${tag()}`,title:'Preserved failure',bodyText:'A retained article body',via:'fetch',publishedAt:new Date()});
 const reason='paused source recovery fixture';
 await sql`UPDATE articles SET processing_state='failed',processing_attempts=3,processing_error=${reason} WHERE id=${articleId}`;
 assert.deepEqual(await requeueFailed(reason),{requeued:0});
 const [row]=await sql`SELECT processing_state,processing_attempts,processing_error FROM articles WHERE id=${articleId}`;
 assert.equal(row.processing_state,'failed');assert.equal(row.processing_attempts,3);assert.equal(row.processing_error,reason);
 await sql`UPDATE sources SET enabled=true WHERE id=${sourceId}`;
 assert.deepEqual(await requeueFailed(reason),{requeued:1});
});

test('paused backlog is reported separately, does not trigger processing alerts, and keeps published history readable',async()=>{
 await sql`UPDATE sources SET enabled=false WHERE id=${sourceId}`;
 for(let n=0;n<10;n++)await upsertMaterial({sourceId,url:`https://pause.example/alert/${tag()}`,title:'Paused backlog',bodyText:'Saved article',via:'fetch'});
 await sql`UPDATE articles SET discovered_at=now()-interval '3 hours' WHERE source_id=${sourceId}`;
 const overview=await runsOverview();
 assert.ok(overview.processing.pausedPending>=10);
 const saved=process.env.COLLECT_ENABLED;
 try{process.env.COLLECT_ENABLED='true';assert.ok(!(await collectFindings()).some(f=>f.key==='content.process'));}
 finally{if(saved===undefined)delete process.env.COLLECT_ENABLED;else process.env.COLLECT_ENABLED=saved;}
 const [article]=await sql`SELECT id,url,discovered_at FROM articles WHERE source_id=${sourceId} LIMIT 1`;
 await sql`INSERT INTO publications(article_id,source_id,title,summary,category,channel,url,discovered_at,timeline_at,sort_at,eligible) VALUES(${article!.id},${sourceId},'保留的历史报道','已发布的中文摘要','technology','news',${article!.url},${article!.discovered_at},${article!.discovered_at},${article!.discovered_at},true)`;
 const history=await fetchItemsByIds([article!.id]);
 assert.equal(history.get(article!.id)?.title,'保留的历史报道');
 assert.equal(history.get(article!.id)?.eligible,true);
});
