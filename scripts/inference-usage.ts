// Read-only production observation. Prints aggregate usage, never model text or credentials.
// node --env-file-if-exists=.env scripts/inference-usage.ts --days 7
import {sql,closeDb} from '@aihot/backend/db';

const index=process.argv.indexOf('--days');
const days=index<0?7:Number(process.argv[index+1]);
if(!Number.isInteger(days)||days<1||days>30)throw new Error('--days must be an integer from 1 to 30');
try {
  const since=new Date(Date.now()-days*86400000);
  const rows=await sql`
    SELECT r.purpose, r.request->>'instructionPolicy' AS instruction_policy,
      r.request->>'reasoningEffort' AS effort, r.request->>'softThinkingTokens' AS soft_thinking_target,
      count(*)::int AS attempts, count(*) FILTER(WHERE a.usage IS NOT NULL)::int AS known_usage,
      count(*) FILTER(WHERE a.status='failed')::int AS failed,
      round(avg((a.usage->>'prompt_tokens')::numeric)) AS mean_input,
      round(avg((a.usage->>'completion_tokens')::numeric)) AS mean_total_output,
      round(avg((a.usage->'completion_tokens_details'->>'reasoning_tokens')::numeric)) AS mean_reasoning,
      percentile_disc(0.5) WITHIN GROUP(ORDER BY (a.usage->>'completion_tokens')::numeric) AS median_total_output,
      percentile_disc(0.95) WITHIN GROUP(ORDER BY (a.usage->>'completion_tokens')::numeric) AS p95_total_output,
      round(avg(a.latency_ms)) AS mean_latency_ms, sum(a.cost) AS estimated_usd
    FROM receipt_attempts a JOIN receipts r ON r.id=a.receipt_id
    WHERE a.origin='live' AND a.started_at>=${since}
      AND r.request->>'reasoningPolicy' IS NOT NULL
    GROUP BY 1,2,3,4 ORDER BY 1,2 NULLS FIRST,3`;
  console.log(JSON.stringify({days,at:new Date().toISOString(),basis:'Small or unmatched samples cannot establish savings or judgement quality; total output includes final answer and thinking. Missing reasoning usage is null.',rows},null,2));
} finally {await closeDb();}
