import assert from 'node:assert/strict';
import { install, flush, tick } from './testdom.mjs';

// The remote view's gate: the PC refuses answers, the vigil and (since W1) the peek with a 403 while remote actions are off.
// bridge.js turns each into 'remote actions disabled', and the card then shows that sentence and no answer button.
install();
globalThis.ADM_REMOTE = true;
// The remote bridge's events come over one EventSource (card.js imports modules that listen at import, cilamp.js):
// a silent stand-in, as Node has none.
globalThis.EventSource = class { constructor(url) { this.url = url; } addEventListener() {} close() {} };
const fetched = [];
let peekStatus = 403;
globalThis.fetch = async (url, opts = {}) => {
  fetched.push(String(url));
  const peek = String(url).startsWith('/api/peek_petition');
  const status = peek ? peekStatus : 200; // the answer probe (an empty body) is not refused: the buttons show until the peek says otherwise
  const body = peek && status === 200 ? JSON.stringify({ question: 'Do you want to proceed?', yes: 'Yes', always: null, no: 'No' }) : '';
  return { status, ok: status < 400, text: async () => body };
};
const { invoke, REMOTE } = await import('./bridge.js');
assert.ok(REMOTE, 'the remote bridge');
await assert.rejects(invoke('peek_petition', { handle: 'term_ab' }), err => err === 'remote actions disabled', 'a 403 peek says remote actions are disabled');
assert.ok(fetched.at(-1).startsWith('/api/peek_petition?handle=term_ab'));
peekStatus = 200;
assert.deepEqual(await invoke('peek_petition', { handle: 'term_ab' }), { question: 'Do you want to proceed?', yes: 'Yes', always: null, no: 'No' }, 'allowed: the dialog');
peekStatus = 500;
await assert.rejects(invoke('peek_petition', { handle: 'term_ab' }), err => err === 'HTTP 500', 'another failure stays itself');

// The card: a refused peek turns the answer buttons off and shows the note, not a raw "Forbidden".
peekStatus = 403;
const { initCard, pick, probeActions, canAnswer } = await import('./card.js');
const s = { id: 's1', name: 'Scribe', dept: 'D', status: 'waiting', source: 'claude', orca: 'term_ab', waitingFor: 'approve Bash', sinceMs: 1 };
initCard({ cast: { actors: new Map([[s.id, { id: s.id, s, leaving: false }]]) }, roster: () => [s] });
const card = document.getElementById('card'), row = card.querySelector('.answer'), note = card.querySelector('.noact');
probeActions(); await flush(); // app.js probes on each roster tick: the PC allows it (the empty answer is not a 403)
assert.ok(canAnswer(s), 'before the peek: the buttons would show');
pick(s.id); await flush();
tick(100); await flush();
assert.equal(card.hidden, false);
assert.equal(row.hidden, true, 'no answer buttons');
assert.equal(note.hidden, false, 'the note is shown');
assert.equal(note.textContent, 'Remote actions are disabled on the PC');
assert.ok(!/forbidden/i.test(card.textContent), 'no raw Forbidden');
console.log('bridge ok');
