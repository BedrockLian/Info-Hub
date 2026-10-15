import {z} from 'zod';
import {CATEGORIES} from '@aihot/industry/taxonomy';
import {INTELLIGENCE} from '@aihot/industry/intelligence';
import {addDays,beijingDate,beijingMidnight} from '@aihot/contracts/time';
import {sql} from '../db.ts';
import {sha256,stableJson} from '../lib/ids.ts';
import {modelFor} from '../editorial/models.ts';
import {promptText,promptVersion} from '../editorial/prompts.ts';
import {chatJson,MODELS} from '../providers/llm.ts';
import {REASONING_POLICY_VERSION,INFERENCE_GUIDANCE_VERSION} from '@aihot/industry/reasoning';
import {completeReceipt} from '../providers/receipts.ts';
import {BudgetExceededError,ReceiptBusyError} from '../providers/receipts.ts';
import {enqueue,QUEUES} from '../jobs/queue.ts';
import {dailyWindow,dailyInputHash,dailyOrder,selectDaily,type DailyCandidate} from './daily-policy.ts';
import {saveReport} from './store.ts';

const VERSION=promptVersion('report-curate','report-intelligence-lead');
const CURATE_TOKENS=1024,LEAD_TOKENS=800;
const LeadSchema=z.object({leadItemId:z.string().min(1),title:z.string().min(1).max(120),leadParagraph:z.string().min(1).max(600)});
const sectionOf=new Map<string,string>(CATEGORIES.map(c=>[c.key,c.section]));
export interface DailyEntry extends DailyCandidate {factId:string|null;sourceId:string;sourceName:string;sourceUrl:string;firstParty:boolean;role:string;factKeys:string[];updateType:'new'|'progress'|'late'|'revision';latestUpdate?:Pick<DailyEntry,'itemId'|'title'|'summary'|'sourceId'|'sourceName'|'sourceUrl'|'firstParty'|'role'|'publishedAt'|'storyPublicId'>}
interface StoredDaily {id:number;content:Record<string,any>;window_start:Date;window_end:Date}
async function readDaily(date:string){const [row]=await sql<StoredDaily[]>`SELECT id,content,window_start,window_end FROM reports WHERE kind='daily' AND key=${date}`;return row;}
async function locked<T>(date:string,run:()=>Promise<T>):Promise<T|null>{
 const connection=await sql.reserve();let acquired=false;
 try{const [row]=await connection`SELECT pg_try_advisory_lock(hashtext('daily-report'),hashtext(${date})) AS locked`;acquired=row!.locked===true;return acquired?await run():null;}
 finally{if(acquired)await connection`SELECT pg_advisory_unlock(hashtext('daily-report'),hashtext(${date}))`;connection.release();}
}
async function snapshot(date:string,end:Date,now:Date):Promise<{entries:DailyEntry[];hash:string;model:string}>{
 const start=dailyWindow(date,now).start;
 const previous=await sql<{content:Record<string,any>}[]>`SELECT content FROM reports WHERE kind='daily' AND key<${date} AND key>=${addDays(date,-7)}`;
 const covered=new Set<string>(),oldStories=new Set<string>();
 for(const r of previous)for(const section of r.content.sections??[])for(const entry of section.items??[]){for(const key of entry.factKeys??[entry.factId??`a:${entry.itemId}`])covered.add(key);if(entry.storyPublicId)oldStories.add(entry.storyPublicId);}
 const rows=await sql<{itemId:string;factId:string|null;storyPublicId:string|null;title:string;summary:string;sourceId:string;sourceName:string;sourceUrl:string;firstParty:boolean;category:string|null;score:number|null;selected:boolean;revision:number;at:Date;released:Date|null;kind:string}[]>`
  SELECT p.article_id AS "itemId",f.public_id AS "factId",st.public_id::text AS "storyPublicId",p.title,p.summary,p.source_id AS "sourceId",s.name AS "sourceName",p.url AS "sourceUrl",p.first_party AS "firstParty",p.category,p.score,p.selected,p.revision,coalesce(p.published_at,p.timeline_at) AS at,coalesce(p.visible_after,p.updated_at) AS released,s.kind
  FROM publications p JOIN sources s ON s.id=p.source_id LEFT JOIN facts f ON f.id=p.fact_id LEFT JOIN stories st ON st.id=p.story_id
  WHERE p.visibility='public' AND p.eligible AND NOT p.backfill AND coalesce(p.published_at,p.timeline_at)>=${start} AND coalesce(p.published_at,p.timeline_at)<${end}
    AND (NOT p.selected OR p.visible_after<=${now}) AND (st.id IS NULL OR st.merged_into IS NULL)`;
 const morning=beijingMidnight(date).getTime()+8*3600000,final=beijingMidnight(date).getTime()+22*3600000;
 const entries:DailyEntry[]=rows.map(r=>({...r,factKey:r.factId??`a:${r.itemId}`,factKeys:[r.factId??`a:${r.itemId}`],publishedAt:r.at.toISOString(),
  role:r.firstParty?'一手':r.kind==='x_search'?'作者':'来源',updateType:(r.storyPublicId&&oldStories.has(r.storyPublicId)?'progress':(r.at.getTime()<morning&&(r.released?.getTime()??0)>morning)||(r.released?.getTime()??0)>final?'late':'new') as DailyEntry['updateType']}))
  .filter(e=>!covered.has(e.factKey)).map(({at:_at,released:_released,kind:_kind,...e})=>e).sort(dailyOrder);
 // Keep the complete fact set of a chosen event, including its newer non-selected reports.
 for(const entry of entries){
  const related=entries.filter(e=>e.storyPublicId===entry.storyPublicId&&entry.storyPublicId!==null||e.itemId===entry.itemId);
  entry.factKeys=[...new Set(related.map(e=>e.factKey))].sort();
  const latest=related.filter(e=>e.factKey!==entry.factKey&&e.publishedAt>entry.publishedAt).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt))[0];
  if(latest)entry.latestUpdate={itemId:latest.itemId,title:latest.title,summary:latest.summary.slice(0,180),sourceId:latest.sourceId,sourceName:latest.sourceName,sourceUrl:latest.sourceUrl,firstParty:latest.firstParty,role:latest.role,publishedAt:latest.publishedAt,storyPublicId:latest.storyPublicId};
 }
 const batches=new Map<string,DailyEntry[]>();for(const entry of entries){const category=entry.category??'other';const group=batches.get(category)??[];group.push(entry);batches.set(category,group);}
 const bounded:DailyEntry[]=[];for(let i=0;bounded.length<INTELLIGENCE.dailyCandidateLimit;i++){let added=false;for(const group of batches.values()){if(group[i]){bounded.push(group[i]!);added=true;if(bounded.length===INTELLIGENCE.dailyCandidateLimit)break;}}if(!added)break;}
 const material=bounded.sort((a,b)=>a.itemId.localeCompare(b.itemId)),model=await modelFor('report');
 const spec=MODELS[model];
 return {entries:material,model,hash:sha256(stableJson({material:dailyInputHash(material),model,spec:{model:spec?.model,extra:spec?.extra},version:VERSION,common:promptVersion('pi-editor'),reasoning:REASONING_POLICY_VERSION,guidance:INFERENCE_GUIDANCE_VERSION,parameters:{limits:INTELLIGENCE,curateTokens:CURATE_TOKENS,leadTokens:LEAD_TOKENS,curateSchema:z.toJSONSchema(CurateSchema),leadSchema:z.toJSONSchema(LeadSchema)},policy:'intelligence-daily-v1'}))};
}
function contentFor(date:string,entries:DailyEntry[],focus:DailyEntry[],briefs:DailyEntry[],hash:string,model:string,status:'updating'|'final',previous?:Record<string,any>){
 const old:DailyEntry[]=(previous?.sections??[]).flatMap((s:any)=>s.items??[]);
 const decorate=(e:DailyEntry)=>{const prior=old.find(i=>i.storyPublicId?i.storyPublicId===e.storyPublicId:i.itemId===e.itemId);return {...e,updateType:prior?(e.factKeys.some(key=>!prior.factKeys?.includes(key))?'progress':prior.itemId===e.itemId&&prior.revision!==e.revision?'revision':prior.updateType??e.updateType):e.updateType};};
 const chosen=[...focus.map(e=>({...decorate(e),editionRole:'focus' as const,summary:e.summary.slice(0,280)})),...briefs.map(e=>({...decorate(e),editionRole:'brief' as const,summary:e.summary.slice(0,140)}))];
 const sections:Array<{label:string;items:typeof chosen}>=CATEGORIES.map(c=>({label:c.section,items:chosen.filter(e=>e.category===c.key)})).filter(s=>s.items.length);
 const unknown=chosen.filter(e=>!sectionOf.has(e.category??''));if(unknown.length)sections.push({label:'其他情报',items:unknown});
 const lead=focus[0]??briefs[0];
 return {date,editionStatus:status,enrichmentStatus:chosen.length?'pending':'ready',leadItemId:lead?.itemId??null,lead:lead?{title:lead.title,leadParagraph:lead.summary.slice(0,300)}:null,highlights:focus.map(e=>e.itemId),sections,flashes:[],
  metrics:{totalEvents:chosen.length,sourcesCount:new Set(chosen.flatMap(e=>[e.sourceId,...(e.latestUpdate?[e.latestUpdate.sourceId]:[])])).size,focusCount:focus.length,briefCount:briefs.length},
  generator:{version:VERSION,inputHash:hash,model,aiApplied:false,candidates:entries.length}};
}
export async function composeDailyIntelligence(date:string,reason='scheduled',now=new Date()):Promise<{key:string;entries:number;unchanged?:boolean;skipped?:boolean}>{
 if(now.getTime()<beijingMidnight(date).getTime()+8*3600000)return {key:date,entries:0,skipped:true};
 const result=await locked(date,async()=>{
  const window=dailyWindow(date,now),snap=await snapshot(date,window.end,now),existing=await readDaily(date);
  if(existing?.content.generator?.inputHash===snap.hash){
   await sql`UPDATE reports SET window_end=${window.end},content=jsonb_set(content,'{editionStatus}',${sql.json(window.status)}) WHERE id=${existing.id}`;
   if(existing.content.enrichmentStatus==='pending')await enqueue(QUEUES.reportEnrich,{date},{singletonKey:date});
   return {key:date,entries:Number(existing.content.metrics?.totalEvents??0),unchanged:true};
  }
  const {focus,briefs}=selectDaily(snap.entries),content=contentFor(date,snap.entries,focus,briefs,snap.hash,snap.model,window.status,existing?.content);
  await saveReport('daily',date,window.start,window.end,content,reason,null,'rule');
  if(focus.length+briefs.length)await enqueue(QUEUES.reportEnrich,{date},{singletonKey:date});
  return {key:date,entries:focus.length+briefs.length};
 });
 return result??{key:date,entries:0,skipped:true};
}
export async function refreshCurrentDaily(now=new Date()){
 const date=beijingDate(now),morning=beijingMidnight(date).getTime()+8*3600000;
 if(now.getTime()<morning)return {skipped:true};
 return composeDailyIntelligence(date,'refresh',now);
}
/** Recheck recent modern issues for late releases, oldest first so overlapping facts stay unique. */
export async function refreshRecentDailies(now=new Date(),days=7){
 const today=beijingDate(now);
 const recent=await sql<{key:string}[]>`SELECT key FROM reports WHERE kind='daily' AND key<${today} AND key>=${addDays(today,-days)}
  AND content->'generator'->>'inputHash' IS NOT NULL ORDER BY key`;
 for(const report of recent)await composeDailyIntelligence(report.key,'late-material-check',now);
 return refreshCurrentDaily(now);
}
export const CurateSchema=z.object({focusIds:z.array(z.string()).max(5),briefIds:z.array(z.string()).max(15)});
export function validateCurated(entries:DailyEntry[],value:z.infer<typeof CurateSchema>){
 const ids=[...value.focusIds,...value.briefIds];if(new Set(ids).size!==ids.length)throw Error('Repeated daily candidate ID');
 const byId=new Map(entries.map(e=>[e.itemId,e]));const read=(id:string)=>{const entry=byId.get(id);if(!entry)throw Error('Unknown daily candidate ID');return entry;};
 const focus=value.focusIds.map(read),briefs=value.briefIds.map(read);
 if(focus.some(e=>!e.selected)||focus.length<Math.min(3,selectDaily(entries).focus.length)||ids.length>15)throw Error('Invalid daily focus selection');
 const events=new Set<string>(),counts=new Map<string,number>();
 for(const e of [...focus,...briefs]){const key=e.storyPublicId??e.factKey;if(events.has(key))throw Error('Repeated daily event');events.add(key);}
 for(const e of briefs){const key=e.category??'other';counts.set(key,(counts.get(key)??0)+1);if(counts.get(key)!>2)throw Error('Daily brief category limit');}
 return {focus,briefs};
}
async function currentHash(date:string,hash:string){const row=await readDaily(date);return row?.content.generator?.inputHash===hash;}
export async function enrichDaily(date:string){
 const report=await readDaily(date);if(!report||report.content.enrichmentStatus==='ready')return {skipped:true};
 const snap=await snapshot(date,report.window_end,new Date()),hash=report.content.generator?.inputHash;
 if(hash!==snap.hash){await composeDailyIntelligence(date,'changed-before-enrichment');return {stale:true};}
 const material=snap.entries.map(e=>({id:e.itemId,event:e.storyPublicId??e.factKey,selected:e.selected,category:e.category,title:e.title,summary:e.summary.slice(0,240),publishedAt:e.publishedAt,revision:e.revision,source:e.sourceName,latestUpdate:e.latestUpdate}));
 try{
  if(!await currentHash(date,hash))return {stale:true};
  const schema=CurateSchema.superRefine((value,ctx)=>{try{validateCurated(snap.entries,value);}catch(error){ctx.addIssue({code:'custom',message:String(error)});}});
  const curated=await chatJson({model:snap.model,purpose:'report_curate',subject:`report:daily:${date}`,promptVersion:VERSION,system:promptText('report-curate'),user:stableJson(material),schema,maxTokens:CURATE_TOKENS});
  const {focus,briefs}=validateCurated(snap.entries,curated.data);
  if(!await currentHash(date,hash)||(await snapshot(date,report.window_end,new Date())).hash!==hash){await composeDailyIntelligence(date,'changed-before-lead');return {stale:true};}
  const chosen=[...focus.map(e=>({...e,editionRole:'focus'})),...briefs.map(e=>({...e,editionRole:'brief'}))];
  if(!chosen.length)throw Error('An enrichment cannot erase the readable baseline');
  const leadSchema=LeadSchema.refine(value=>(focus.length?focus:briefs).some(e=>e.itemId===value.leadItemId),'Lead must cite a chosen focus item');
  const lead=await chatJson({model:snap.model,purpose:'report_lead',subject:`report:daily:${date}`,promptVersion:VERSION,system:promptText('report-intelligence-lead'),user:stableJson(chosen.map(e=>({id:e.itemId,role:e.editionRole,title:e.title,summary:e.summary.slice(0,240),latestUpdate:e.latestUpdate}))),schema:leadSchema,maxTokens:LEAD_TOKENS});
  if(!(focus.length?focus:briefs).some(e=>e.itemId===lead.data.leadItemId))throw Error('Daily lead must cite a chosen focus item');
  const applied=await locked(date,async()=>{
   if(!await currentHash(date,hash))return false;
   const fresh=await snapshot(date,report.window_end,new Date());if(fresh.hash!==hash)return false;
   const current=await readDaily(date);if(!current)return false;
   const content=contentFor(date,snap.entries,focus,briefs,hash,snap.model,current.content.editionStatus??'updating',current.content);
   Object.assign(content,{leadItemId:lead.data.leadItemId,lead:{title:lead.data.title,leadParagraph:lead.data.leadParagraph},enrichmentStatus:'ready',generator:{...content.generator,aiApplied:true}});
   await saveReport('daily',date,current.window_start,current.window_end,content,'AI enrichment',snap.model);
   await completeReceipt(sql,curated.receiptId);await completeReceipt(sql,lead.receiptId);return true;
  });
  if(!applied)await composeDailyIntelligence(date,'changed-during-enrichment');
  return {applied:!!applied};
 }catch(error){
  const status=error instanceof BudgetExceededError||error instanceof ReceiptBusyError?'pending':'fallback';
  await sql`UPDATE reports SET content=jsonb_set(content,'{enrichmentStatus}',${sql.json(status)}) WHERE kind='daily' AND key=${date} AND content->'generator'->>'inputHash'=${hash}`;
  throw error;
 }
}
