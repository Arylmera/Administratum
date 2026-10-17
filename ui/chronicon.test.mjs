import assert from 'node:assert/strict';
import { sumTithes } from './chronicon.js';

const day = (n, sessions) => ({
  tokens: { input: n, output: 2 * n, cacheRead: 10 * n, cacheWrite: n }, busyMs: 1000 * n,
  byProject: { Terra: { tokens: 14 * n, busyMs: 1000 * n } }, byModel: { 'claude-opus-5-5': 14 * n }, ...(sessions ? { bySession: sessions } : {}),
});
const week = sumTithes([day(1, { a: { name: 'terra-77', dept: 'Terra', fresh: 4, total: 14 } }), day(2, { a: { name: 'terra-77', dept: 'Terra', fresh: 8, total: 28 } }), null]);
assert.deepEqual(week.tokens, { input: 3, output: 6, cacheRead: 30, cacheWrite: 3 });
assert.equal(week.busyMs, 3000);
assert.deepEqual(week.byProject.Terra, { tokens: 42, busyMs: 3000 });
assert.equal(week.byModel['claude-opus-5-5'], 42);
assert.deepEqual(week.bySession.a, { name: 'terra-77', dept: 'Terra', fresh: 12, total: 42 });

// A 0.6.5 day file has no bySession; a missing day is null.
assert.deepEqual(sumTithes([day(1)]).bySession, {});
assert.deepEqual(sumTithes([]), { tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, busyMs: 0, byProject: {}, byModel: {}, bySession: {} });
console.log('chronicon ok');
