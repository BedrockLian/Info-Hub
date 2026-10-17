import { gate, stub, tag } from './setup.ts';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { z } from 'zod';
import { config } from '../packages/backend/src/config.ts';
import { sql } from '../packages/backend/src/db.ts';
import { chatJson } from '../packages/backend/src/providers/llm.ts';
import { buildApp } from '../apps/api/src/app.ts';
import { passwordLogin, SESSION_COOKIE } from '../packages/backend/src/admin/auth.ts';
import { assertAiEnabled, AiPausedError } from '../packages/backend/src/providers/ai-control.ts';
import { paidRequest } from '../packages/backend/src/providers/receipts.ts';
import { TemplateBatcher } from '../packages/backend/src/providers/pi-batch.ts';
import { registerContentJobs } from '../packages/backend/src/jobs/content.ts';
import { registerEventJobs } from '../packages/backend/src/jobs/events.ts';
import { registerReportJobs } from '../packages/backend/src/jobs/reports.ts';
import { QUEUES, stopBoss } from '../packages/backend/src/jobs/queue.ts';
import type { PgBoss } from 'pg-boss';
import { upsertMaterial } from '../packages/backend/src/content/materials.ts';
import { translatePending } from '../packages/backend/src/editorial/translate.ts';
import { collectFindings } from '../packages/backend/src/operations/alerts.ts';

config.adminPassword = 'local-ai-control-test-password';
const app = await buildApp();
const login = await passwordLogin(config.adminPassword, '/admin/settings', undefined);
const cookie = `${SESSION_COOKIE}=${login.token}`;
const me = (await app.inject({ url: '/api/admin/me', headers: { cookie } })).json();
const headers = { cookie, 'x-csrf-token': me.csrf };
const provider = await stub(() => ({ choices: [{ message: { content: '{"ok":true}' } }] }));
process.env.DEEPSEEK_BASE_URL = `${provider.url}/v1`;
process.env.DEEPSEEK_API_KEY = 'test-key';
const set = (enabled: unknown, h = headers) => app.inject({ method: 'PUT', url: '/api/admin/settings/ai', headers: h, payload: { enabled } });
const ask = (subject: string) => chatJson({ model: 'deepseek-flash', purpose: 'ai_control_test', subject, promptVersion: 'test', system: 's', user: subject, schema: z.object({ ok: z.boolean() }) });
after(async () => { await sql`DELETE FROM settings WHERE key='runtime.ai'`; await stopBoss(); await app.close(); await provider.close(); await sql.end(); });

test('AI switch requires an admin session and CSRF, validates booleans, and audits changes only', async () => {
  assert.equal((await set(false, {} as typeof headers)).statusCode, 401);
  assert.equal((await set(false, { cookie } as typeof headers)).statusCode, 403);
  assert.equal((await set('false')).statusCode, 400);
  const token = (await app.inject({method:'POST',url:'/api/admin/read-tokens',headers,payload:{name:'AI control read-only fixture',days:1}})).json().token;
  assert.equal((await app.inject({method:'PUT',url:'/api/admin/settings/ai',headers:{authorization:`Bearer ${token}`},payload:{enabled:false}})).statusCode, 401);
  const before = (await sql`SELECT count(*)::int AS n FROM audit_log WHERE action='settings.ai'`)[0]!.n;
  assert.equal((await set(false)).statusCode, 200);
  assert.equal((await set(false)).statusCode, 200, 'absolute writes are safe to retry');
  const settings = (await app.inject({ url: '/api/admin/settings', headers: { cookie } })).json();
  assert.equal(settings.ai.enabled, false);
  assert.equal(settings.ai.effectiveEnabled, false);
  const [audit] = await sql`SELECT count(*)::int AS n FROM audit_log WHERE action='settings.ai'`;
  assert.equal(audit!.n, before + 1);
});

test('pause blocks new model requests without spending or losing received answers; resume preserves budgets', async () => {
  await set(true);
  const subject = `ai-control-${tag()}`;
  const first = await ask(subject);
  const budgets = await sql`SELECT * FROM budgets ORDER BY service`;
  await set(false);
  const before = provider.hits();
  const [attempts] = await sql`SELECT count(*)::int AS n FROM receipt_attempts`;
  await assert.rejects(ask(subject + '-paused'), /AI.*paused/i);
  assert.equal((await ask(subject)).receiptId, first.receiptId, 'stored answers remain reusable');
  assert.equal(provider.hits(), before);
  assert.equal((await sql`SELECT count(*)::int AS n FROM receipt_attempts`)[0]!.n, attempts!.n);
  await set(true);
  await ask(subject + '-resumed');
  assert.equal(provider.hits(), before + 1);
  assert.deepEqual(await sql`SELECT * FROM budgets ORDER BY service`, budgets);
});

test('web switch never overrides the deployment model safety valve', async () => {
  config.modelCallsEnabled = false;
  try {
    const response = await set(true);
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().enabled, true);
    assert.equal(response.json().effectiveEnabled, false);
    assert.equal(response.json().deploymentEnabled, false);
    await assert.rejects(ask(`ai-env-${tag()}`), /disabled/);
  } finally { config.modelCallsEnabled = true; }
});

test('a request waiting in a template batch is checked after dispatch, and an already sent request can finish', async () => {
  await set(true);
  const held = gate(), entered = gate();
  const slow = await stub(async () => { entered.open(); await held.promise; return { choices: [{ message: { content: '{"ok":true}' } }] }; });
  const base = process.env.DEEPSEEK_BASE_URL;
  try {
    process.env.DEEPSEEK_BASE_URL = `${slow.url}/v1`;
    const sent = ask(`ai-inflight-${tag()}`);
    await entered.promise;
    const batcher = new TemplateBatcher(1, 8, 1);
    const running = gate(), release = gate();
    const blocker = batcher.submit('same-template', async () => { running.open(); await release.promise; });
    await running.promise;
    const queued = batcher.submit('same-template', () => ask(`ai-queued-${tag()}`));
    const rejected = assert.rejects(queued, AiPausedError);
    await set(false);
    held.open();
    assert.equal((await sent).data.ok, true);
    release.open();
    await blocker; await rejected;
    assert.equal(slow.hits(), 1, 'only the request sent before the pause reaches the provider');
  } finally { held.open(); process.env.DEEPSEEK_BASE_URL = base; await slow.close(); }
});

test('a pause between admission and send releases reservations rather than marking a paid outcome unknown', async () => {
  await set(true);
  const subject = `ai-admission-${tag()}`;
  let checks = 0, sent = false;
  await assert.rejects(paidRequest({ service: 'ai-test', purpose: 'ai-control-test', subject, identity: subject,
    assertAvailable: async db => { if (++checks === 2) await set(false); await assertAiEnabled(db); },
  }, async () => { sent = true; return { response: {} }; }), AiPausedError);
  assert.equal(sent, false);
  const [attempt] = await sql`SELECT a.status, a.budget_charge_usd FROM receipt_attempts a JOIN receipts r ON r.id=a.receipt_id WHERE r.subject=${subject}`;
  assert.equal(attempt!.status, 'failed');
  assert.equal(Number(attempt!.budget_charge_usd), 0);
});

test('analysis, event and daily workers defer paused work without using failure retries', async () => {
  await set(false);
  const handlers = new Map<string, (jobs: any[]) => Promise<any>>();
  const fake = { work: async (name: string, _options: unknown, fn: (jobs: any[]) => Promise<any>) => { handlers.set(name, fn); } } as unknown as PgBoss;
  await registerContentJobs(fake); await registerEventJobs(fake); await registerReportJobs(fake);
  const sourceId = `ai-paused-${tag()}`;
  await sql`INSERT INTO sources(id,name,kind) VALUES (${sourceId},'AI control fixture','rss')`;
  const { articleId } = await upsertMaterial({sourceId,url:`https://example.com/${sourceId}`,title:'Saved waiting article',bodyText:'Saved facts',bodyStatus:'ok',via:'fetch'});
  for(let n=0;n<9;n++)await upsertMaterial({sourceId,url:`https://example.com/${sourceId}/${n}`,title:'Waiting fixture',bodyText:'Saved facts',via:'fetch'});
  await sql`UPDATE articles SET discovered_at=now()-interval '3 hours' WHERE source_id=${sourceId}`;
  await sql`UPDATE articles SET processing_attempts=2 WHERE id=${articleId}`;
  try {
    const attemptTag = `manual-${tag()}`;
    const result = await handlers.get(QUEUES.analyze)!([{ data: { articleId, attemptTag }, singletonKey:attemptTag, priority:4 }]);
    assert.equal(result.state, 'waiting');
    const [row] = await sql`SELECT processing_state,processing_attempts,processing_retry_at FROM articles WHERE id=${articleId}`;
    assert.equal(row!.processing_state, 'new'); assert.equal(row!.processing_attempts, 2); assert.ok(row!.processing_retry_at);
    const [queued] = await sql`SELECT data,priority,retry_count FROM pgboss.job WHERE name=${QUEUES.analyze} AND singleton_key=${attemptTag} AND state='created'`;
    assert.equal(queued!.data.attemptTag, attemptTag); assert.equal(queued!.priority, 4); assert.equal(queued!.retry_count, 0);
    assert.deepEqual(await translatePending(), {done:[],quotes:0});
    const collecting = process.env.COLLECT_ENABLED;
    try { process.env.COLLECT_ENABLED='true'; assert.ok(!(await collectFindings()).some(f=>f.key==='content.process')); }
    finally { if(collecting===undefined)delete process.env.COLLECT_ENABLED;else process.env.COLLECT_ENABLED=collecting; }
    for (const [queue, data] of [[QUEUES.group, {articleId}], [QUEUES.digest, {storyId:123}], [QUEUES.reportEnrich, {date:'2099-01-01'}]] as const) {
      assert.deepEqual(await handlers.get(queue)!([{ data, priority:0, singletonKey:sourceId }]), {deferred:true});
    }
    await set(true);
    await assertAiEnabled();
  } finally {
    await sql`DELETE FROM pgboss.job WHERE (name=${QUEUES.analyze} AND data->>'articleId'=${articleId}) OR singleton_key=${sourceId}
      OR (name=${QUEUES.reportEnrich} AND data->>'date'='2099-01-01')`;
    await sql`DELETE FROM articles WHERE source_id=${sourceId}`; await sql`DELETE FROM sources WHERE id=${sourceId}`;
  }
});
