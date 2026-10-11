import './setup.ts';
import assert from 'node:assert/strict';
import {after,test} from 'node:test';
process.env.PRIVATE_SITE='true';
process.env.DEV_AUTH_ROLE='admin';
const {sql}=await import('@aihot/backend/db');
const {upsertMaterial}=await import('@aihot/backend/content/materials');
const {publishArticle}=await import('@aihot/backend/publication/publish');
const {overrideFields}=await import('@aihot/backend/admin/content');
const {buildApp}=await import('../apps/api/src/app.ts');
const app=await buildApp();
const source=`personal-${Date.now()}`;
after(async()=>{await app.close();const {stopBoss}=await import('@aihot/backend/jobs/queue');await stopBoss();await sql.end();});
test('excluded, pending review and unprocessed material cannot escape through details, exports, feeds or search; audited approval releases it',async()=>{
 await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at) VALUES (${source},'Personal test','rss','T2','editorial','2100-01-01')`;
 for(const disposition of ['exclude','review','unprocessed']) {
  const {articleId:id}=await upsertMaterial({sourceId:source,url:`https://example.com/${source}/${disposition}`,title:`PRIVATE-${source}`,bodyStatus:'ok',bodyText:'Test material',via:'fetch'});
  if(disposition!=='unprocessed')await sql`INSERT INTO analyses (article_id,input_revision,origin,relevance,title_zh,summary_zh,selected,score,output)
   VALUES (${id},1,'model','pass','待审标题','待审摘要',true,90,${sql.json({prefilter:{personalDisposition:disposition,personalReason:'test',personalEvidence:['Test material']}})})`;
  await publishArticle(id,{releasedAt:new Date(Date.now()-60000)});
  for(const path of [`/api/site/items/${id}`,`/api/v1/items/${id}`,`/items/${id}/markdown`]) assert.equal((await app.inject({url:path})).statusCode,404,path);
  for(const path of ['/feed.xml','/api/v1/items?mode=all','/api/site/pool?q=PRIVATE'])assert.ok(!(await app.inject({url:path})).body.includes(id),path);
  if(disposition==='review') {
   await overrideFields(id,{fields:{relevance:'pass',title:'人工确认标题',summary:'人工确认摘要'},version:0,reason:'逐篇检查后确认仅引述官方观点'},'dev:test');
   assert.equal((await app.inject({url:`/api/site/items/${id}`})).statusCode,200);
   const [audit]=await sql`SELECT 1 FROM audit_log WHERE subject = ${`content:${id}`} AND action='content.override'`;
   assert.ok(audit);
  }
 }
});
