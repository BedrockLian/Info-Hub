import {stub,gate,tag} from './setup.ts';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {after,test,mock} from 'node:test';
import {sql,closeDb} from '@aihot/backend/db';
import {config} from '@aihot/backend/config';
import {upsertMaterial} from '@aihot/backend/content/materials';
import {publishArticle} from '@aihot/backend/publication/publish';
import {composeStoryDigest,digestInputsHash,digestReports} from '@aihot/backend/events/digest';
import {sweepEventWork} from '@aihot/backend/events/maintenance';
import {groupArticle} from '@aihot/backend/events/group';
import {loadStoryDetail} from '@aihot/backend/publication/stories';
import {loadStoryFollowups} from '@aihot/backend/publication/followups';
import {stopBoss,enqueue,QUEUES} from '@aihot/backend/jobs/queue';
import {ModelOutputError} from '@aihot/backend/providers/llm';

const key=`event-org-${tag()}`;
const testStories:number[]=[];
let mode='valid',hold:ReturnType<typeof gate>|null=null,asked=gate();
const requests:Array<{messages:Array<{role:string;content:string}>}>=[];
const provider=await stub(async(_hit,req)=>{
  const body=JSON.parse(req.body);requests.push(body);asked.open();if(hold)await hold.promise;
  const rows=JSON.parse(body.messages.at(-1).content) as Array<{id:string}>;
  let ids=rows.map(r=>r.id),latest=ids.at(-1)!;
  if(mode==='foreign')ids=['not-in-material'];
  if(mode==='duplicate')ids=[ids[0]!,ids[0]!];
  if(mode==='uncited')ids=ids.filter(id=>id!==latest);
  return {choices:[{message:{content:JSON.stringify({title:'学校规定争议与后续回应',digest:'首篇报道记录学校规定引发抗议，后续声明要求保障受影响学生的权利。两篇报道的数字统计范围不同，保留各自来源归属。',latest:'机构发布后续声明',citedArticleIds:ids,latestArticleId:latest})},finish_reason:'stop'}],usage:{prompt_tokens:1000,prompt_cache_hit_tokens:640,prompt_cache_miss_tokens:360,completion_tokens:120}};
});
process.env.DEEPSEEK_BASE_URL=provider.url;process.env.DEEPSEEK_API_KEY='test';
after(async()=>{mock.timers.reset();await provider.close();await stopBoss();await sql`DELETE FROM receipts WHERE purpose='story_digest' AND split_part(split_part(subject,'story:',2),'@',1)=ANY(${testStories.map(String)})`;await closeDb();});

async function fixture(suffix:string,withStory=true,enabled=true) {
 const source=`${key}-${suffix}`;
 await sql`INSERT INTO sources(id,name,kind,tier,participation_mode,enabled,signal_group_id,next_fetch_at) VALUES (${source},${source},'rss','T2','editorial',${enabled},${key},'2100-01-01')`;
 const {articleId}=await upsertMaterial({sourceId:source,url:`https://example.com/${source}`,title:`学校规定引发抗议 ${suffix}`,publishedAt:new Date('2026-10-15T16:00:00Z'),bodyText:'已核验的报道材料',bodyStatus:'ok',via:'fetch'});
 await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,title_zh,summary_zh,selected,category) VALUES (${articleId},1,'rule','pass',${`学校规定引发抗议 ${suffix}`},'报道学校规定引发抗议及后续声明，来源和范围需要分别保留。',false,'public_affairs')`;
 let storyId:number|null=null;
 if(withStory){
  const [s]=await sql`INSERT INTO stories(public_id,title,first_report_at,latest_at) VALUES (${randomUUID()},'学校规定争议',now(),now()) RETURNING id`;storyId=s.id;testStories.push(s.id);
  const [f]=await sql`INSERT INTO facts(public_id,story_id,title) VALUES (${source},${storyId},'学校规定引发抗议') RETURNING id`;
  await sql`INSERT INTO fact_articles(fact_id,article_id,role) VALUES (${f.id},${articleId},'report')`;
 }
 await publishArticle(articleId);return {source,articleId,storyId:storyId!};
}

test('Pi composes an evidence-linked event with stable instructions, a concurrent composer and unchanged input cost nothing',async()=>{
 const a=await fixture('pi');
 const b=await fixture('pi-followup');
 await sql`UPDATE facts SET story_id=${a.storyId} WHERE story_id=${b.storyId}`;
 await sql`UPDATE publications SET published_at=published_at+interval '1 hour' WHERE article_id=${b.articleId}`;
 const realFetch=globalThis.fetch;
 const saved={privateSite:config.privateSite,digest:process.env.DIGEST_MODEL};
 Object.assign(process.env,{DIGEST_MODEL:'default',LLM_MODEL:'deepseek-flash',LLM_BASE_URL:'https://api.deepseek.com/v1',LLM_API_KEY:'test-key'});
 globalThis.fetch=((url,init)=>{assert.equal(String(url),'https://api.deepseek.com/v1/chat/completions');return realFetch(`${provider.url}/v1/chat/completions`,init);}) as typeof fetch;
 config.privateSite=true;mock.timers.enable({apis:['Date'],now:Date.UTC(2026,9,18)});
 try{
  hold=gate();asked=gate();const writing=composeStoryDigest(a.storyId);await asked.promise;
  const hits=provider.hits();assert.equal((await composeStoryDigest(a.storyId)).updated,false);assert.equal(provider.hits(),hits);
  hold.open(undefined);assert.equal((await writing).updated,true);hold=null;
  assert.equal((await composeStoryDigest(a.storyId)).updated,false);assert.equal(provider.hits(),hits);
  const view=await loadStoryDetail(a.storyId);assert.equal(view!.sourceCount,1,'same organization is one independent source');
  assert.equal(view!.latestItemId,b.articleId);assert.equal(view!.digestSources!.length,2);assert.equal(view!.organizationStatus,'ready');
  const followups=await loadStoryFollowups(view!.publicId);
  assert.equal(followups!.items.length,2,'unselected but readable progress remains accessible from article pages');
  const [receipt]=await sql`SELECT request FROM receipts WHERE purpose='story_digest' AND subject=${`story:${a.storyId}@2`} ORDER BY id DESC LIMIT 1`;
  assert.equal(receipt.request.runtime,'pi-agent-core');assert.equal(receipt.request.reasoningEffort,'low');
  const firstSystem=requests.at(-1)!.messages[0]!.content;
  await sql`UPDATE publications SET summary='修订后的报道摘要，明确数字所属地区。',revision=revision+1 WHERE article_id=${a.articleId}`;
  assert.equal((await loadStoryDetail(a.storyId))!.organizationStatus,'stale');
  assert.equal((await composeStoryDigest(a.storyId)).updated,true);
  assert.equal(requests.at(-1)!.messages[0]!.content,firstSystem,'article changes do not alter instruction/schema prefix');
 }finally{hold?.open(undefined);hold=null;mock.timers.reset();config.privateSite=saved.privateSite;process.env.DIGEST_MODEL=saved.digest;globalThis.fetch=realFetch;}
});

test('invalid or duplicate citations and an uncited latest item cannot replace readable event content',async()=>{
 const a=await fixture('invalid');const b=await fixture('invalid-followup');
 await sql`UPDATE facts SET story_id=${a.storyId} WHERE story_id=${b.storyId}`;
 for(mode of ['foreign','duplicate','uncited']){
  await assert.rejects(composeStoryDigest(a.storyId),ModelOutputError);
  const view=await loadStoryDetail(a.storyId);assert.equal(view!.digest,null);assert.ok(view!.excerpt?.text);assert.equal(view!.timeline.length,2);
 }
 mode='valid';assert.equal((await composeStoryDigest(a.storyId)).updated,true);
});

test('a new report arriving during composition discards the old output and preserves the paid receipt',async()=>{
 const a=await fixture('race');hold=gate();asked=gate();const writing=composeStoryDigest(a.storyId);await asked.promise;
 await sql`UPDATE publications SET summary='在生成期间补充的新材料',revision=revision+1 WHERE article_id=${a.articleId}`;
 hold.open(undefined);hold=null;assert.equal((await writing).updated,false);
 const [row]=await sql`SELECT status FROM receipts WHERE purpose='story_digest' AND subject=${`story:${a.storyId}@1`} ORDER BY id DESC LIMIT 1`;
 assert.equal(row.status,'completed');assert.equal((await loadStoryDetail(a.storyId))!.digest,null);
 assert.equal((await composeStoryDigest(a.storyId)).updated,true);
});

test('large event material keeps the initial report and latest progress within forty candidates',async()=>{
 const a=await fixture('forty');
 const [fact]=await sql`SELECT id FROM facts WHERE story_id=${a.storyId}`;
 for(let i=1;i<=41;i++){
  const {articleId}=await upsertMaterial({sourceId:a.source,url:`https://example.com/${a.source}/${i}`,title:`第${i}项报道`,publishedAt:new Date(Date.parse('2026-10-15T16:00:00Z')+i*60000),bodyText:'新材料的可核验摘要',bodyStatus:'ok',via:'fetch'});
  await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,title_zh,summary_zh,selected) VALUES (${articleId},1,'rule','pass',${`第${i}项报道`},'新材料的可核验摘要',false)`;
  await sql`INSERT INTO fact_articles(fact_id,article_id,role) VALUES (${fact.id},${articleId},'report')`;
  await publishArticle(articleId);
 }
 await composeStoryDigest(a.storyId);
 const rows=JSON.parse(requests.at(-1)!.messages.at(-1)!.content) as Array<{id:string}>;
 assert.equal(rows.length,40);assert.equal(rows[0]!.id,a.articleId);
 assert.equal((await loadStoryDetail(a.storyId))!.reportCount,42);
});

test('repair scheduling is bounded, idempotent, respects pauses/manual decisions and finite retries',async()=>{
 const active=await fixture('lost-group',false),paused=await fixture('paused',false,false),manual=await fixture('manual',false),failed=await fixture('failed',false);
 await sql`INSERT INTO grouping_overrides(article_id,reason) VALUES (${manual.articleId},'独立保留')`;
 const failedJob=await enqueue(QUEUES.group,{articleId:failed.articleId,inputRevision:1},{singletonKey:failed.articleId});
 await sql`UPDATE pgboss.job SET state='failed',completed_on=now() WHERE id=${failedJob!}`;
 const story=await fixture('lost-digest');
 const hits=provider.hits();await sweepEventWork();await sweepEventWork();assert.equal(provider.hits(),hits,'cron only queues work');
 const rows=await sql`SELECT data->>'articleId' AS article FROM pgboss.job WHERE name=${QUEUES.group} AND state='created' AND data->>'articleId'=ANY(${[active.articleId,paused.articleId,manual.articleId,failed.articleId]})`;
 assert.deepEqual(rows.map(r=>r.article),[active.articleId]);
 assert.equal((await groupArticle(paused.articleId)).verdict,'skipped');assert.equal(provider.hits(),hits);
 const jobs=await sql`SELECT data FROM pgboss.job WHERE name=${QUEUES.digest} AND data->>'storyId'=${String(story.storyId)} AND state='created'`;
 assert.equal(jobs.length,1);assert.equal(jobs[0]!.data.inputHash,digestInputsHash(await digestReports(story.storyId)));
});

test('unchanged old editions cannot starve a later missing digest across bounded sweeps',async()=>{
 const a=await fixture('scan-evidence');
 const hash=digestInputsHash(await digestReports(a.storyId));
 const editions=await sql`INSERT INTO stories(public_id,title,digest,digest_updated_at,first_report_at,latest_at)
   SELECT gen_random_uuid(),'既有事件','已有可读综述',now()-interval '1 hour',now(),now() FROM generate_series(1,45) RETURNING id`;
 for(const st of editions){
  const [f]=await sql`INSERT INTO facts(public_id,story_id,title) VALUES (${`${key}-scan-${st.id}`},${st.id},'已有事实') RETURNING id`;
  await sql`INSERT INTO fact_articles(fact_id,article_id,role) VALUES (${f.id},${a.articleId},'report')`;
  await sql`INSERT INTO story_digests(story_id,version,digest,article_ids,inputs_hash) VALUES (${st.id},1,'已有可读综述',${[a.articleId]},${hash})`;
 }
 const tail=await fixture('scan-tail');
 let found=false;
 for(let i=0;i<12 && !found;i++){
  await sweepEventWork();
  found=!!(await sql`SELECT 1 FROM pgboss.job WHERE name=${QUEUES.digest} AND data->>'storyId'=${String(tail.storyId)} AND state='created'`)[0];
 }
 assert.equal(found,true);
});
