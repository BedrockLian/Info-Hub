import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';

test('actual deployment EXIT handler restores the previous app and vhost, or stops only the initial app',()=>{
 const source=readFileSync(new URL('../ops/deploy/server.sh',import.meta.url),'utf8');
 const handler=source.slice(source.indexOf('rollback_on_error() {'),source.indexOf('trap rollback_on_error EXIT'));
 for(const hasPrevious of [true,false]){
  const root=mkdtempSync(join(tmpdir(),'infohub-rollback-'));
  try{
   mkdirSync(join(root,'previous'));writeFileSync(join(root,'previous','docker-compose.yml'),'test');
   writeFileSync(join(root,'vhost'),'new');writeFileSync(join(root,'backup'),'original');
   writeFileSync(join(root,'nginx'),'#!/bin/sh\nexit 0\n',{mode:0o700});
   const script=`set -euo pipefail
vhost="$TEST_ROOT/vhost"
vhost_backup="$TEST_ROOT/backup"
nginx="$TEST_ROOT/nginx"
previous=${hasPrevious?'"$TEST_ROOT/previous"':'""'}
app_changed=true
docker() { printf '%s\\n' "$*" >> "$TEST_ROOT/docker.log"; }
${handler}
trap rollback_on_error EXIT
exit 42
`;
   const result=spawnSync('bash',['-c',script],{env:{...process.env,TEST_ROOT:root},encoding:'utf8'});
   assert.equal(result.status,42);
   assert.equal(readFileSync(join(root,'vhost'),'utf8'),'original');
   const calls=readFileSync(join(root,'docker.log'),'utf8');
   assert.match(calls,hasPrevious?/compose -p infohub -f .*previous\/docker-compose.yml up -d --no-build/:/compose -p infohub stop web api worker/);
   assert.doesNotMatch(calls,/down|trendradar|mysql|php/);
  }finally{rmSync(root,{recursive:true,force:true});}
 }
});
