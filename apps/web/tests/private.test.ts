import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
let web: ChildProcess, origin: string, logs='';
const seen: string[]=[];
const api=createServer(async (req,res)=>{
  const cookie=req.headers.cookie ?? '';
  const url=new URL(req.url!, 'http://api.local');
  if(url.pathname==='/api/auth/read-check') {res.writeHead(cookie==='infohub_session=A'||cookie==='infohub_session=B'?204:401);return res.end();}
  seen.push(cookie);
  await new Promise(resolve=>setTimeout(resolve,cookie.endsWith('A')?30:5));
  res.setHeader('Content-Type','application/json');
  if(url.pathname==='/api/site/meta') return res.end(JSON.stringify({changelogVersion:'test'}));
  if(url.pathname==='/api/site/pool') return res.end(JSON.stringify({filters:{channel:'all',category:null,tag:null,topic:null,q:null,tab:'time'},items:[],page:1,pageCount:1,total:0,todayCount:0,freshness:'2026-10-10T00:00:00Z',generatedAt:'2026-10-10T00:00:00Z'}));
  if(url.pathname==='/api/site/hot') return res.end(JSON.stringify({entries:[]}));
  res.writeHead(404);res.end(JSON.stringify({code:'not_found'}));
});
before(async()=>{
 api.listen(0,'127.0.0.1');await once(api,'listening');
 web=spawn(process.execPath,['apps/web/server.ts'],{cwd:new URL('../../../',import.meta.url),env:{...process.env,PRIVATE_SITE:'true',WEB_PORT:'0',API_BASE_URL:`http://127.0.0.1:${(api.address() as AddressInfo).port}`},stdio:['ignore','pipe','pipe']});
 await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error(logs)),15000);web.on('exit',()=>reject(Error(logs)));web.stderr!.on('data',b=>{logs+=b;});web.stdout!.on('data',b=>{logs+=b;const m=logs.match(/"msg":"web started","port":(\d+)/);if(m){origin=`http://127.0.0.1:${m[1]}`;clearTimeout(timeout);resolve();}});});
});
after(async()=>{web?.kill('SIGTERM');if(web && web.exitCode===null)await once(web,'exit');await new Promise<void>(resolve=>api.close(()=>resolve()));});
test('anonymous HTML and data never expose private page content or cache it',async()=>{
 for(const p of ['/all','/all.data','/starred','/items/secret','/items/secret.data','/daily']){
  const res=await fetch(origin+p,{redirect:'manual'});
  assert.equal(res.status,p.endsWith('.data')?401:302,p);
  assert.match(res.headers.get('cache-control')!,/private.*no-store/);
  assert.ok(!(await res.text()).includes('generatedAt'));
 }
});
test('concurrent authenticated SSR forwards only each request credentials and cannot populate shared caches',async()=>{
 seen.length=0;
 const responses=await Promise.all(['A','B'].map(v=>fetch(origin+'/all',{headers:{cookie:`infohub_session=${v}`}})));
 for(const res of responses){assert.equal(res.status,200,await res.clone().text());assert.equal(res.headers.get('cache-control'),'private, no-store');assert.equal(res.headers.get('x-accel-expires'),'0');}
 assert.ok(seen.includes('infohub_session=A'));assert.ok(seen.includes('infohub_session=B'));assert.ok(!seen.includes(''));
 assert.equal((await fetch(origin+'/all',{redirect:'manual'})).status,302);
 assert.equal((await fetch(origin+'/all.data',{headers:{cookie:'infohub_session=A'}})).status,200);
 const login=await fetch(origin+'/admin/login?return=%2Fall');assert.equal(login.status,200);
});
