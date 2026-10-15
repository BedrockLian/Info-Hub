import assert from 'node:assert/strict';
import {test} from 'node:test';
import {z} from 'zod';
import {auditPrompt,comparePromptPrefixes,privateUserText} from '../packages/backend/src/providers/prompt-audit.ts';
import {stablePrompt} from '../packages/backend/src/providers/prompt-layout.ts';

test('actual message audit keeps fixed prefix stable while preserving original article dates and bytes',()=>{
 const schema=z.object({ok:z.boolean()});
 const make=(material:string)=>{const p=stablePrompt('Same rules',material,'score_article',schema,true);return [{role:'system',content:p.system},{role:'user',content:p.user}];};
 const a=make('2026-10-15\r\n正文 A  1.30亿元'),b=make('2026-10-16\n正文 B');
 const aa=auditPrompt(a),bb=auditPrompt(b);
 assert.equal(aa.prefixHash,bb.prefixHash);assert.equal(aa.prefixChars,bb.prefixChars);
 assert.notEqual(aa.materialHash,bb.materialHash);assert.equal(aa.materialChars,a[1]!.content.length);
 assert.deepEqual(a.map(m=>m.content),[a[0]!.content,'2026-10-15\r\n正文 A  1.30亿元']);
 assert.equal(JSON.stringify(aa).includes('正文'),false);assert.equal(JSON.stringify(aa).includes('1.30'),false);
 assert.deepEqual(comparePromptPrefixes(a,b),{sameFixedPrefix:true,commonPrefixChars:a[0]!.content.length,firstDifference:null});
});

test('prefix comparison reports only position and hashes, never changed prompt content',()=>{
 const a=[{role:'system',content:'固定规则 A'},{role:'user',content:'secret A'}];
 const b=[{role:'system',content:'固定规则 B'},{role:'user',content:'secret B'}];
 const diff=comparePromptPrefixes(a,b);
 assert.equal(diff.sameFixedPrefix,false);assert.equal(diff.commonPrefixChars,5);assert.equal(diff.firstDifference,5);
 assert.equal(JSON.stringify(diff).includes('secret'),false);
 assert.throws(()=>auditPrompt([{role:'user',content:'article'},{role:'system',content:'late rules'}]),/leading system/);
});

test('private object material serialization canonicalizes keys but never article strings or array order',()=>{
 const one={revision:2,article:{title:'标题',content:'原文\r\n  保留'},candidates:[{id:'B'},{id:'A'}]};
 const two={candidates:[{id:'B'},{id:'A'}],article:{content:'原文\r\n  保留',title:'标题'},revision:2};
 assert.equal(privateUserText(one),privateUserText(two));
 assert.deepEqual(JSON.parse(privateUserText(one)),one);
 assert.equal(privateUserText('  literal\r\n text  '),'  literal\r\n text  ');
 assert.notEqual(privateUserText([{id:'A'},{id:'B'}]),privateUserText([{id:'B'},{id:'A'}]));
});
