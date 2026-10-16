import assert from 'node:assert/strict';
import { answerable, answerCall } from './card.js';

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
console.log('card ok');
