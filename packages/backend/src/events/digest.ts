// Story digest: rewritten incrementally as reports arrive; contradictions with earlier reporting are
// stated explicitly. v1 `digest` and `latest` read the same stored version.
import { z } from "zod";
import { modelFor } from "../editorial/models.ts";
import { sql, type Db } from "../db.ts";
import { chatJson } from "../providers/llm.ts";
import { completeReceipt } from "../providers/receipts.ts";
import { sha256, stableJson } from "../lib/ids.ts";
import { promptText, promptVersion } from "../editorial/prompts.ts";

export const DIGEST_PROMPT_VERSION = promptVersion("story-digest");

const SYSTEM = promptText("story-digest");

const Schema = z.object({
  title: z.string().max(120).catch(""),
  digest: z.string().min(10).max(2000),
  latest: z.string().min(1).max(300),
  citedArticleIds: z.array(z.string()).min(1).max(40),
  latestArticleId: z.string().min(1),
});

export interface DigestReport {
  id: string; title: string; summary: string | null; source_id: string; source_name: string;
  first_party: boolean; at: Date; revision: number;
}

export async function digestReports(storyId: number, db: Db = sql): Promise<DigestReport[]> {
  return db<DigestReport[]>`
    SELECT DISTINCT ON (p.article_id) p.article_id AS id, p.title, p.summary, p.source_id, s.name AS source_name,
      p.first_party, coalesce(p.published_at, p.discovered_at) AS at, p.revision
    FROM facts f JOIN fact_articles fa ON fa.fact_id=f.id JOIN publications p ON p.article_id=fa.article_id
    JOIN sources s ON s.id=p.source_id
    WHERE f.story_id=${storyId} AND fa.role IN ('primary','report') AND p.visibility='public' AND p.eligible
      AND (NOT p.selected OR p.visible_after<=now()) AND coalesce(p.published_at,p.discovered_at)<=now()
    ORDER BY p.article_id`;
}

export function digestInputsHash(reports: DigestReport[]): string {
  return sha256(stableJson([...reports].sort((a,b)=>a.id.localeCompare(b.id)).map(r=>[r.id,r.revision,r.title,r.summary??'',r.source_id,r.source_name,r.first_party,r.at.toISOString()])));
}

export function digestInputsMatch(reports: DigestReport[], hash: string | null): boolean {
  // Earlier versions recorded title/summary only. Keep these editions until evidence changes.
  const legacy=sha256(stableJson([...reports].sort((a,b)=>a.id.localeCompare(b.id)).map(r=>[r.id,r.title,r.summary??''])));
  return hash===digestInputsHash(reports) || hash===legacy;
}

export function storyStatusFor(latestAt: Date | null, now = Date.now()): "active" | "watching" | "settled" {
  if (!latestAt) return "settled";
  const age = now - latestAt.getTime();
  if (age < 24 * 3600 * 1000) return "active";
  if (age < 72 * 3600 * 1000) return "watching";
  return "settled";
}

/** `afterCorrection`: an editor changed a report of this story; rewrite even when older versions lack inputs. */
export async function composeStoryDigest(storyId: number, opts: { afterCorrection?: boolean } = {}): Promise<{ updated: boolean; version?: number }> {
  // The lock is separate from evidence locks: a slow model must not block withdrawals.
  return await sql.begin(async guard => {
    const [lock]=await guard<{locked:boolean}[]>`SELECT pg_try_advisory_xact_lock(73146,${storyId}::int) AS locked`;
    if(!lock?.locked)return {updated:false};
    return composeUnlocked(storyId,opts);
  }) as {updated:boolean;version?:number};
}

async function composeUnlocked(storyId: number, opts: { afterCorrection?: boolean }): Promise<{updated:boolean;version?:number}> {
  const [story] = await sql<{ id: number; title: string; digest: string | null; version: number; origin: string }[]>`
    SELECT id, title, digest, version, origin FROM stories WHERE id = ${storyId} AND merged_into IS NULL`;
  if (!story) return { updated: false };
  const reports = await digestReports(storyId);
  if (reports.length === 0) return { updated: false };
  reports.sort((a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id));
  const ids = reports.map((r) => r.id).sort();
  // What this version is written from: the reports and what they currently say (corrections included).
  const inputsHash = digestInputsHash(reports);
  const [last] = await sql<{ article_ids: string[]; inputs_hash: string | null }[]>`
    SELECT article_ids, inputs_hash FROM story_digests WHERE story_id = ${storyId} ORDER BY version DESC LIMIT 1`;
  const sameReports = !!last && JSON.stringify([...last.article_ids].sort()) === JSON.stringify(ids);
  // Versions written before inputs were recorded compare by report set only.
  if (story.digest && sameReports && (digestInputsMatch(reports,last!.inputs_hash) || (last!.inputs_hash === null && !opts.afterCorrection))) return { updated: false };
  // Same reports, different content: an editor corrected one. Rewrite from the reports as they are now,
  // without the previous digest, so a corrected fact does not survive as "earlier reports said".
  const material=reports.length<=40?reports:[reports[0]!,...reports.slice(-39)];
  const user=stableJson(material.map(r=>({id:r.id,title:r.title,summary:(r.summary??'').slice(0,360),source:r.source_name,firstParty:r.first_party,reportedAt:r.at.toISOString()})));
  const allowed=new Set(material.map(r=>r.id));
  const schema=Schema.refine(value=>value.citedArticleIds.every(id=>allowed.has(id)) && new Set(value.citedArticleIds).size===value.citedArticleIds.length && value.citedArticleIds.includes(value.latestArticleId),'Citations must be unique material IDs and include latestArticleId');
  const res = await chatJson({
    model: await modelFor("digest"), purpose: "story_digest", subject: `story:${storyId}@${ids.length}`, promptVersion: DIGEST_PROMPT_VERSION,
    system: SYSTEM, user, schema, temperature: 0.3, maxTokens: 1200,
  });
  const version = story.version + 1;
  const updated = await sql.begin(async (tx) => {
    // Publication changes and concurrent composers may happen while the provider is answering.
    // Lock the evidence, then the story (the same order as publication withdrawal) before committing.
    await tx`SELECT article_id FROM publications WHERE article_id IN (
      SELECT fa.article_id FROM fact_articles fa JOIN facts f ON f.id=fa.fact_id WHERE f.story_id=${storyId})
      ORDER BY article_id FOR SHARE`;
    const current=await digestReports(storyId,tx);
    const [live] = await tx<{version:number;merged_into:number|null}[]>`SELECT version,merged_into FROM stories WHERE id=${storyId} FOR UPDATE`;
    const currentHash=digestInputsHash(current);
    if (live?.version !== story.version || live.merged_into || currentHash !== inputsHash) {await completeReceipt(tx,res.receiptId);return false;}
    await tx`INSERT INTO story_digests (story_id, version, digest, latest, receipt_id, article_ids, inputs_hash, cited_article_ids, latest_article_id)
             VALUES (${storyId}, ${version}, ${res.data.digest}, ${res.data.latest || null}, ${res.receiptId}, ${ids}, ${inputsHash}, ${res.data.citedArticleIds}, ${res.data.latestArticleId})`;
    await tx`UPDATE stories SET digest = ${res.data.digest}, latest = ${res.data.latest || null}, digest_updated_at = now(),
               title = CASE WHEN origin = 'manual' OR ${res.data.title} = '' THEN title ELSE ${res.data.title} END,
               version = ${version}, updated_at = now()
             WHERE id = ${storyId}`;
    await completeReceipt(tx, res.receiptId);
    return true;
  });
  return updated ? { updated: true, version } : {updated:false};
}

/** Periodic: statuses follow activity (持续更新 / 观察中 / 历史事件). */
export async function refreshStoryStatuses(): Promise<{ updated: number }> {
  const res = await sql`
    UPDATE stories SET status = CASE
      WHEN latest_at > now() - interval '24 hours' THEN 'active'
      WHEN latest_at > now() - interval '72 hours' THEN 'watching'
      ELSE 'settled' END
    WHERE merged_into IS NULL AND status <> CASE
      WHEN latest_at > now() - interval '24 hours' THEN 'active'
      WHEN latest_at > now() - interval '72 hours' THEN 'watching'
      ELSE 'settled' END`;
  return { updated: res.count };
}
