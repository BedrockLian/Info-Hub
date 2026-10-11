import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as policy from '../industry/reasoning.ts';

test('input guidance distinguishes a soft reasoning target from output format and never weakens judging rules',()=>{
  const guidance=(policy as any).inferenceGuidance;
  assert.equal(typeof guidance,'function','per-scene prompt guidance exists');
  const score=guidance('score_article');
  const prefilter=guidance('prefilter_article');
  assert.ok(score.softThinkingTokens>prefilter.softThinkingTokens);
  assert.match(score.instruction,/软目标/);
  assert.match(score.instruction,/不改变.*规则/);
  assert.match(score.instruction,/attentionScore/);
  assert.match(guidance('translate_body').instruction,/不得.*省略/);
  assert.equal(guidance('translate_body').softThinkingTokens,null);
  assert.equal(guidance('constructor'),null);
  assert.equal(guidance('__proto__'),null);
});
