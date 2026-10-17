import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { petitionsOf, treeOrder, vigilLine } from './mobile.js';

// Petitions: the waiting sessions, the longest waiting first.
const r = [
  { id: 'a', name: 'a', status: 'idle', sinceMs: 1 },
  { id: 'b', name: 'b', status: 'waiting', sinceMs: 30 },
  { id: 'c', name: 'c', status: 'busy', sinceMs: 5, parent: 'b' },
  { id: 'd', name: 'd', status: 'waiting', sinceMs: 10 },
  { id: 'e', name: 'e', status: 'shell', sinceMs: 2, parent: 'gone' },
  { id: 'f', name: 'f', status: 'idle', sinceMs: 3, parent: 'c' },
];
assert.deepEqual(petitionsOf(r).map(s => s.id), ['d', 'b']);
assert.deepEqual(petitionsOf([]), []);

// Roster: waiting, then working, then the rest; each forked child right under its parent, indented.
assert.deepEqual(treeOrder(r).map(({ s, depth }) => `${s.id}${depth}`), ['b0', 'c1', 'f2', 'd0', 'e0', 'a0']);
const cycle = [{ id: 'x', status: 'idle', parent: 'y' }, { id: 'y', status: 'idle', parent: 'x' }];
assert.equal(treeOrder(cycle).length, 2, 'a parent cycle still lists everyone once');

// Night Vigil, in words.
const at = new Date(2026, 9, 17, 23, 0).getTime();
assert.equal(vigilLine({ armed: false }, at), 'Off');
assert.equal(vigilLine({ armed: true, deadline: null, countdownEnd: null }, at), 'Armed');
assert.equal(vigilLine({ armed: true, deadline: new Date(2026, 9, 17, 23, 30).getTime() }, at), 'Armed · deadline 23:30');
assert.equal(vigilLine({ armed: true, countdownEnd: at + 95_000 }, at), 'Armed · shutdown in 1:35');

// Read-only by design: the page never answers or peeks at a petition, and never writes server text as HTML.
const src = readFileSync(new URL('./mobile.js', import.meta.url), 'utf8');
for (const banned of ['answer_petition', 'answer_opencode', 'peek_petition', 'remoteActions', 'innerHTML', 'insertAdjacentHTML', 'outerHTML'])
  assert.ok(!src.includes(banned), `mobile.js must not use ${banned}`);
console.log('mobile ok');
