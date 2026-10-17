import assert from 'node:assert/strict';
import { answerable, answerCall, kinOf, lineageOf, stuckLine } from './card.js';

// Claude Code: a permission prompt in an Orca terminal.
const claude = { id: 's1', status: 'waiting', source: 'claude', orca: 'term_ab', waitingFor: 'approve Bash' };
assert.ok(answerable(claude));
assert.ok(!answerable({ ...claude, orca: null }), 'not in Orca');
assert.ok(!answerable({ ...claude, waitingFor: 'input needed' }), 'free-text petition');
assert.deepEqual(answerCall(claude, 'always'), ['answer_petition', { handle: 'term_ab', choice: 'always' }]);

// OpenCode: its pending request, no terminal needed.
const oc = { id: 'ses_1', status: 'waiting', source: 'opencode', opencodeRequest: 'per_1', orca: null, waitingFor: 'permission' };
assert.ok(answerable(oc));
assert.ok(!answerable({ ...oc, opencodeRequest: null }), 'no request to answer');
assert.ok(!answerable({ ...oc, status: 'busy' }), 'answered');
assert.ok(!answerable({ ...oc, source: 'claude' }), 'a Claude petition needs Orca');
for (const choice of ['yes', 'always', 'no']) // the backend maps them to once / always / reject
  assert.deepEqual(answerCall(oc, choice), ['answer_opencode', { session: 'ses_1', request: 'per_1', choice }]);
assert.ok(!answerable(null) && !answerable(undefined));
// A Suzerain's card lists its forked children; a child's names its parent (registry adopt keeps live ones only).
const lord = { id: 'p' }, kids = [{ id: 'a', parent: 'p' }, { id: 'b', parent: 'p' }], other = { id: 'x', parent: 'gone' };
const roster = [lord, ...kids, other];
assert.deepEqual(kinOf(lord, roster), { parent: undefined, children: kids });
assert.deepEqual(kinOf(kids[0], roster), { parent: lord, children: [] });
assert.deepEqual(kinOf(other, roster), { parent: undefined, children: [] });
// The lineage: the Suzerain and its live children, with today's tokens summed (a missing count is 0).
const tok = [{ id: 'p', tokensToday: 100 }, { id: 'a', parent: 'p', tokensToday: 20 }, { id: 'b', parent: 'p' }, { id: 'c', parent: 'a', tokensToday: 5 }, other];
assert.deepEqual(lineageOf(tok[0], tok), { root: tok[0], children: [tok[1], tok[2]], tokens: 125 }, 'the total includes the grandchild; the list stays immediate');
assert.deepEqual(lineageOf(tok[2], tok), { root: tok[0], children: [tok[1], tok[2]], tokens: 125 }, "a child's card shows its parent's lineage");
assert.deepEqual(lineageOf(tok[3], tok), { root: tok[1], children: [tok[3]], tokens: 25 }, 'immediate links only: a grandchild sees its own parent');
assert.deepEqual(lineageOf(tok[1], tok), { root: tok[1], children: [tok[3]], tokens: 25 }, 'a child that forks shows its own tree');
const cyc = [{ id: 'x', parent: 'y', tokensToday: 1 }, { id: 'y', parent: 'x', tokensToday: 2 }];
assert.equal(lineageOf(cyc[0], cyc).tokens, 3, 'a cycle is summed once and terminates');
assert.equal(lineageOf(other, tok), null, 'orphan: no lineage');
assert.equal(lineageOf({ id: 'z' }, tok), null, 'a plain scribe');
console.log('card ok');

// A stuck session (monitor.rs): silent since its last write, or looping on one call.
assert.equal(stuckLine({ kind: 'silent', sinceMs: 0, tool: null, count: 0 }, 16 * 60_000 + 5), 'stalled · 16m');
assert.equal(stuckLine({ kind: 'loop', sinceMs: 0, tool: 'Bash', count: 5 }, 0), 'looping · Bash ×5');
assert.equal(stuckLine(null, 0), '');
