import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';

function receiver() {
 const source=readFileSync(new URL('../ops/deploy/windows.ps1',import.meta.url),'utf8');
 const literal=source.match(/^\$scriptReceiver = '((?:[^'\r\n]|'')*)'\r?$/m);
 assert.ok(literal,'All remote shell stages need the same Windows newline-safe receiver');
 return literal[1].replace(/''/g,"'");
}

test('remote shell receiver accepts PowerShell trailing CRLF and fully CRLF scripts',()=>{
 const script='set -euo pipefail\n[[ $1 == preflight ]]\ncat <<\'VALUE\'\n$literal is preserved\nVALUE\n';
 const failure=spawnSync('bash',['-s','--','preflight'],{input:script+'\r\n',encoding:'utf8'});
 assert.equal(failure.status,127,'Reproduce the Windows native pipeline suffix failure');
 for(const input of [script+'\r\n',script.replaceAll('\n','\r\n')+'\r\n']){
  const result=spawnSync('sh',['-c',receiver()+' -- preflight'],{input,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stdout,'$literal is preserved\n');
 }
});

test('remote shell receiver preserves server failure codes and deployment arguments',()=>{
 const result=spawnSync('sh',['-c',receiver()+' -- deploy '+ 'a'.repeat(40)],{
  input:'set -euo pipefail\nprintf "%s %s\\n" "$1" "$2"\nexit 37\n\r\n',encoding:'utf8'});
 assert.equal(result.status,37);
 assert.equal(result.stdout,'deploy '+'a'.repeat(40)+'\n');
});

test('remote shell receiver stops if the newline filter is unavailable',()=>{
 const result=spawnSync('sh',['-c','command() { return 1; }; '+receiver()],{
  input:'echo SHOULD_NOT_RUN\n\r\n',encoding:'utf8'});
 assert.notEqual(result.status,0);
 assert.equal(result.stdout,'');
});
