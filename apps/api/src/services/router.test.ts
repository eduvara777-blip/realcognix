import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveWeight, smoothWeightedPick } from './router.js';

test('smooth WRR distributes in proportion to weight', () => {
  let cur: Record<string, number> = {};
  const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < 60; i++) {
    const r = smoothWeightedPick([{ id: 'a', weight: 3 }, { id: 'b', weight: 2 }, { id: 'c', weight: 1 }], cur);
    cur = r.next;
    counts[r.pick!]!++;
  }
  assert.deepEqual(counts, { a: 30, b: 20, c: 10 });
});

test('language and locality boost; capacity zeroes', () => {
  const base = { userId: 'u', name: 'x', baseWeight: 1, languages: ['en', 'kn'], localities: ['Whitefield'], activeLeads: 0, maxActiveLeads: 10 };
  assert.equal(effectiveWeight(base, { language: 'kn', locality: 'whitefield', temperature: 'warm' }).weight, 3);
  assert.equal(effectiveWeight({ ...base, activeLeads: 10 }, { language: 'kn', locality: null, temperature: 'warm' }).weight, 0);
});
