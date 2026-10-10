import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {test} from 'node:test';

function prepare(failure: 'os'|'runtime'|'checksum'|null) {
 const root=mkdtempSync(join(tmpdir(),'infohub-docker-setup-'));
 try{
  mkdirSync(join(root,'plugins'));
  writeFileSync(join(root,'os-release'),failure==='os'?'ID=debian\nVERSION_ID=12\n':'ID=opencloudos\nVERSION_ID=9.6\n');
  const payload='#!/bin/sh\nexit 0\n';
  let source=readFileSync(new URL('../ops/deploy/prepare-docker.sh',import.meta.url),'utf8')
   .replace('/etc/os-release',join(root,'os-release'))
   .replace('/usr/local/lib/docker/cli-plugins',join(root,'plugins'));
  const digest=createHash('sha256').update(payload).digest('hex');
  source=source.replace(/(compose_sha|buildx_sha)=[a-f0-9]{64}/g,`$1=${digest}`);
  const stubs=`
id() { echo 0; }
hostname() { echo VM-0-4-opencloudos; }
uname() { echo x86_64; }
command() { if [[ $1 == -v && $2 == docker && ! -f "$TEST_ROOT/installed" ]]; then return 1; fi; builtin command "$@"; }
rpm() { return 1; }
dnf() { printf '%s\\n' "$*" >> "$TEST_ROOT/operations"; touch "$TEST_ROOT/installed"; }
systemctl() { if [[ $1 == is-active ]]; then return ${failure==='runtime'?0:3}; fi; printf '%s\\n' "$*" >> "$TEST_ROOT/operations"; }
docker() { if [[ $1 == compose ]]; then test -x "$TEST_ROOT/plugins/docker-compose"; elif [[ $1 == buildx ]]; then test -x "$TEST_ROOT/plugins/docker-buildx"; else return 0; fi; }
curl() { local output=''; while [[ $# -gt 0 ]]; do if [[ $1 == --output ]]; then output=$2; shift; fi; shift; done; printf '${failure==='checksum'?'corrupt':payload}' > "$output"; }
`;
  const result=spawnSync('bash',['-c',stubs+source],{env:{...process.env,TEST_ROOT:root},encoding:'utf8'});
  return {...result,operations:existsSync(join(root,'operations'))?readFileSync(join(root,'operations'),'utf8'):'',plugins:existsSync(join(root,'plugins','docker-compose'))};
 }finally{rmSync(root,{recursive:true,force:true});}
}

test('Docker preparation rejects an unexpected OS and an existing non-Docker runtime before mutation',()=>{
 for(const failure of ['os','runtime'] as const){
  const result=prepare(failure);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,failure==='os'?/OpenCloudOS 9/:/containerd.*active/i);
  assert.equal(result.operations,'');
 }
});

test('Docker preparation rejects an invalid plugin download before installation or daemon startup',()=>{
 const result=prepare('checksum');
 assert.notEqual(result.status,0);
 assert.equal(result.plugins,false);
 assert.doesNotMatch(result.operations,/enable/);
});

test('Docker preparation installs verified plugins and starts only Docker',()=>{
 const result=prepare(null);
 assert.equal(result.status,0,result.stderr);
 assert.equal(result.plugins,true);
 assert.match(result.operations,/install.*moby/);
 assert.match(result.operations,/enable --now docker/);
 assert.doesNotMatch(result.operations,/remove|erase|update|upgrade|restart|nginx|postgres|mysql|php/);
 assert.match(result.stdout,/Docker preparation OK/);
});
