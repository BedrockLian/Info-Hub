// Read the latest attention ranking; legacy heat fields remain compatible with older consumers.
import type { HotParticipant, HotStripEntry } from "@aihot/contracts/site";
import { sql } from "../db.ts";
import { config } from '../config.ts';
import { proxiedImage, proxiedImageSet } from "../media/imgproxy.ts";

export interface HotEntry {
  category?:string|null;
  selected?:boolean;
  score?:number|null;
  reasons?:string[];
  summary?:string|null;
  rank: number;
  storyId: number;
  storyPublicId: string;
  title: string;
  heat: number;
  /** "unknown": the earlier participants' sources were behind on collection, so there is no comparison. */
  trend: "up" | "down" | "flat" | "new" | "unknown";
  trendPct: number | null;
  badges: Array<"surge" | "new" | "rising">;
  participantCount: number;
  sourceCount: number;
  signalCount: number;
  reportCount: number;
  sourceNames: string[];
  latestAt: string;
  firstReportAt: string;
  representativeItemId: string | null;
  representativeUrl: string | null;
  representativeSource: string | null;
  /** 精选组 first by tier, then 氛围组; tier is absent on rankings from before 2026-09-29. */
  participants: Array<{ name: string; kind: "editorial" | "signal"; tier?: string }>;
}

/** Faces are the 精选组 sources, T1 before T1.5 before T2; the rest (and 氛围组) count in "+N". */
const MAX_FACES = 6;
const TIER_ORDER = ["T1", "T1_5", "T2"];
export function tierRank(tier: string | undefined): number {
  const i = TIER_ORDER.indexOf(tier ?? "");
  return i < 0 ? TIER_ORDER.length : i;
}

export interface HotRanking {
  id: number;
  computedAt: string;
  ruleVersion: string;
  entries: HotEntry[];
  coverage: Record<string, unknown> | null;
}

let rankingPending: Promise<HotRanking | null> | null = null;

export function latestHotRanking(): Promise<HotRanking | null> {
  if (config.privateSite) return queryLatestHotRanking();
  rankingPending ??= queryLatestHotRanking().finally(() => { rankingPending = null; });
  return rankingPending;
}

async function queryLatestHotRanking(): Promise<HotRanking | null> {
  const [row] = await sql<{ id: number; computed_at: Date; rule_version: string; entries: HotEntry[]; evidence: Record<string, unknown> | null }[]>`
    SELECT id, computed_at, rule_version, entries, evidence FROM hot_rankings WHERE published ORDER BY computed_at DESC LIMIT 1`;
  if (!row) return null;
  if ((config.privateSite || row.rule_version.startsWith('attention-')) && row.entries.length) {
    const live=await sql<{id:number;title:string;summary:string;article_id:string;url:string;source_name:string;source_id:string;participant:string;tier:string;category:string|null;selected:boolean;score:number|null;at:Date}[]>`
      SELECT st.id,p.title,p.summary,p.article_id,p.url,s.name AS source_name,s.id AS source_id,coalesce('group:'||s.signal_group_id,'source:'||s.id) AS participant,s.tier,p.category,p.selected,p.score,coalesce(p.published_at,p.timeline_at) AS at
      FROM stories st JOIN facts f ON f.story_id=st.id JOIN fact_articles fa ON fa.fact_id=f.id
      JOIN publications p ON p.article_id=fa.article_id JOIN sources s ON s.id=p.source_id
      WHERE st.id=ANY(${row.entries.map(e=>e.storyId)}::bigint[]) AND st.merged_into IS NULL
      AND p.visibility='public' AND p.eligible AND NOT p.backfill AND (NOT p.selected OR p.visible_after<=now())
      AND coalesce(p.published_at,p.timeline_at)>now()-interval '48 hours' AND coalesce(p.published_at,p.timeline_at)<=now()
      ORDER BY st.id,p.selected DESC,p.score DESC NULLS LAST,coalesce(p.published_at,p.timeline_at) DESC,p.article_id`;
    const byId=new Map<number,Array<(typeof live)[number]>>();
    for(const report of live){const items=byId.get(report.id)??[];if(!items.some(e=>e.article_id===report.article_id))items.push(report);byId.set(report.id,items);}
    row.entries=row.entries.filter(e=>byId.has(e.storyId)).map((e,index)=>{
      const items=byId.get(e.storyId)!,r=items[0]!,sourceCount=new Set(items.map(i=>i.participant)).size,selected=items.some(i=>i.selected);
      return {...e,rank:index+1,title:r.title,summary:r.summary,category:r.category,selected,score:r.score,sourceCount,participantCount:sourceCount,reportCount:items.length,sourceNames:[...new Set(items.map(i=>i.source_name))],
        latestAt:new Date(Math.max(...items.map(i=>i.at.getTime()))).toISOString(),reasons:[...(selected?['已入精选']:[]),...(items.length>1?['有后续报道']:[]),sourceCount>1?'多来源报道':'单一来源'],
        participants:[...new Map(items.map(i=>[i.participant,{name:i.source_name,kind:'editorial' as const,tier:i.tier}])).values()],representativeItemId:r.article_id,representativeUrl:r.url,representativeSource:r.source_name};
    });
  }
  return { id: row.id, computedAt: row.computed_at.toISOString(), ruleVersion: row.rule_version, entries: row.entries, coverage: row.evidence };
}

// Faces and words change only with the ranking, so they are read once per ranking.
interface Extras {
  faces: Map<string, string | null>;
  texts: Map<number, { summary: string | null; latest: string | null }>;
}
let extrasCache: { rankingId: number; extras: Extras } | null = null;
const extrasPending = new Map<number, Promise<Extras>>();

async function readExtras(ranking: HotRanking): Promise<Extras> {
  if (config.privateSite) return queryExtras(ranking);
  if (!config.privateSite && extrasCache?.rankingId === ranking.id) return extrasCache.extras;
  const pending = extrasPending.get(ranking.id);
  if (pending) return pending;
  const load = queryExtras(ranking);
  extrasPending.set(ranking.id, load);
  try { return await load; }
  finally { extrasPending.delete(ranking.id); }
}

async function queryExtras(ranking: HotRanking): Promise<Extras> {
  const ids = ranking.entries.map((e) => e.storyId);
  const [faces, texts] = await Promise.all([
    // A participant's face: the source's icon, else the avatar on that account's latest post in the story.
    sql<{ name: string; icon_url: string | null; avatar: string | null }[]>`
      SELECT DISTINCT ON (s.id) s.name, s.icon_url, a.x_post->>'avatarUrl' AS avatar
      FROM story_signals ss JOIN sources s ON s.id = ss.source_id
      LEFT JOIN articles a ON a.id = ss.article_id AND a.x_post ? 'avatarUrl'
      WHERE ss.story_id = ANY(${ids}::bigint[])
      ORDER BY s.id, (a.id IS NULL), a.discovered_at DESC`,
    sql<{ id: number; digest: string | null; summary: string | null; latest: string | null }[]>`
      SELECT id, digest, summary, latest FROM stories WHERE id = ANY(${ids}::bigint[])`,
  ]);
  const extras: Extras = {
    faces: new Map(faces.map((f) => [f.name, f.icon_url ?? f.avatar])),
    texts: new Map(texts.map((t) => [Number(t.id), { summary: t.digest ?? t.summary, latest: t.latest }])),
  };
  extrasCache = { rankingId: ranking.id, extras };
  return extras;
}

/**
 * What the web adds to a ranking entry: participants with proxied faces in the order Faces shows them
 * (精选组 by tier, a real face before an initial within a tier, then 氛围组), the digest and the latest turn.
 */
export async function rankingExtras(ranking: HotRanking) {
  const { faces, texts } = await readExtras(ranking);
  return {
    participants: (e: HotEntry): HotParticipant[] => {
      const people = e.participants
        .map((p, i) => ({ p, i, icon: faces.get(p.name) ?? null }))
        .sort((x, y) => Number(y.p.kind === "editorial") - Number(x.p.kind === "editorial") || tierRank(x.p.tier) - tierRank(y.p.tier) || Number(!!y.icon) - Number(!!x.icon) || x.i - y.i);
      // Every name stays for the tooltip; only visible Faces need srcSet.
      return people.map(({ p, icon }, i): HotParticipant => {
        const person: HotParticipant = { name: p.name, kind: p.kind, iconUrl: proxiedImage(icon, "avatar") };
        const srcSet = p.kind === "editorial" && i < MAX_FACES ? proxiedImageSet(icon, "avatar") : undefined;
        if (srcSet) person.iconSrcSet = srcSet;
        return person;
      });
    },
    text: (e: HotEntry) => {const text=texts.get(e.storyId);return {summary:e.summary??text?.summary??null,latest:text?.latest??null};},
  };
}

/** Home "current hot" strip: 3–5 entries from the same ranking, hidden when there are fewer than 3. */
export async function loadHotStrip(): Promise<HotStripEntry[] | null> {
  const ranking = await latestHotRanking();
  if (!ranking || ranking.entries.length < 3) return null;
  const extras = await rankingExtras(ranking);
  return ranking.entries.slice(0, 5).map((e) => ({
    rank: e.rank,
    title: e.title,
    heat: e.heat,
    trend: e.trend,
    storyPublicId: e.storyPublicId,
    itemId: e.representativeItemId,
    participants: extras.participants(e),
    participantCount: e.participantCount,
  }));
}
