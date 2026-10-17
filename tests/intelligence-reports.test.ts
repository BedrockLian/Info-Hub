import {stub,tag,gate} from './setup.ts';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {sql,closeDb} from '@aihot/backend/db';
import {config} from '@aihot/backend/config';
import {upsertMaterial} from '@aihot/backend/content/materials';
import {publishArticle} from '@aihot/backend/publication/publish';
import {setVisibility} from '@aihot/backend/admin/content';
import {computeHotRanking} from '@aihot/backend/events/hot';
import {latestHotRanking} from '@aihot/backend/events/hot-read';
import {loadHot} from '@aihot/backend/publication/stories';
import {composeDailyIntelligence,enrichDaily,refreshRecentDailies} from '@aihot/backend/reports/daily';
import {loadReport,v1Daily} from '@aihot/backend/publication/reports';
import {stopBoss} from '@aihot/backend/jobs/queue';
import {beijingDate,beijingMidnight,addDays} from '@aihot/contracts/time';
import {BudgetExceededError} from '@aihot/backend/providers/receipts';

// Use a completed Beijing day: before 08:00, today's fixture publications would be in the future.
const T=tag(),source=`intelligence-${T}`,date=addDays(beijingDate(new Date()),-1),morning=new Date(beijingMidnight(date).getTime()+8*3600000),published=new Date(morning.getTime()-2*3600000);
let mode:'normal'|'invalid'|'held'='normal',held=gate(),entered=gate();
const wire:Record<string,any>[]=[];
const provider=await stub(async(_hit,req)=>{
 const body=JSON.parse(req.body);wire.push(body);const material=JSON.parse(body.messages.at(-1).content);
 const curate=body.messages[0].content.includes('focusIds');
 if(curate&&mode==='held'){entered.open();await held.promise;}
 // Other tests can leave eligible articles in this completed day's window. The provider fixture
 // must obey the real two-briefs-per-category contract rather than depend on the current hour.
 const briefCounts=new Map<string,number>();
 const briefIds=material.filter((e:any)=>!e.selected).filter((e:any)=>{const category=e.category??'other',count=briefCounts.get(category)??0;if(count>=2)return false;briefCounts.set(category,count+1);return true;}).slice(0,6).map((e:any)=>e.id);
 const data=curate?mode==='invalid'?{focusIds:['not-a-candidate'],briefIds:[]}:{focusIds:material.filter((e:any)=>e.selected).slice(0,5).map((e:any)=>e.id),briefIds}:{leadItemId:material[0].id,title:material[0].title,leadParagraph:'本期汇总已有资料中的重要变化。'};
 return {choices:[{message:{content:JSON.stringify(data)},finish_reason:'stop'}],usage:{prompt_tokens:200,prompt_cache_hit_tokens:128,prompt_cache_miss_tokens:72,completion_tokens:100}};
});
process.env.REPORT_MODEL='default';process.env.LLM_MODEL='deepseek-flash';process.env.LLM_BASE_URL=provider.url;process.env.LLM_API_KEY='local-stub-key';config.privateSite=false;
before(async()=>{await sql`INSERT INTO sources (id,name,kind,tier,next_fetch_at) VALUES (${source},'Intelligence fixture','rss','T2','2100-01-01')`;});
after(async()=>{await provider.close();await sql`DELETE FROM reports WHERE kind='daily' AND key=${date}`;await sql`UPDATE publications SET visibility='withdrawn' WHERE source_id=${source}`;await sql`UPDATE sources SET enabled=false WHERE id=${source}`;await stopBoss();await closeDb();});
let n=0;
async function material(selected:boolean,category:string,at=published){
 const {articleId}=await upsertMaterial({sourceId:source,url:`https://example.com/${T}/${++n}`,title:`News ${n}`,publishedAt:at,bodyStatus:'ok',bodyText:'A factual report.',via:'fetch'});
 await sql`INSERT INTO analyses (article_id,input_revision,origin,relevance,category,title_zh,summary_zh,score,selected) VALUES (${articleId},1,'rule','pass',${category},${`情报${n}-${T}`},'有出处的事实摘要。',${selected?90:65},${selected})`;
 const [story]=await sql<{id:number}[]>`INSERT INTO stories (public_id,title,first_report_at,latest_at) VALUES (${randomUUID()},${`事件${n}`},${at},${at}) RETURNING id`;
 const [fact]=await sql<{id:number}[]>`INSERT INTO facts (public_id,story_id,title) VALUES (${`f-${T}-${n}`},${story!.id},${`事实${n}`}) RETURNING id`;
 await sql`INSERT INTO fact_articles (fact_id,article_id,role) VALUES (${fact!.id},${articleId},'report')`;
 await publishArticle(articleId,{releasedAt:at});
 await sql`UPDATE publications SET backfill=false WHERE article_id=${articleId}`;
 return articleId;
}
const current=async()=>{const [r]=await sql`SELECT content,revision,origin FROM reports WHERE kind='daily' AND key=${date}`;return r!;};

test('single-source editorial events enter attention ranking without a signal or another model call; withdrawal removes them live',async()=>{
 const id=await material(true,'global_affairs');const start=wire.length;
 const result=await computeHotRanking(new Date());assert.ok(result.entries>0);
 const ranking=await latestHotRanking();const entry=ranking!.entries.find(e=>e.representativeItemId===id);assert.ok(entry);assert.equal(entry.sourceCount,1);assert.equal(entry.selected,true);assert.equal(wire.length,start);
 await sql`UPDATE articles SET processing_state='analyzed' WHERE id=${id}`;await computeHotRanking();const baseline=(await loadHot()).pendingCount!;
 await sql`UPDATE publications SET story_id=NULL WHERE article_id=${id}`;await computeHotRanking();assert.equal((await loadHot()).pendingCount,baseline+1);
 await sql`UPDATE publications SET story_id=${entry.storyId} WHERE article_id=${id}`;await computeHotRanking();
 config.privateSite=true;
 try{await setVisibility(id,{visibility:'withdrawn',reason:'test',version:0},'test');assert.ok(!(await latestHotRanking())!.entries.some(e=>e.representativeItemId===id));}finally{config.privateSite=false;}
});
test('a readable cross-domain daily is saved without an AI call, then enriched once; unchanged refreshes do not spend or revise',async()=>{
 assert.equal((await composeDailyIntelligence(date,'before-morning',new Date(morning.getTime()-60000))).skipped,true);
 for(let i=0;i<3;i++)await material(true,'global_affairs');
 for(const category of ['technology','games','public_affairs'])for(let i=0;i<2;i++)await material(false,category);
 const before=wire.length;const base=await composeDailyIntelligence(date,'test',morning);assert.ok(base.entries>=9);assert.equal(wire.length,before);assert.equal((await current()).origin,'rule');
 await enrichDaily(date);const enriched=await current();assert.equal(enriched.content.enrichmentStatus,'ready');assert.equal(wire.length,before+2);
 const report=await loadReport('daily',date);assert.ok(report!.sections.some(s=>s.label==='科技'));assert.ok(report!.stories.some(e=>e.editionRole==='brief'));assert.ok(report!.leadItemId);
 await composeDailyIntelligence(date,'refresh',new Date(morning.getTime()+3600000));assert.equal((await current()).revision,enriched.revision);assert.equal(wire.length,before+2);
});
test('late selection belongs to its original reporting window and an invalid AI ID leaves the baseline intact',async()=>{
 const id=await material(true,'china_coverage');await sql`UPDATE publications SET visible_after=${new Date(morning.getTime()+300000)} WHERE article_id=${id}`;
 await composeDailyIntelligence(date,'late',new Date(morning.getTime()+3600000));const base=await current();assert.ok(JSON.stringify(base.content).includes(id));assert.ok(JSON.stringify(base.content).includes('late'));
 mode='invalid';await assert.rejects(enrichDaily(date));const fallback=await current();assert.equal(fallback.content.enrichmentStatus,'fallback');assert.equal(fallback.content.metrics.totalEvents,base.content.metrics.totalEvents);mode='normal';
});
test('a superseded AI snapshot never writes a lead or replaces the newer daily; finalization changes no content revision',async()=>{
 mode='held';held=gate();entered=gate();const before=wire.length;const work=enrichDaily(date);await entered.promise;
 await material(false,'technology',new Date(morning.getTime()+3600000));await composeDailyIntelligence(date,'new-input',new Date(Math.max(Date.now(),morning.getTime()+7200000)));const newer=await current();
 held.open();assert.equal((await work).stale,true);assert.equal(wire.length,before+1);assert.equal((await current()).revision,newer.revision);mode='normal';
 const finalTime=new Date(beijingMidnight(date).getTime()+22*3600000);
 await composeDailyIntelligence(date,'finalize',finalTime);const final=await current();assert.equal(final.content.editionStatus,'final');
 await composeDailyIntelligence(date,'same-final-input',new Date(finalTime.getTime()+60000));assert.equal((await current()).revision,final.revision);
});
test('a new fact updates one existing event with its own citation, and withdrawn progress cannot leak through the report',async()=>{
 const original=await material(true,'games',new Date(morning.getTime()-3600000)),update=await material(false,'games',new Date(morning.getTime()+3600000));
 const [parent]=await sql`SELECT story_id FROM publications WHERE article_id=${original}`;
 const [child]=await sql`SELECT fact_id FROM publications WHERE article_id=${update}`;
 await sql`UPDATE facts SET story_id=${parent!.story_id} WHERE id=${child!.fact_id}`;
 await sql`UPDATE publications SET story_id=${parent!.story_id} WHERE article_id=${update}`;
 await composeDailyIntelligence(date,'new-fact',new Date(morning.getTime()+7200000));
 const report=await loadReport('daily',date),entry=report!.stories.find(e=>e.itemId===original);assert.equal(entry?.latestUpdate?.itemId,update);assert.ok(!report!.stories.some(e=>e.itemId===update));
 config.privateSite=true;
 try{await setVisibility(update,{visibility:'withdrawn',reason:'test',version:0},'test');const sanitized=await loadReport('daily',date);assert.ok(!JSON.stringify(sanitized).includes(update));}finally{config.privateSite=false;}
 const lead=(await loadReport('daily',date))!.leadItemId!;assert.ok(lead);const [release]=await sql`SELECT visible_after FROM publications WHERE article_id=${lead}`;
 try{
  await sql`UPDATE publications SET visible_after=now()+interval '1 hour' WHERE article_id=${lead}`;
  assert.ok(!JSON.stringify(await loadReport('daily',date)).includes(lead));assert.ok(!JSON.stringify(await v1Daily(date)).includes(lead));
 }finally{await sql`UPDATE publications SET visible_after=${release!.visible_after} WHERE article_id=${lead}`;}
});
test('concurrent refreshes do not duplicate revisions and a budget pause retains the readable baseline',async()=>{
 await composeDailyIntelligence(date,'apply-withdrawal');
 const before=await current();await Promise.all([composeDailyIntelligence(date,'parallel-a'),composeDailyIntelligence(date,'parallel-b')]);
 assert.equal((await current()).revision,before.revision);
 const [limit]=await sql`SELECT per_day FROM budgets WHERE service='llm'`;const calls=wire.length;
 try{await sql`UPDATE budgets SET per_day=0 WHERE service='llm'`;await assert.rejects(enrichDaily(date),BudgetExceededError);assert.equal(wire.length,calls);assert.equal((await current()).content.enrichmentStatus,'pending');assert.ok((await current()).content.metrics.totalEvents>0);}
 finally{await sql`UPDATE budgets SET per_day=${limit!.per_day} WHERE service='llm'`;}
});
test('a previously covered fact is suppressed while a new fact of that long-running event remains eligible',async()=>{
 const old=await material(true,'technology',new Date(morning.getTime()-11*3600000)),fresh=await material(true,'technology',new Date(morning.getTime()+3600000));
 const [prior]=await sql`SELECT story_id,fact_id FROM publications WHERE article_id=${old}`;const [newer]=await sql`SELECT fact_id FROM publications WHERE article_id=${fresh}`;
 await sql`UPDATE facts SET story_id=${prior!.story_id} WHERE id=${newer!.fact_id}`;await sql`UPDATE publications SET story_id=${prior!.story_id} WHERE article_id=${fresh}`;
 const [fact]=await sql`SELECT public_id FROM facts WHERE id=${prior!.fact_id}`;
 const previousDate=addDays(date,-1),[previous]=await sql`SELECT id,content FROM reports WHERE kind='daily' AND key=${previousDate}`;
 const seed={...(previous?.content??{}),sections:[...(previous?.content?.sections??[]),{label:'科技',items:[{itemId:old,factId:fact!.public_id,factKeys:[fact!.public_id],storyPublicId:(await sql`SELECT public_id::text FROM stories WHERE id=${prior!.story_id}`)[0]!.public_id}]}]};
 try{
  if(previous)await sql`UPDATE reports SET content=${sql.json(seed)} WHERE id=${previous.id}`;
  else await sql`INSERT INTO reports (kind,key,window_start,window_end,content,generated_at,origin) VALUES ('daily',${previousDate},${new Date(morning.getTime()-48*3600000)},${new Date(morning.getTime()-10*3600000)},${sql.json(seed)},now(),'rule')`;
  await composeDailyIntelligence(date,'new-progress');const report=await loadReport('daily',date);
  assert.ok(!report!.stories.some(e=>e.itemId===old));assert.equal(report!.stories.find(e=>e.itemId===fresh)?.updateType,'progress');
 }finally{if(previous)await sql`UPDATE reports SET content=${sql.json(previous.content)} WHERE id=${previous.id}`;else await sql`DELETE FROM reports WHERE kind='daily' AND key=${previousDate}`;}
});

test('a late release revises a finalized modern issue and is not repeated in the next issue',async()=>{
 const yesterday=addDays(date,-1),[previous]=await sql`SELECT content,window_start,window_end FROM reports WHERE kind='daily' AND key=${yesterday}`;
 try{
  const finalTime=new Date(morning.getTime()-10*3600000);
  await composeDailyIntelligence(yesterday,'initial-final',finalTime);
  const late=await material(true,'china_coverage',new Date(morning.getTime()-22*3600000));
  await sql`UPDATE publications SET visible_after=${new Date(morning.getTime()+1800000)} WHERE article_id=${late}`;
  await refreshRecentDailies(new Date(morning.getTime()+3600000));
  const revised=await loadReport('daily',yesterday);assert.equal(revised!.editionStatus,'final');assert.equal(revised!.stories.find(e=>e.itemId===late)?.updateType,'late');
  assert.ok(!(await loadReport('daily',date))!.stories.some(e=>e.itemId===late));
 }finally{
  if(previous)await sql`UPDATE reports SET content=${sql.json(previous.content)},window_start=${previous.window_start},window_end=${previous.window_end} WHERE kind='daily' AND key=${yesterday}`;
  else await sql`DELETE FROM reports WHERE kind='daily' AND key=${yesterday}`;
 }
});
