import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
const source=readFileSync(new URL('../ops/deploy/server.sh',import.meta.url),'utf8');
function verification() {
 const start=source.indexOf('https_ready=false')>=0?source.indexOf('https_ready=false'):source.indexOf('https_status=');
 assert.ok(start>=0,'Final HTTPS verification must report the failing layer');
 return source.slice(start,source.indexOf('ln -sfn "$root/releases/$release" "$root/current"'));
}

test('final HTTPS verification identifies transport errors and unexpected HTTP status before release marking',()=>{
 for(const mode of ['tls','http','ok']){
  const stub=mode==='tls'?'echo "curl: certificate verification failed" >&2; return 60':`printf ${mode==='http'?'410':'302'}`;
  const result=spawnSync('bash',['-s'],{input:`set -euo pipefail\nsleep() { :; }\ncurl() { ${stub}; }\n${verification()}\necho VERIFIED\n`,encoding:'utf8'});
  assert.equal(result.status,mode==='ok'?0:1,result.stderr);
  assert.equal(result.stdout.includes('VERIFIED'),mode==='ok');
  if(mode==='tls')assert.match(result.stderr,/certificate verification failed[\s\S]*HTTPS transport verification failed/);
  if(mode==='http')assert.match(result.stderr,/expected 302.*410/);
 }
});

test('final HTTPS verification waits for old Nginx workers to yield to the reloaded news vhost',()=>{
 const root=mkdtempSync(join(tmpdir(),'infohub-nginx-reload-'));
 try{
  const stub=`curl() {
   local attempt=$(cat "$TEST_ROOT/attempt" 2>/dev/null || echo 0)
   attempt=$((attempt+1)); printf '%s' "$attempt" > "$TEST_ROOT/attempt"
   if [[ $attempt -lt 3 ]]; then printf 410; else printf 302; fi
  }`;
  const result=spawnSync('bash',['-s'],{input:`set -euo pipefail\nsleep() { :; }\n${stub}\n${verification()}\necho VERIFIED\n`,env:{...process.env,TEST_ROOT:root},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/VERIFIED/);
  assert.equal(readFileSync(join(root,'attempt'),'utf8'),'3');
 }finally{rmSync(root,{recursive:true,force:true});}
});
