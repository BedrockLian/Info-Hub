import './setup.ts';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {after,test} from 'node:test';
process.env.PRIVATE_SITE='true';
const {sql}=await import('@aihot/backend/db');
const {upsertMaterial}=await import('@aihot/backend/content/materials');
const {publishArticle}=await import('@aihot/backend/publication/publish');
const {selectedChanges,selectedSnapshot}=await import('@aihot/backend/publication/v1');
const {loadStoryDetail}=await import('@aihot/backend/publication/stories');
const {loadReport,v1Daily,v1Dailies}=await import('@aihot/backend/publication/reports');
after(async()=>{const {stopBoss}=await import('@aihot/backend/jobs/queue');await stopBoss();await sql.end();});
test('withdrawal removes old prose from story, daily, cached index and historical sync payloads',async()=>{
 const key=`derived-${Date.now()}`;
 const secret=`EXCLUDED-${key}`;
 await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at) VALUES (${key},'Test','rss','T2','editorial','2100-01-01')`;
 const [story]=await sql`INSERT INTO stories (public_id,title,summary,digest,latest,first_report_at,latest_at) VALUES (${randomUUID()},${secret},${secret},${secret},${secret},now(),now()) RETURNING id`;
 const [fact]=await sql`INSERT INTO facts (public_id,story_id,title) VALUES (${key},${story.id},${secret}) RETURNING id`;
 const snapshot=await selectedSnapshot({limit:100,fields:'default',page:null});
 const ids:string[]=[];
 for(const [suffix,text] of [['a',secret],['b','可保留报道']]){
  const {articleId}=await upsertMaterial({sourceId:key,url:`https://example.com/${key}/${suffix}`,title:text!,bodyStatus:'ok',bodyText:text!,via:'fetch'});
  ids.push(articleId);
  await sql`INSERT INTO analyses (article_id,input_revision,origin,relevance,title_zh,summary_zh,selected,score) VALUES (${articleId},1,'rule','pass',${text!},${text!},true,90)`;
  await sql`INSERT INTO fact_articles (fact_id,article_id,role) VALUES (${fact.id},${articleId},'report')`;
  await publishArticle(articleId,{releasedAt:new Date(Date.now()-60000)});
 }
 const content={lead:{title:secret,leadParagraph:secret},sections:[{label:'国际时事',items:ids.map((itemId,i)=>({itemId,title:i? '可保留报道':secret,summary:i?'保留摘要':secret}))}],flashes:[]};
 await sql`INSERT INTO reports (kind,key,window_start,window_end,content,generated_at,model,origin) VALUES ('daily','2099-12-31',now()-interval '1 day',now(),${sql.json(content)},now(),'test','model') ON CONFLICT (kind,key) DO UPDATE SET content=excluded.content`;
 await v1Dailies(10); // prime the index before withdrawal
 await sql`INSERT INTO editorial_overrides (article_id,fields,reason) VALUES (${ids[0]!},${sql.json({relevance:'block'})},'排除')`;
 await publishArticle(ids[0]!);
 for(const result of [await loadStoryDetail(story.id),await loadReport('daily','2099-12-31'),await v1Daily('2099-12-31'),await v1Dailies(10),await selectedChanges({cursor:snapshot.cursor,limit:100})]){
  assert.ok(!JSON.stringify(result).includes(secret),JSON.stringify(result));
 }
});
