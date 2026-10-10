import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
const source=readFileSync(new URL('../ops/deploy/server.sh',import.meta.url),'utf8');

test('final HTTPS verification identifies transport errors and unexpected HTTP status before release marking',()=>{
 const start=source.indexOf('https_status=');
 assert.ok(start>=0,'Final HTTPS verification must report the failing layer');
 const check=source.slice(start,source.indexOf('ln -sfn "$root/releases/$release" "$root/current"'));
 for(const mode of ['tls','http','ok']){
  const stub=mode==='tls'?'echo "curl: certificate verification failed" >&2; return 60':`printf ${mode==='http'?'410':'302'}`;
  const result=spawnSync('bash',['-s'],{input:`set -euo pipefail\ncurl() { ${stub}; }\n${check}\necho VERIFIED\n`,encoding:'utf8'});
  assert.equal(result.status,mode==='ok'?0:1,result.stderr);
  assert.equal(result.stdout.includes('VERIFIED'),mode==='ok');
  if(mode==='tls')assert.match(result.stderr,/certificate verification failed[\s\S]*HTTPS transport verification failed/);
  if(mode==='http')assert.match(result.stderr,/expected 302.*410/);
 }
});
