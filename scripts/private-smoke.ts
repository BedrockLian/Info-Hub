// Exercises the built private site without collection or paid model calls; no secrets are logged.
import assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
import {request as httpsRequest} from 'node:https';
const arg=process.argv.indexOf('--base');
const base=(arg>=0?process.argv[arg+1]:'http://127.0.0.1:18082')!;
const storyArg=process.argv.indexOf('--story');
const storyId=storyArg>=0?process.argv[storyArg+1]:null;
if(storyArg>=0)assert.match(storyId??'',/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,'--story requires a public event UUID');
const password=process.env.ADMIN_PASSWORD;
assert.ok(password && password.length>=12,'ADMIN_PASSWORD must be supplied to the smoke process');
const call=(path:string,init:RequestInit={})=>fetch(base+path,{redirect:'manual',signal:AbortSignal.timeout(15000),...init});
// Node's fetch normalizes Host to the connection URL. Exercise the site's actual Host while
// connecting to the internal Compose service, as its reverse proxy does in production.
const mcpCall=(headers:Record<string,string>,body:string)=>new Promise<number>((resolve,reject)=>{
 const url=new URL('/api/mcp',base);
 const send=url.protocol === 'https:'?httpsRequest:httpRequest;
 const req=send(url,{method:'POST',headers:{...headers,'content-length':Buffer.byteLength(body)},signal:AbortSignal.timeout(15000)},res=>{res.resume();res.on('end',()=>resolve(res.statusCode!));});
 req.on('error',reject);req.end(body);
});
for(const path of ['/','/all','/starred','/daily'])assert.equal((await call(path)).status,302,path);
if(storyId){assert.equal((await call(`/story/${storyId}`)).status,302);assert.equal((await call(`/story/${storyId}.data`)).status,401);}
for(const path of ['/all.data','/feed.xml','/api/v1/items','/api/mcp','/api/site/contact','/api/admin/read-tokens']) {
 const res=await call(path);assert.equal(res.status,401,path);assert.match(res.headers.get('cache-control')!,/no-store/);
}
assert.equal((await call('/admin/login')).status,200);
const login=await call('/api/auth/password',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password,return:'/all'})});
assert.equal(login.status,303);assert.equal(login.headers.get('location'),'/all');
const cookie=login.headers.get('set-cookie')!.split(';')[0]!;
const me=await call('/api/admin/me',{headers:{cookie}});assert.equal(me.status,200);
const {csrf}=await me.json() as {csrf:string};
const created=await call('/api/admin/read-tokens',{method:'POST',headers:{cookie,'x-csrf-token':csrf,'content-type':'application/json'},body:JSON.stringify({name:'deployment-smoke',days:1})});
assert.equal(created.status,200);
const {token,id}=await created.json() as {token:string;id:string};
try {
 const bearer={authorization:`Bearer ${token}`};
 for(const path of ['/all','/all.data','/feed.xml','/api/v1/items']) {const res=await call(path,{headers:bearer});assert.equal(res.status,200,path);assert.equal(res.headers.get('cache-control'),'private, no-store');}
 if(storyId)for(const credentials of [bearer,{cookie}])for(const path of [`/story/${storyId}`,`/story/${storyId}.data`,`/api/site/stories/${storyId}`]){
  const res=await call(path,{headers:credentials});assert.equal(res.status,200,path);assert.equal(res.headers.get('cache-control'),'private, no-store');
 }
 assert.equal((await call('/api/admin/me',{headers:bearer})).status,401);
 const mcp=await mcpCall({...bearer,host:new URL(process.env.SITE_URL ?? base).host,accept:'application/json, text/event-stream','content-type':'application/json'},JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'infohub-smoke',version:'1'}}}));
 assert.equal(mcp,200,'authenticated MCP initialize');
} finally {
 assert.equal((await call(`/api/admin/read-tokens/${id}`,{method:'DELETE',headers:{cookie,'x-csrf-token':csrf}})).status,200);
 assert.equal((await call('/api/auth/read-check',{headers:{authorization:`Bearer ${token}`}})).status,401);
 assert.equal((await call('/api/auth/logout',{method:'POST',headers:{cookie,'x-csrf-token':csrf}})).status,303);
 assert.equal((await call('/api/auth/read-check',{headers:{cookie}})).status,401);
}
console.log('Private smoke passed: login, SSR/data, RSS, API, MCP, read-only limits, revocation and logout.');
