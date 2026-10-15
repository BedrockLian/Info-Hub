// Reader attention ranking uses existing editorial judgments and current publications.
// The legacy decay calculations below remain only for existing event-history charts.
import { sql } from "../db.ts";
import { tierRank, type HotEntry } from "./hot-read.ts";
import {diverseAttention} from './attention-policy.ts';
import {INTELLIGENCE} from '@aihot/industry/intelligence';

export const HOT_RULE_VERSION = "attention-v2-selected-score-progress-coverage";
const WINDOW_HOURS = 48;
const HALF_LIFE_HOURS = 24;

interface HeatRow {
  story_id: number;
  public_id: string;
  title: string;
  first_report_at: Date | null;
  latest_at: Date | null;
  participants: number;
  heat: number;
  heat_prev: number;
  /** The same two over the participants whose sources were caught up (the comparable group). */
  heat_obs: number;
  heat_prev_obs: number;
  /** Participants with a source whose collection was behind: their newest evidence may be missing. */
  behind_participants: number;
  recent6h: number;
  editorial_participants: number;
  signal_participants: number;
}

interface SourceClock {
  id: string;
  lastOk: number | null;
  graceMs: number;
}

/** Scheduled sources and their last successful fetch (screenshot-reported and pushed sources cannot visibly fall behind). */
export async function sourceClocks(): Promise<SourceClock[]> {
  const rows = await sql<{ id: string; last_ok_at: Date | null; interval_minutes: number }[]>`
    SELECT id, last_ok_at, interval_minutes FROM sources WHERE enabled AND kind IN ('rss', 'web_list', 'json_list', 'x_search')`;
  return rows.map((r) => ({ id: r.id, lastOk: r.last_ok_at?.getTime() ?? null, graceMs: Math.max(r.interval_minutes * 3, 90) * 60_000 }));
}

/**
 * Sources whose evidence up to `at` may be incomplete. Looking at the present (`grace`), a source is
 * behind after three intervals (at least 90 minutes) without a successful fetch; for an hour already
 * past, it has caught up once any fetch succeeded after that hour (evidence carries the source's time).
 */
export function behindSources(clocks: SourceClock[], at: number, grace: boolean): string[] {
  return clocks.filter((c) => c.lastOk === null || c.lastOk < at - (grace ? c.graceMs : 0)).map((c) => c.id);
}

/** Heat of every story at `at` (defaults to now), from story_signals alone; `behind` marks sources not fully observed. */
async function heatRows(at: Date, behind: string[] = []): Promise<HeatRow[]> {
  const prev = new Date(at.getTime() - 6 * 3600 * 1000);
  const decayNow = sql`power(0.5, extract(epoch FROM (${at}::timestamptz - last_at)) / 3600.0 / ${HALF_LIFE_HOURS})`;
  const decayPrev = sql`power(0.5, extract(epoch FROM (${prev}::timestamptz - last_prev)) / 3600.0 / ${HALF_LIFE_HOURS})`;
  const inPrevWindow = sql`last_prev IS NOT NULL AND last_prev > ${prev}::timestamptz - make_interval(hours => ${WINDOW_HOURS})`;
  return sql<HeatRow[]>`
    WITH obs AS (
      SELECT story_id, participant_key, max(observed_at) AS last_at, min(observed_at) AS first_at,
             bool_or(kind = 'editorial') AS editorial,
             max(observed_at) FILTER (WHERE observed_at <= ${prev}) AS last_prev,
             bool_or(source_id = ANY(${behind}::text[])) AS behind
      FROM story_signals
      WHERE observed_at > ${at}::timestamptz - make_interval(hours => ${WINDOW_HOURS}) AND observed_at <= ${at}
      GROUP BY story_id, participant_key
    ), agg AS (
      SELECT story_id,
        count(*) AS participants,
        sum(${decayNow}) AS heat,
        coalesce(sum(${decayPrev}) FILTER (WHERE ${inPrevWindow}), 0) AS heat_prev,
        coalesce(sum(${decayNow}) FILTER (WHERE NOT behind), 0) AS heat_obs,
        coalesce(sum(${decayPrev}) FILTER (WHERE ${inPrevWindow} AND NOT behind), 0) AS heat_prev_obs,
        count(*) FILTER (WHERE behind) AS behind_participants,
        count(*) FILTER (WHERE first_at > ${prev}) AS recent6h,
        count(*) FILTER (WHERE editorial) AS editorial_participants,
        count(*) FILTER (WHERE NOT editorial) AS signal_participants
      FROM obs GROUP BY story_id
    )
    SELECT a.story_id, st.public_id::text AS public_id, st.title, st.first_report_at, st.latest_at,
           a.participants, a.heat, a.heat_prev, a.heat_obs, a.heat_prev_obs, a.behind_participants, a.recent6h, a.editorial_participants, a.signal_participants
    FROM agg a JOIN stories st ON st.id = a.story_id
    WHERE st.merged_into IS NULL`;
}

export function heatIndex(heat: number): number {
  return Math.round(heat * 100) / 10; // one decimal on the 10× scale shown to readers
}

export async function computeHotRanking(at = new Date()): Promise<{ id: number; entries: number }> {
  const reports=await sql<{story_id:number;public_id:string;story_title:string;first_report_at:Date|null;article_id:string;title:string;summary:string;source_id:string;source_name:string;participant:string;tier:string;selected:boolean;score:number|null;category:string|null;timeline_at:Date;url:string}[]>`
    SELECT st.id AS story_id,st.public_id::text,st.title AS story_title,st.first_report_at,p.article_id,p.title,p.summary,
      s.id AS source_id,s.name AS source_name,coalesce('group:'||s.signal_group_id,'source:'||s.id) AS participant,s.tier,p.selected,p.score,p.category,coalesce(p.published_at,p.timeline_at) AS timeline_at,p.url
    FROM publications p JOIN stories st ON st.id=p.story_id JOIN sources s ON s.id=p.source_id
    WHERE st.merged_into IS NULL AND p.visibility='public' AND p.eligible AND NOT p.backfill
      AND coalesce(p.published_at,p.timeline_at)>${at}::timestamptz-interval '48 hours' AND coalesce(p.published_at,p.timeline_at)<=${at}
      AND (NOT p.selected OR p.visible_after<=${at})`;
  const groups=new Map<number,Array<(typeof reports)[number]>>();
  for(const report of reports){const group=groups.get(report.story_id)??[];group.push(report);groups.set(report.story_id,group);}
  const candidates=[...groups.entries()].map(([storyId,items])=>{
    items.sort((a,b)=>Number(b.selected)-Number(a.selected)||(b.score??-Infinity)-(a.score??-Infinity)||Number(b.tier==='T1')-Number(a.tier==='T1')||b.timeline_at.getTime()-a.timeline_at.getTime()||a.article_id.localeCompare(b.article_id));
    const rep=items[0]!,latestAt=new Date(Math.max(...items.map(r=>r.timeline_at.getTime()))).toISOString();
    return {id:rep.public_id,storyId,items,rep,selected:items.some(r=>r.selected),score:rep.score,category:rep.category,latestAt,sourceCount:new Set(items.map(r=>r.participant)).size};
  });
  const entries:HotEntry[]=diverseAttention(candidates,INTELLIGENCE.hotLimit).map((c,index)=>{
    const sourceNames=[...new Set(c.items.map(r=>r.source_name))];
    const participants=[...new Map(c.items.map(r=>[r.participant,{name:r.source_name,kind:'editorial' as const,tier:r.tier}])).values()].sort((a,b)=>tierRank(a.tier)-tierRank(b.tier));
    const sourceTimes=new Map<string,number>();for(const report of c.items)sourceTimes.set(report.participant,Math.max(sourceTimes.get(report.participant)??0,report.timeline_at.getTime()));
    return {rank:index+1,storyId:c.storyId,storyPublicId:c.id,title:c.rep.title,summary:c.rep.summary,category:c.category,selected:c.selected,score:c.score,
      reasons:[...(c.selected?['已入精选']:[]),...(c.items.length>1?['有后续报道']:[]),c.sourceCount>1?'多来源报道':'单一来源'],
      heat:heatIndex([...sourceTimes.values()].reduce((sum,time)=>sum+Math.pow(0.5,(at.getTime()-time)/86400000),0)),
      trend:'unknown',trendPct:null,badges:[],participantCount:c.sourceCount,sourceCount:c.sourceCount,signalCount:0,reportCount:c.items.length,sourceNames,
      latestAt:c.latestAt,firstReportAt:(c.rep.first_report_at??c.rep.timeline_at).toISOString(),representativeItemId:c.rep.article_id,representativeUrl:c.rep.url,representativeSource:c.rep.source_name,participants};
  });
  const [pending]=await sql<{n:number}[]>`SELECT count(*)::int AS n FROM articles a LEFT JOIN publications p ON p.article_id=a.id
    WHERE (a.processing_state IN ('new','blocked') AND a.discovered_at>${at}::timestamptz-interval '48 hours')
      OR (p.story_id IS NULL AND p.visibility='public' AND p.eligible AND NOT p.backfill AND (NOT p.selected OR p.visible_after<=${at})
        AND coalesce(p.published_at,p.timeline_at)>${at}::timestamptz-interval '48 hours' AND coalesce(p.published_at,p.timeline_at)<=${at})`;
  const [row]=await sql<{id:number}[]>`INSERT INTO hot_rankings (computed_at,rule_version,entries,evidence,published)
    VALUES (${at},${HOT_RULE_VERSION},${sql.json(entries as never)},${sql.json({windowHours:48,candidates:candidates.length,pendingCount:pending?.n??0,rankingMode:'attention'} as never)},true) RETURNING id`;
  await sql`DELETE FROM hot_rankings WHERE computed_at<now()-interval '30 days'`;
  return {id:row!.id,entries:entries.length};
}

/**
 * Hourly heat snapshot for active stories (event page trend). An hour taken while a participant's
 * source was behind is marked incomplete (the charts leave it out) and recomputed once the sources
 * have fetched past it: values are deterministic from the signals, which carry the source's time.
 */
export async function snapshotHeat(at = new Date()): Promise<{ stories: number; repaired: number }> {
  const hour = new Date(Math.floor(at.getTime() / 3600000) * 3600000);
  const clocks = await sourceClocks();
  const rows = await heatRows(hour, behindSources(clocks, hour.getTime(), true));
  for (const r of rows) {
    await sql`
      INSERT INTO story_heat_hourly (story_id, hour, heat, participants, cohort, complete)
      VALUES (${r.story_id}, ${hour}, ${heatIndex(Number(r.heat))}, ${Number(r.participants)}, ${Number(r.editorial_participants)}, ${Number(r.behind_participants) === 0})
      ON CONFLICT (story_id, hour) DO UPDATE SET heat = EXCLUDED.heat, participants = EXCLUDED.participants, cohort = EXCLUDED.cohort, complete = EXCLUDED.complete`;
  }
  let repaired = 0;
  const stale = await sql<{ hour: Date; stories: number[] }[]>`
    SELECT hour, array_agg(story_id) AS stories FROM story_heat_hourly
    WHERE NOT complete AND hour < ${hour} AND hour > ${new Date(hour.getTime() - WINDOW_HOURS * 3600000)} GROUP BY hour ORDER BY hour`;
  for (const s of stale) {
    const wanted = new Set(s.stories.map(Number));
    for (const r of await heatRows(s.hour, behindSources(clocks, s.hour.getTime(), false))) {
      if (!wanted.has(Number(r.story_id)) || Number(r.behind_participants) > 0) continue;
      await sql`UPDATE story_heat_hourly SET heat = ${heatIndex(Number(r.heat))}, participants = ${Number(r.participants)}, cohort = ${Number(r.editorial_participants)}, complete = true
                WHERE story_id = ${r.story_id} AND hour = ${s.hour}`;
      repaired += 1;
    }
  }
  return { stories: rows.length, repaired };
}

/** Recomputes hourly snapshots for a story over its history (after imports or regrouping). */
export async function backfillStoryHeat(storyId: number, hours = 7 * 24): Promise<number> {
  const [s] = await sql<{ first: Date | null; last: Date | null }[]>`SELECT min(observed_at) AS first, max(observed_at) AS last FROM story_signals WHERE story_id = ${storyId}`;
  if (!s?.first) return 0;
  const end = Math.floor(Math.min(Date.now(), (s.last?.getTime() ?? Date.now()) + WINDOW_HOURS * 3600000) / 3600000) * 3600000;
  const start = Math.max(Math.floor(s.first.getTime() / 3600000) * 3600000, end - hours * 3600000);
  const clocks = await sourceClocks();
  let n = 0;
  for (let t = start; t <= end; t += 3600000) {
    const rows = (await heatRows(new Date(t), behindSources(clocks, t, false))).filter((r) => Number(r.story_id) === storyId);
    for (const r of rows) {
      await sql`INSERT INTO story_heat_hourly (story_id, hour, heat, participants, cohort, complete)
                VALUES (${storyId}, ${new Date(t)}, ${heatIndex(Number(r.heat))}, ${Number(r.participants)}, ${Number(r.editorial_participants)}, ${Number(r.behind_participants) === 0})
                ON CONFLICT (story_id, hour) DO UPDATE SET heat = EXCLUDED.heat, participants = EXCLUDED.participants, complete = EXCLUDED.complete`;
      n += 1;
    }
  }
  return n;
}
