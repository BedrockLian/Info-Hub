import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,writeFileSync,mkdirSync,readlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
const source=readFileSync(new URL('../ops/deploy/server.sh',import.meta.url),'utf8');

test('deployment smoke cannot consume the remainder of an SSH-streamed deployment script',()=>{
 const command=source.split('\n').find(line=>line.includes('setup node scripts/private-smoke.ts'))!;
 assert.ok(command);
 const script='set -euo pipefail\ndocker() { cat >/dev/null; }\n'+command+'\nprintf "CONTINUED\\n"\n';
 const result=spawnSync('bash',['-s'],{input:script,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.equal(result.stdout,'CONTINUED\n');
});

test('only the running Info-Hub web container with the exact loopback binding can reuse a partial deployment port',()=>{
 const guard=source.slice(source.indexOf('if [[ -n $(ss'),source.indexOf('mkdir -p "$root/releases'));
 for(const owned of [true,false]){
  const root=mkdtempSync(join(tmpdir(),'infohub-port-'));
  try{
   const script=`set -euo pipefail
root="$TEST_ROOT"
ss() { echo LISTEN; }
docker() { if [[ $1 == ps ]]; then ${owned?'echo web-container':'true'}; else echo 127.0.0.1:18082; fi; }
${guard}
echo PORT_OK
`;
   const result=spawnSync('bash',['-s'],{input:script,env:{...process.env,TEST_ROOT:root},encoding:'utf8'});
   assert.equal(result.status,owned?0:1,result.stdout+result.stderr);
   assert.equal(result.stdout.includes('PORT_OK'),owned);
  }finally{rmSync(root,{recursive:true,force:true});}
 }
});


test('the complete SSH-streamed deployment reaches the news vhost and final release marker after Docker commands',()=>{
 const root=mkdtempSync(join(tmpdir(),'infohub-complete-deploy-'));
 const release='a'.repeat(40);
 try{
  mkdirSync(join(root,'shared'));writeFileSync(join(root,'shared','.env'),'test fixture');
  mkdirSync(join(root,'cert'));writeFileSync(join(root,'cert','fullchain.pem'),'fixture');writeFileSync(join(root,'cert','privkey.pem'),'fixture');
  mkdirSync(join(root,'payload'));writeFileSync(join(root,'payload','docker-compose.yml'),'fixture');
  writeFileSync(join(root,'vhost'),'return 410;');
  writeFileSync(join(root,'nginx'),'#!/bin/sh\nexit 0\n',{mode:0o700});
  assert.equal(spawnSync('tar',['-cf',join(root,'incoming.tar'),'-C',join(root,'payload'),'.']).status,0);
  const script=source.replace('root=/opt/infohub','root="$TEST_ROOT"')
   .replace('nginx=/www/server/nginx/sbin/nginx','nginx="$TEST_ROOT/nginx"')
   .replace('vhost=/www/server/panel/vhost/nginx/news.blian117.dpdns.org.conf','vhost="$TEST_ROOT/vhost"')
   .replace('cert=/www/server/panel/vhost/cert/news.blian117.dpdns.org','cert="$TEST_ROOT/cert"')
   .replace('archive=/root/infohub-incoming-$release.tar','archive="$TEST_ROOT/incoming.tar"');
  const stubs=`id() { echo 0; }
hostname() { echo VM-0-4-opencloudos; }
ss() { echo LISTEN; }
curl() { if [[ $* == *feed.xml* ]]; then printf 401; else printf 302; fi; }
docker() {
 if [[ $1 == ps ]]; then echo web-container;
 elif [[ $1 == inspect ]]; then echo 127.0.0.1:18082;
 elif [[ $* == *build* || $* == *"up -d"* || $* == *" run "* ]]; then cat >/dev/null;
 fi
}
`;
  const result=spawnSync('bash',['-s','--','deploy',release],{input:stubs+script,env:{...process.env,TEST_ROOT:root},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/Deployed release/);
  assert.match(readFileSync(join(root,'vhost'),'utf8'),/proxy_pass http:\/\/127\.0\.0\.1:18082/);
  assert.equal(readlinkSync(join(root,'current')),join(root,'releases',release));
 }finally{rmSync(root,{recursive:true,force:true});}
});
