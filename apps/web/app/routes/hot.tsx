import {SITE} from '@aihot/industry/site';
import {CATEGORIES} from '@aihot/industry/taxonomy';
import {Link,useLoaderData} from 'react-router';
import type {HotEntryView,HotResponse} from '@aihot/contracts/site';
import {loadOr404} from '../lib/api.server';
import {pageMeta} from '../lib/seo';
import {monthDayTime,shortSourceName} from '../lib/format';
import {Badge} from '../components/ui/Badge';
import {EmptyState} from '../components/ui/Page';
import {IconInfo} from '../components/icons';
export async function loader({request}:{request:Request}){return {hot:await loadOr404<HotResponse>('/api/site/hot',{signal:request.signal})};}
export function meta(){return pageMeta({title:`近期值得关注 · ${SITE.name}`,description:'过去48小时值得关注的跨领域情报，按编辑判断与最新进展排序，保留原始来源。',path:'/hot',image:'/og/pages/hot.png'});}
export function headers(){return {'Cache-Control':'private, no-store'};}
const categoryLabel=(key:string|null|undefined)=>CATEGORIES.find(c=>c.key===key)?.label??'情报';
function AttentionItem({entry:e}:{entry:HotEntryView}){
 return <article className="card group relative flex gap-4 p-5 sm:gap-6 sm:p-6">
  <span className={`mono shrink-0 pt-0.5 text-[22px] font-semibold ${e.rank<=3?'text-accent':'text-ink-4'}`} aria-label={`关注顺序第${e.rank}位`}>{String(e.rank).padStart(2,'0')}</span>
  <div className="min-w-0 flex-1">
   <div className="flex flex-wrap items-center gap-2 text-xs text-ink-4"><span>{categoryLabel(e.category)}</span>{e.selected&&<Badge tone="accent">精选</Badge>}<span className="ml-auto num">{monthDayTime(e.latestAt)}</span></div>
   <h2 className="mt-2 text-[17px] font-semibold leading-relaxed text-ink sm:text-[19px]"><Link to={`/story/${e.story.publicId}`} prefetch="intent" className="after:absolute after:inset-0 group-hover:text-accent">{e.story.title}</Link></h2>
   {e.summary&&<p className="mt-2 line-clamp-3 text-sm leading-7 text-ink-3">{e.summary}</p>}
   {e.latest&&e.latest!==e.summary&&<p className="mt-2 line-clamp-2 text-sm leading-6 text-ink-3"><span className="mr-2 text-xs text-accent">最新进展</span>{e.latest}</p>}
   <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink-4">
    <span className="text-ink-3">{e.sourceNames.slice(0,2).map(shortSourceName).join('、')}{e.sourceCount>2?`等${e.sourceCount}个独立来源`:e.sourceCount>1?` · ${e.sourceCount}个独立来源`:''}</span>
    <span>{e.sourceCount===1?'单一来源':`${e.reportCount}篇报道`}</span>
    {(e.reasons??[]).filter(r=>r!=='单一来源'&&r!=='已入精选').map(reason=><span key={reason} className="rounded-full border border-line px-2 py-0.5">{reason}</span>)}
   </div>
  </div>
 </article>;
}
export default function HotPage(){
 const {hot}=useLoaderData<typeof loader>();const processing=hot.status==='processing',stale=hot.status==='stale';
 return <div className="pb-10">
  <header className="flex flex-wrap items-end justify-between gap-4 pb-6 pt-5 lg:pt-1">
   <div><p className="text-xs font-semibold tracking-widest text-accent">情报热点榜</p><h1 className="mt-2 text-[26px] font-bold text-ink">近期值得关注</h1><p className="mt-2 text-sm text-ink-3">过去{hot.windowHours}小时 · {hot.entries.length}件独立事件 · 兼顾阅读价值与新进展</p></div>
   {hot.computedAt&&<p className="text-xs text-ink-4">{monthDayTime(hot.computedAt)} 更新</p>}
  </header>
  {hot.status==='stale'&&<p role="status" className="mb-4 rounded-panel border border-line bg-bg-sunk p-3 text-sm text-ink-3">榜单更新暂时滞后，以下为最近一次可用结果。<Link to="/all" className="ml-2 text-accent">查看全部情报</Link></p>}
  {hot.entries.length?<div className="grid gap-3">{hot.entries.map(e=><AttentionItem key={e.story.publicId} entry={e}/>)}</div>:<div className="card"><EmptyState title={stale?'榜单暂未更新':processing?'情报正在处理中':'近期暂无合格情报'}>{stale?'最近一次榜单没有可用条目，请先查看全部情报。':processing?'已采集材料正在完成分析，榜单会随处理结果更新。':'当前统计区间没有可展示的合格事件，稍后再来看看。'}<Link to="/all" className="mt-3 block text-accent">查看全部情报动态</Link></EmptyState></div>}
  <details className="mt-5 border-t border-line pt-4 text-sm text-ink-3"><summary className="inline-flex cursor-pointer items-center gap-2"><IconInfo className="size-4"/>这份榜单怎样排序？</summary><div className="mt-3 max-w-3xl space-y-2 leading-7"><p>优先考虑是否入选精选、已有编辑评分、新进展时间和独立来源覆盖；同一事件只出现一次，并为不同领域保留展示机会。</p><p>重要的单来源情报也可以入榜，页面会明确标记。这是本站监测范围内的阅读排序，不是全网热度或阅读人数；刷新榜单不会额外调用AI。</p></div></details>
 </div>;
}
