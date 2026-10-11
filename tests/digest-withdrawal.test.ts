import {stub,gate,tag} from './setup.ts';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {after,test} from 'node:test';
import {sql} from '@aihot/backend/db';
import {config} from '@aihot/backend/config';
import {upsertMaterial} from '@aihot/backend/content/materials';
import {publishArticle} from '@aihot/backend/publication/publish';
import {composeStoryDigest} from '@aihot/backend/events/digest';
import {stopBoss} from '@aihot/backend/jobs/queue';
const key=`digest-${tag()}`,secret=`EXCLUDED-${key}`;
let hold:ReturnType<typeof gate>|null=null,asked=gate(),lastPrompt='';
const provider=await stub(async(hit,req)=>{
 lastPrompt=req.body;asked.open();if(hold)await hold.promise;
 return {choices:[{message:{content:JSON.stringify({title:hit===1?secret:'保留事件',digest:hit===1?secret:'仅依据可保留报道写成的事件综述',latest:'保留进展'})}}],usage:{prompt_tokens:10,completion_tokens:10}};
});
process.env.DEEPSEEK_BASE_URL=provider.url;process.env.DEEPSEEK_API_KEY='test';
after(async()=>{await provider.close();await stopBoss();await sql.end();});
test('removed evidence is not carried into rewrites and withdrawal during writing discards the obsolete result',async()=>{
 await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at) VALUES (${key},'Test','rss','T2','editorial','2100-01-01')`;
 const [story]=await sql`INSERT INTO stories (public_id,title,first_report_at,latest_at) VALUES (${randomUUID()},${secret},now(),now()) RETURNING id`;
 const [fact]=await sql`INSERT INTO facts (public_id,story_id,title) VALUES (${key},${story.id},${secret}) RETURNING id`;
 const ids:string[]=[];
 for(const text of [secret,'可保留报道']){
  const {articleId}=await upsertMaterial({sourceId:key,url:`https://example.com/${key}/${ids.length}`,title:text,bodyText:text,bodyStatus:'ok',via:'fetch'});ids.push(articleId);
  await sql`INSERT INTO analyses (article_id,input_revision,origin,relevance,title_zh,summary_zh,selected) VALUES (${articleId},1,'rule','pass',${text},${text},false)`;
  await sql`INSERT INTO fact_articles (fact_id,article_id,role) VALUES (${fact.id},${articleId},'report')`;
  await publishArticle(articleId);
 }
 assert.equal((await composeStoryDigest(story.id)).updated,true);
 config.privateSite=true;
 await sql`INSERT INTO editorial_overrides (article_id,fields) VALUES (${ids[0]!},${sql.json({relevance:'block'})})`;
 await publishArticle(ids[0]!);config.privateSite=false;
 assert.equal((await composeStoryDigest(story.id)).updated,true);
 assert.ok(!lastPrompt.includes(secret));
 await sql`UPDATE publications SET summary='修正后的保留摘要' WHERE article_id=${ids[1]!}`;
 hold=gate();asked=gate();
 const writing=composeStoryDigest(story.id);await asked.promise;
 config.privateSite=true;
 await sql`INSERT INTO editorial_overrides (article_id,fields) VALUES (${ids[1]!},${sql.json({relevance:'block'})})`;
 await publishArticle(ids[1]!);config.privateSite=false;hold.open(undefined);
 assert.equal((await writing).updated,false);
 const [live]=await sql`SELECT digest,latest FROM stories WHERE id=${story.id}`;
 assert.equal(live.digest,null);assert.equal(live.latest,null);
});
