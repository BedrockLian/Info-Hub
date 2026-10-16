// Repair missed handoffs without calling a model from cron or changing editorial membership.
import { sql } from '../db.ts';
import { isHistorical, STALE_ON_DISCOVERY_MS } from '../content/materials.ts';
import { enqueue, QUEUES } from '../jobs/queue.ts';
import { digestReports, digestInputsHash, digestInputsMatch } from './digest.ts';

let digestCursor=0;

export async function sweepEventWork(): Promise<{groupedQueued:number;digestsQueued:number}> {
  const candidates=await sql<{id:string;revision:number;backfill:boolean;published_at:Date|null;discovered_at:Date}[]>`
    SELECT a.id,a.revision,a.backfill,a.published_at,a.discovered_at FROM articles a
    JOIN sources s ON s.id=a.source_id AND s.enabled AND s.participation_mode='editorial'
    JOIN publications p ON p.article_id=a.id AND p.visibility='public' AND p.eligible
    WHERE a.discovered_at>now()-interval '14 days' AND (NOT p.selected OR p.visible_after<=now())
      AND (NOT a.backfill OR (a.published_at IS NOT NULL AND a.discovered_at-a.published_at<=make_interval(secs=>${STALE_ON_DISCOVERY_MS/1000})))
      AND coalesce(p.published_at,p.discovered_at)<=now()
      AND NOT EXISTS (SELECT 1 FROM fact_articles fa WHERE fa.article_id=a.id AND fa.role IN ('primary','report'))
      AND NOT EXISTS (SELECT 1 FROM grouping_overrides o WHERE o.article_id=a.id)
      AND NOT EXISTS (SELECT 1 FROM pgboss.job j WHERE j.name=${QUEUES.group} AND j.data->>'articleId'=a.id
        AND (j.state IN ('created','retry','active') OR (j.state='failed' AND (j.data->>'inputRevision'=a.revision::text OR (j.data->>'inputRevision' IS NULL AND coalesce(j.completed_on,j.created_on)>=p.updated_at)))))
      AND NOT EXISTS (SELECT 1 FROM receipts r WHERE r.subject='article:'||a.id AND r.purpose='group_article' AND r.status='unknown')
    ORDER BY p.selected DESC,a.discovered_at,a.id LIMIT 40`;
  let groupedQueued=0,digestsQueued=0;
  for(const a of candidates){
    if(isHistorical(a))continue;
    if(await enqueue(QUEUES.group,{articleId:a.id,inputRevision:a.revision},{singletonKey:a.id}))groupedQueued++;
    if(groupedQueued>=20)break;
  }
  const stories=await sql<{id:number;digest:string|null}[]>`
    SELECT st.id,st.digest FROM stories st WHERE st.merged_into IS NULL AND st.latest_at>now()-interval '14 days' AND st.id>${digestCursor}
      AND EXISTS (SELECT 1 FROM facts f JOIN fact_articles fa ON fa.fact_id=f.id JOIN publications p ON p.article_id=fa.article_id
        WHERE f.story_id=st.id AND fa.role IN ('primary','report') AND p.visibility='public' AND p.eligible
          AND (NOT p.selected OR p.visible_after<=now())
          AND (st.digest IS NULL OR p.updated_at>st.digest_updated_at))
      AND NOT EXISTS (SELECT 1 FROM pgboss.job j WHERE j.name=${QUEUES.digest} AND j.data->>'storyId'=st.id::text AND j.state IN ('created','retry','active'))
    ORDER BY st.id LIMIT 40`;
  let scanned=0;
  for(const story of stories){
    digestCursor=story.id;scanned++;
    const reports=await digestReports(story.id);if(!reports.length)continue;
    const inputHash=digestInputsHash(reports);
    const [last]=await sql<{inputs_hash:string|null;article_ids:string[]}[]>`SELECT inputs_hash,article_ids FROM story_digests WHERE story_id=${story.id} ORDER BY version DESC LIMIT 1`;
    if(story.digest && last && (digestInputsMatch(reports,last.inputs_hash) || (last.inputs_hash===null && JSON.stringify([...last.article_ids].sort())===JSON.stringify(reports.map(r=>r.id).sort()))))continue;
    const [blocked]=await sql<{blocked:boolean}[]>`SELECT EXISTS (SELECT 1 FROM pgboss.job j WHERE j.name=${QUEUES.digest} AND j.data->>'storyId'=${String(story.id)} AND j.state='failed'
      AND (j.data->>'inputHash'=${inputHash} OR (j.data->>'inputHash' IS NULL AND j.created_on>=(SELECT max(p.updated_at) FROM publications p WHERE p.article_id=ANY(${reports.map(r=>r.id)})))))
      OR EXISTS (SELECT 1 FROM receipts r WHERE r.purpose='story_digest' AND r.subject LIKE ${`story:${story.id}@%`} AND r.status='unknown') AS blocked`;
    if(blocked?.blocked)continue; // Existing finite job retries remain the automatic failure limit.
    if(await enqueue(QUEUES.digest,{storyId:story.id,inputHash},{singletonKey:`story:${story.id}`,startAfter:60}))digestsQueued++;
    if(digestsQueued>=8)break;
  }
  // A window of unchanged/legacy editions must not starve later changed events.
  if(scanned===stories.length && stories.length<40)digestCursor=0;
  return {groupedQueued,digestsQueued};
}
