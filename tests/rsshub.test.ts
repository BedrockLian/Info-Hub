import assert from "node:assert/strict";
import http from "node:http";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
import { fetchRss } from "@aihot/backend/sources/rss";
import { assertSupportedConfig } from "@aihot/backend/sources/config-keys";

const hits: string[] = [];
const server = http.createServer((req, res) => {
  hits.push(req.url!);
  if (req.url === "/large") { res.end("x".repeat(2 * 1024 * 1024 + 1)); return; }
  if (req.url === "/escape") { res.writeHead(302, { location: "http://169.254.169.254/" }); res.end(); return; }
  if (req.url === "/redirect") { res.writeHead(302, { location: "/feed" }); res.end(); return; }
  if (req.headers["if-none-match"] === '"fixture"') { res.writeHead(304); res.end(); return; }
  res.writeHead(200, { "content-type": "application/rss+xml", etag: '"fixture"' });
  res.end('<rss version="2.0"><channel><title>Fixture</title><item><title>RSSHub fixture</title><link>https://example.org/news/1</link><description>Verified summary</description></item></channel></rss>');
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
(config as unknown as Record<string, unknown>).rsshubBaseUrl = base;
config.allowPrivateNetworkFetch = false;
after(() => { server.closeAllConnections(); server.close(); });
const source = (route: string, cursor: unknown = null) => ({ id: "rsshub-fixture", kind: "rss", config: { rsshubRoute: route }, participation_mode: "editorial", cursor }) as never;

test("RSSHub parses through the dedicated internal path and reuses conditional validators", async () => {
  assertSupportedConfig("rss", { rsshubRoute: "/feed" });
  const read = await fetchRss(source("/feed"));
  assert.equal(read.candidates[0]!.url, "https://example.org/news/1");
  assert.equal(read.candidates[0]!.title, "RSSHub fixture");
  const again = await fetchRss(source("/feed", { rss: read.validator }));
  assert.equal(again.notModified, true);
  assert.equal(again.candidates.length, 0);
});

test("configuring RSSHub never grants ordinary fetches access to internal addresses", async () => {
  const before = hits.length;
  await assert.rejects(guardedFetch(base + "/feed"), /Blocked/);
  assert.equal(hits.length, before);
});

test("RSSHub follows same-origin redirects but refuses escape to another service", async () => {
  assert.equal((await fetchRss(source("/redirect"))).candidates.length, 1);
  await assert.rejects(fetchRss(source("/escape")), /RSSHub.*origin/);
});

test("RSSHub config rejects ambiguous URLs and route escapes before requests", async () => {
  assert.throws(() => assertSupportedConfig("rss", { rsshubRoute: "/feed", feedUrl: "https://example.org/feed" }), /rsshubRoute/);
  for (const route of ["https://evil.example/feed", "//evil.example/feed", "/\\evil.example/feed", "/%2f%2fevil.example/feed", "/../healthz", "/%2e%2e/healthz", "/feed#fragment", "/feed?key=secret"]) {
    const before = hits.length;
    await assert.rejects(fetchRss(source(route)), /RSSHub/);
    assert.equal(hits.length, before);
  }
});

test("RSSHub limits response size and reports an unconfigured service without a request", async () => {
  await assert.rejects(fetchRss(source("/large")), /Response too large/);
  const before = hits.length;
  config.rsshubBaseUrl = null;
  try { await assert.rejects(fetchRss(source("/feed")), /RSSHub is not configured/); }
  finally { config.rsshubBaseUrl = base; }
  assert.equal(hits.length, before);
});
