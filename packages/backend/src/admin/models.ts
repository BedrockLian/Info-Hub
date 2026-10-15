// Admin "模型与评测": the model each capability uses and where that choice comes from,
// the prompt versions in use, quality / latency / cost of the last days per model, the switch history
// and the SelectBench runs that compare models on the same batch. A switch is audited and applies to
// new work only.
import { sql } from "../db.ts";
import { CAPABILITIES, invalidateModelCache, modelSources, type Capability, type CapabilityKey } from "../editorial/models.ts";
import { MODELS } from "../providers/llm.ts";
import { audit } from "./auth.ts";

interface UsageRow {
  purpose: string;
  model: string | null;
  prompt_version: string | null;
  runtime:string;
  runtime_version:string|null;
  input_band:string;
  effort:string|null;
  template_hash:string|null;
  calls: number;
  ok: number;
  failed: number;
  unknown: number;
  p50: number | null;
  p95: number | null;
  tokens_in: string | null;
  tokens_out: string | null;
  cached_tokens: string | null;
  cache_input: string | null;
  cache_known_calls:number;
  reasoning_tokens:string|null;
  reasoning_known_calls:number;
  input_known_calls:number;
  output_known_calls:number;
  fixed_prefix_chars:number|null;
  audit_calls:number;
  actual_cost: string | null;
  estimated_cost:string|null;
  reserved_usd:string|null;
  currency: string | null;
}

// Mirror native counter validation: JSON numbers, nonnegative safe integers only. CASE guards casts.
const safeCounter=(field:ReturnType<typeof sql>)=>sql`CASE WHEN jsonb_typeof(${field})='number' THEN
  CASE WHEN (${field})::text::numeric BETWEEN 0 AND 9007199254740991
    AND trunc((${field})::text::numeric)=(${field})::text::numeric THEN (${field})::text::numeric END END`;

export async function modelsOverview(days = 7) {
  const since = new Date(Date.now() - days * 86400_000);
  const [sources, usage, prices, history, benches,cacheEvents] = await Promise.all([
    modelSources(),
    sql<UsageRow[]>`
      SELECT r.purpose, a.model, r.request->>'promptVersion' AS prompt_version,
             coalesce(r.request->>'runtime','direct') AS runtime,r.request->>'reasoningEffort' AS effort,r.request->>'templateHash' AS template_hash,
             r.request->>'runtimeVersion' AS runtime_version,
             CASE WHEN n.input IS NULL THEN 'unknown' WHEN n.input<=2048 THEN '0-2k' WHEN n.input<=8192 THEN '2k-8k' WHEN n.input<=32768 THEN '8k-32k' ELSE '32k+' END AS input_band,
             a.currency,
             count(*)::int AS calls,
             count(*) FILTER (WHERE a.status = 'received')::int AS ok,
             count(*) FILTER (WHERE a.status = 'failed')::int AS failed,
             count(*) FILTER (WHERE a.status = 'unknown')::int AS unknown,
             percentile_disc(0.5) WITHIN GROUP (ORDER BY a.latency_ms) AS p50,
             percentile_disc(0.95) WITHIN GROUP (ORDER BY a.latency_ms) AS p95,
             sum(n.input) AS tokens_in,sum(n.output) AS tokens_out,
             sum(c.hit) AS cached_tokens,
             sum(CASE WHEN c.hit IS NOT NULL THEN n.input END) AS cache_input,
             count(*) FILTER(WHERE c.hit IS NOT NULL)::int AS cache_known_calls,
             sum(CASE WHEN n.reasoning<=n.output THEN n.reasoning END) AS reasoning_tokens,
             count(*) FILTER(WHERE n.reasoning<=n.output)::int AS reasoning_known_calls,
             count(n.input)::int AS input_known_calls,count(n.output)::int AS output_known_calls,
             max(n.prefix_chars) AS fixed_prefix_chars,count(n.prefix_chars)::int AS audit_calls,
             sum(a.cost) FILTER (WHERE a.cost_basis = 'actual') AS actual_cost,
             sum(a.cost) FILTER (WHERE a.cost_basis = 'estimated') AS estimated_cost,
             sum(a.budget_charge_usd) FILTER(WHERE a.cost IS NULL) AS reserved_usd
      FROM receipt_attempts a JOIN receipts r ON r.id = a.receipt_id
      CROSS JOIN LATERAL (SELECT ${safeCounter(sql`a.usage->'prompt_tokens'`)} AS input,
        ${safeCounter(sql`a.usage->'completion_tokens'`)} AS output,
        ${safeCounter(sql`a.usage->'prompt_cache_hit_tokens'`)} AS hit,
        ${safeCounter(sql`a.usage->'prompt_cache_miss_tokens'`)} AS miss,
        ${safeCounter(sql`a.usage#>'{completion_tokens_details,reasoning_tokens}'`)} AS reasoning,
        ${safeCounter(sql`r.request#>'{promptAudit,prefixChars}'`)} AS prefix_chars) n
      CROSS JOIN LATERAL (SELECT CASE WHEN n.hit<=n.input
        AND (NOT a.usage ? 'prompt_cache_miss_tokens' OR n.hit+n.miss=n.input) THEN n.hit END AS hit) c
      WHERE a.started_at >= ${since} AND a.origin = 'live' AND a.model IS NOT NULL
      GROUP BY 1,2,3,4,5,6,7,8,9 ORDER BY 1,calls DESC`,
    sql<{ service: string; model: string; currency: string; input_per_mtok: string | null; output_per_mtok: string | null }[]>`
      SELECT service, model, currency, input_per_mtok, output_per_mtok FROM service_prices`,
    sql<{ at: Date; actor: string; subject: string; reason: string | null; before: unknown; after: unknown }[]>`
      SELECT created_at AS at, actor, subject, reason, before, after FROM audit_log WHERE action = 'models.switch' ORDER BY created_at DESC LIMIT 30`,
    sql<{ id: string; label: string; sample_size: number; prompt_version: string | null; models: string[]; summary: unknown; created_at: Date }[]>`
      SELECT id, label, sample_size, prompt_version, models,
             (SELECT coalesce(jsonb_object_agg(key, value - 'sweep'), '{}'::jsonb) FROM jsonb_each(r.summary)) AS summary,
             created_at FROM selectbench_runs r ORDER BY created_at DESC LIMIT 8`,
    sql<{purpose:string;lookups:number;hits:number;templates:string[]}[]>`SELECT purpose,count(*)::int AS lookups,count(*) FILTER(WHERE reused)::int AS hits,array_agg(DISTINCT template_hash) AS templates FROM model_result_cache_events WHERE created_at>=${since} GROUP BY purpose`,
  ]);
  const serviceOf = (model: string) => Object.values(MODELS).find((m) => m.model === model || m.key === model)?.service ?? null;
  const priced = (u: UsageRow) => {
    const service = u.model ? serviceOf(u.model) : null;
    const p = prices.find((x) => x.service === service && x.model === u.model) ?? prices.find((x) => x.service === service && x.model === "");
    if (!p || (!p.input_per_mtok && !p.output_per_mtok)||u.input_known_calls!==u.calls||u.output_known_calls!==u.calls) return null;
    return { amount: (Number(u.tokens_in ?? 0) / 1e6) * Number(p.input_per_mtok ?? 0) + (Number(u.tokens_out ?? 0) / 1e6) * Number(p.output_per_mtok ?? 0), currency: p.currency };
  };
  const cacheFor=(purposes:string[])=>{
    const rows=cacheEvents.filter(e=>purposes.includes(e.purpose));
    return {lookups:rows.reduce((n,e)=>n+e.lookups,0),hits:rows.reduce((n,e)=>n+e.hits,0),templates:new Set(rows.flatMap(e=>e.templates)).size};
  };
  const capabilities = (Object.entries(CAPABILITIES) as Array<[CapabilityKey, Capability]>).map(([key, c]) => ({
    key,
    label: c.label,
    env: c.env,
    defaultModel: c.default,
    vision: !!c.vision,
    current: sources[key]!,
    resultCache:cacheFor(c.purposes),
    usage: usage
      .filter((u) => c.purposes.includes(u.purpose))
      .map((u) => ({
        purpose: u.purpose,
        model: u.model,
        promptVersion: u.prompt_version,
        runtime:u.runtime,effort:u.effort,templateHash:u.template_hash,
        runtimeVersion:u.runtime_version,inputBand:u.input_band,
        calls: u.calls,
        ok: u.ok,
        failed: u.failed,
        unknown: u.unknown,
        p50: u.p50,
        p95: u.p95,
        tokensIn: Number(u.tokens_in ?? 0),
        tokensOut: Number(u.tokens_out ?? 0),
        cachedInput:u.cached_tokens===null?null:Number(u.cached_tokens),
        uncachedInput:u.cache_input===null?null:Number(u.cache_input)-Number(u.cached_tokens??0),
        cacheKnownInput:u.cache_input===null?null:Number(u.cache_input),
        cacheKnownCalls:u.cache_known_calls,cacheUnknownCalls:u.calls-u.cache_known_calls,
        reasoningTokens:u.reasoning_tokens===null?null:Number(u.reasoning_tokens),reasoningKnownCalls:u.reasoning_known_calls,
        inputKnownCalls:u.input_known_calls,outputKnownCalls:u.output_known_calls,
        fixedPrefixChars:u.fixed_prefix_chars===null?null:Number(u.fixed_prefix_chars),auditCalls:u.audit_calls,
        cacheHitRate:u.cache_input===null||Number(u.cache_input)===0?null:Number(u.cached_tokens??0)/Number(u.cache_input),
        actualCost: u.actual_cost === null ? null : Number(u.actual_cost),
        estimatedCost:u.estimated_cost===null?null:Number(u.estimated_cost),reservedUsd:Number(u.reserved_usd??0),
        currency: u.currency,
        estimate: u.estimated_cost===null?priced(u):{amount:Number(u.estimated_cost),currency:u.currency??'USD'},
      })),
  }));
  const choices = Object.values(MODELS).map((m) => ({ key: m.key, service: m.service, vision: !!m.vision }));
  return { days, capabilities, choices, history, benches };
}

/** Switches a capability to another registered model (or back to the environment/default when null). */
export async function switchModel(capability: string, model: string | null, reason: string, actor: string) {
  const c = (CAPABILITIES as Record<string, Capability>)[capability];
  if (!c) throw Object.assign(new Error("unknown capability"), { statusCode: 400 });
  if (!reason.trim()) throw Object.assign(new Error("a reason is required"), { statusCode: 400 });
  if (model !== null) {
    const spec = MODELS[model];
    if (!spec) throw Object.assign(new Error("unknown model"), { statusCode: 400 });
    if (!!c.vision !== !!spec.vision) throw Object.assign(new Error(c.vision ? "this capability needs a vision model" : "a vision-only model cannot do this"), { statusCode: 400 });
  }
  const before = (await modelSources())[capability];
  if (model === null) await sql`DELETE FROM settings WHERE key = ${`models.${capability}`}`;
  else {
    await sql`INSERT INTO settings (key, value, updated_by) VALUES (${`models.${capability}`}, ${sql.json({ model })}, ${actor})
              ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`;
  }
  invalidateModelCache();
  const after = (await modelSources())[capability];
  await audit(actor, "models.switch", `capability:${capability}`, reason, before ?? null, after ?? null);
  return { capability, before, after };
}
