import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';

function preflight(failure: 'compose'|'daemon'|'hostname'|'vhost'|'certificate'|'nginx'|null) {
 const source=readFileSync(new URL('../ops/deploy/server.sh',import.meta.url),'utf8');
 const root=mkdtempSync(join(tmpdir(),'infohub-preflight-'));
 try{
  mkdirSync(join(root,'cert'));
  if(failure!=='vhost')writeFileSync(join(root,'vhost'),'original');
  writeFileSync(join(root,'cert','fullchain.pem'),failure==='certificate'?'':'certificate');
  writeFileSync(join(root,'cert','privkey.pem'),'private placeholder');
  writeFileSync(join(root,'nginx'),`#!/bin/sh\nexit ${failure==='nginx'?1:0}\n`,{mode:0o700});
  const script=source.slice(0,source.indexOf('[[ $mode == deploy'))
   .replace('nginx=/www/server/nginx/sbin/nginx','nginx="$TEST_ROOT/nginx"')
   .replace('vhost=/www/server/panel/vhost/nginx/news.blian117.dpdns.org.conf','vhost="$TEST_ROOT/vhost"')
   .replace('cert=/www/server/panel/vhost/cert/news.blian117.dpdns.org','cert="$TEST_ROOT/cert"');
  const stubs=`id() { echo 0; }\nhostname() { echo ${failure==='hostname'?'unexpected-host':'VM-0-4-opencloudos'}; }\ncurl() { return 0; }\ndocker() { if [[ $1 == info ]]; then return ${failure==='daemon'?1:0}; fi; return ${failure==='compose'?1:0}; }\n`;
  const result=spawnSync('bash',['-c',stubs+script],{env:{...process.env,TEST_ROOT:root},encoding:'utf8'});
  if(failure!=='vhost')assert.equal(readFileSync(join(root,'vhost'),'utf8'),'original');
  return result;
 }finally{rmSync(root,{recursive:true,force:true});}
}

test('read-only preflight identifies each failed prerequisite without touching the vhost',()=>{
 const cases={compose:/Docker Compose.*unavailable/i,daemon:/Docker daemon.*unavailable/i,hostname:/Unexpected server.*unexpected-host/i,vhost:/news vhost.*missing/i,certificate:/TLS certificate.*missing or empty/i,nginx:/Nginx configuration check failed/i} as const;
 for(const [failure,message] of Object.entries(cases)){
  const result=preflight(failure as keyof typeof cases);
  assert.notEqual(result.status,0,failure);
  assert.match(result.stderr,message,failure);
 }
});

test('read-only preflight reports successful prerequisites and exits before deployment',()=>{
 const result=preflight(null);
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/Preflight OK/);
 assert.match(result.stdout,/Docker Compose: OK/);
});
