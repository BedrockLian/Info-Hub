import './setup.ts';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
process.env.PRIVATE_SITE = 'true';
process.env.ADMIN_PASSWORD = 'local-test-password-0123456789';
const { buildApp } = await import('../apps/api/src/app.ts');
const { sql } = await import('../packages/backend/src/db.ts');
const { passwordLogin, safeReturn, SESSION_COOKIE } = await import('../packages/backend/src/admin/auth.ts');
const app = await buildApp();
after(async () => { await app.close(); await sql.end(); });

test('anonymous API, subscriptions, MCP and media are denied before reading or redirects', async () => {
  for (const url of ['/api/site/home', '/api/v1/items', '/rss.xml', '/api/mcp', '/api/img-proxy?url=https://example.com/a.png', '/sitemap.xml', '/llms.txt', '/api/auth/read-check']) {
    const res = await app.inject({url});
    assert.equal(res.statusCode, 401, url);
    assert.match(res.headers['cache-control'] as string, /private.*no-store/);
    assert.equal(res.headers['x-accel-expires'], '0');
    assert.notEqual(res.headers['access-control-allow-origin'], '*');
  }
  assert.equal((await app.inject({url:'/api/auth/options'})).statusCode, 200);
  const robots = await app.inject({url:'/robots.txt'});
  assert.match(robots.body, /Disallow: \/\s*$/);
});

test('read token is hashed, expires and revokes, cannot write or access admin diagnostics', async () => {
  const login = await passwordLogin(process.env.ADMIN_PASSWORD!, '/all', undefined);
  const cookie = `${SESSION_COOKIE}=${login.token}`;
  const me = await app.inject({url:'/api/admin/me', headers:{cookie}});
  const csrf = me.json().csrf;
  assert.equal((await app.inject({url:'/api/auth/read-check',headers:{cookie}})).statusCode,204);
  const headers = {cookie,'x-csrf-token':csrf};
  const created = await app.inject({method:'POST',url:'/api/admin/read-tokens',headers,payload:{name:'test RSS',days:1}});
  assert.equal(created.statusCode,200,created.body);
  const { token,id } = created.json();
  const bearer = {authorization:`Bearer ${token}`};
  assert.equal((await app.inject({url:'/api/auth/read-check',headers:bearer})).statusCode,204);
  assert.equal((await app.inject({url:'/api/admin/content',headers:bearer})).statusCode,401);
  assert.equal((await app.inject({method:'POST',url:'/api/auth/logout',headers:bearer})).statusCode,401);
  assert.equal((await app.inject({url:'/api/auth/read-check?token='+token})).statusCode,401);
  const list = await app.inject({url:'/api/admin/read-tokens',headers:{cookie}});
  assert.ok(!list.body.includes(token));
  const [stored] = await sql`SELECT token_hash FROM read_tokens WHERE id = ${id}`;
  assert.notEqual(stored!.token_hash,token);
  await sql`UPDATE read_tokens SET expires_at = now() - interval '1 minute' WHERE id = ${id}`;
  assert.equal((await app.inject({url:'/api/auth/read-check',headers:bearer})).statusCode,401);
  await sql`UPDATE read_tokens SET expires_at = now() + interval '1 day' WHERE id = ${id}`;
  const revoked = await app.inject({method:'DELETE',url:`/api/admin/read-tokens/${id}`,headers});
  assert.equal(revoked.statusCode,200,revoked.body);
  assert.equal((await app.inject({url:'/api/auth/read-check',headers:bearer})).statusCode,401);
  assert.equal((await app.inject({method:'POST',url:'/api/auth/logout',headers:{cookie}})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url:'/api/auth/logout',headers,payload:{}})).statusCode,303);
  assert.equal((await app.inject({url:'/api/auth/read-check',headers:{cookie}})).statusCode,401);
});

test('login accepts a site reading path and rejects external or malformed return targets', () => {
  assert.equal(safeReturn('/all?category=games'),'/all?category=games');
  for (const target of ['//evil.example','https://evil.example/admin','/\\evil.example','/admin/login','/%2f%2fevil.example','/\nwrong']) assert.equal(safeReturn(target),'/');
});
