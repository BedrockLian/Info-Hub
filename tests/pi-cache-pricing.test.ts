import assert from 'node:assert/strict';
import {test} from 'node:test';
import {estimateFlashUsd,reserveFlashUsd} from '../packages/backend/src/providers/pricing.ts';

test('DeepSeek cache hits are charged at the cached-input rate while reservations remain conservative',()=>{
  const usage={prompt_tokens:1000,completion_tokens:100,prompt_cache_hit_tokens:900,prompt_cache_miss_tokens:100};
  assert.ok(Math.abs(estimateFlashUsd(usage)!-0.0000777)<1.1e-8,'centimicrodollar rounding remains conservative');
  assert.ok(reserveFlashUsd('x'.repeat(1000),100)>estimateFlashUsd(usage)!);
});

test('missing or contradictory cache counters never grant an invented discount',()=>{
  assert.equal(estimateFlashUsd({prompt_tokens:1000,completion_tokens:100}),0.00021);
  assert.equal(estimateFlashUsd({prompt_tokens:1000,completion_tokens:100,prompt_cache_hit_tokens:2000,prompt_cache_miss_tokens:0}),0.00021);
});
