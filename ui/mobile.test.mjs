import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { petitionsOf, treeOrder, vigilLine, rowKey, rowState, openRow, phoneAnswer, petitionRow, rowsSig, peekKey, answerError, latestOnly } from './mobile.js';
// A hand-made DOM, just enough for petitionRow (no DOM library, as in flathall.test.mjs); set after the import so
// the page itself does not start.
const node = tag => ({ tag, className: '', textContent: '', children: [], attrs: {}, append(...c) { this.children.push(...c); }, setAttribute(k, v) { this.attrs[k] = v; } });
globalThis.document = { createElement: node };

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

// Petition rows: Approve / Deny only while the PC allows remote actions, on a permission petition once it is shown.
const orca = { id: 's1', name: 'Scribe', status: 'waiting', waitingFor: 'approve Bash', orca: 'term_ab', sinceMs: 100 };
const oc = { id: 'ses_1', name: 'oc', status: 'waiting', source: 'opencode', opencodeRequest: 'per_1', sinceMs: 5, asks: 'run ls' };
const shown = { question: 'Run ls?', yes: 'Yes', always: "Yes, and don't ask again", no: 'No' };
// actions off: no buttons, even on the rows that would get them (an OpenCode row, an Orca row with its prompt shown)
assert.equal(rowState(oc, { actions: false }).buttons, false);
assert.equal(rowState(orca, { actions: false, peek: shown }).buttons, false);
for (const waitingFor of ['question', 'input needed'])
  assert.equal(rowState({ ...orca, waitingFor }, { actions: true, peek: shown }).buttons, false, `${waitingFor} stays text`);
assert.equal(rowState(orca, { actions: true }).buttons, false, 'not before the prompt is shown');
assert.deepEqual(rowState(orca, { actions: true, peek: shown }), { buttons: true, text: 'Run ls?', sub: 'Yes / No', error: null });
assert.deepEqual(rowState(orca, { actions: true, peek: { error: 'no permission prompt on screen' } }),
  { buttons: false, text: null, sub: null, error: 'no permission prompt on screen' }, 'a failed peek: its error, no buttons');
assert.equal(rowState(oc, { actions: true }).buttons, true, 'OpenCode: no peek, the roster carries the request');
assert.equal(rowKey(orca), 's1:100');
assert.notEqual(rowKey({ ...orca, sinceMs: 200 }), rowKey(orca), 'a new prompt in the same session is a new row');

// The calls: none while actions are off; a peek for Orca, none for OpenCode; Approve / Deny send yes / no, never always.
const calls = [], stub = res => (name, args) => { calls.push([name, args]); return res(); };
assert.equal(await openRow(orca, { actions: false, invoke: stub(() => Promise.resolve(shown)) }), undefined);
assert.equal(await openRow({ ...orca, waitingFor: 'question' }, { actions: true, invoke: stub(() => Promise.resolve(shown)) }), undefined);
assert.equal(await openRow(oc, { actions: true, invoke: stub(() => Promise.resolve(shown)) }), undefined);
assert.deepEqual(calls, [], 'no call unless actions are on and the petition is an Orca permission prompt');
assert.deepEqual(await openRow(orca, { actions: true, invoke: stub(() => Promise.resolve(shown)) }), shown);
assert.deepEqual(await openRow(orca, { actions: true, invoke: stub(() => Promise.reject('screen unavailable')) }), { error: 'screen unavailable' });
assert.deepEqual(calls, [['peek_petition', { handle: 'term_ab' }], ['peek_petition', { handle: 'term_ab' }]]);
calls.length = 0;
// Approve on Orca: the prompt is read again, and answered only while it is the one shown.
const peekThen = p => (name, args) => { calls.push([name, args]); return Promise.resolve(name === 'peek_petition' ? p : null); };
assert.deepEqual(await phoneAnswer(orca, 'yes', peekThen(shown), shown), { sent: true });
assert.deepEqual(await phoneAnswer(oc, 'no', peekThen(shown), undefined), { sent: true });
assert.deepEqual(calls, [['peek_petition', { handle: 'term_ab' }], ['answer_petition', { handle: 'term_ab', choice: 'yes' }],
  ['answer_opencode', { session: 'ses_1', request: 'per_1', choice: 'no' }]]);
calls.length = 0;
const other = { ...shown, question: 'Run rm?' };
assert.deepEqual(await phoneAnswer(orca, 'yes', peekThen(other), shown), { sent: false, peek: other }, 'a changed prompt comes back');
assert.deepEqual(await phoneAnswer(orca, 'yes', peekThen(shown), undefined), { sent: false, peek: shown }, 'nothing shown: no answer');
assert.deepEqual(await phoneAnswer(orca, 'no', (n, a) => { calls.push([n, a]); return Promise.reject('screen unavailable'); }, shown),
  { sent: false, peek: { error: 'screen unavailable' } });
assert.deepEqual(calls.map(([n]) => n), ['peek_petition', 'peek_petition', 'peek_petition'], 'no answer sent for a prompt not shown');
assert.throws(() => phoneAnswer(orca, 'always', peekThen(shown), shown));
assert.equal(calls.length, 3, 'always is never sent');
calls.length = 0;
// A refused answer: 403 turns the buttons off, anything else is the row's error.
assert.deepEqual(answerError('remote actions disabled'), { noActions: true });
assert.deepEqual(answerError('no permission prompt on screen'), { error: 'no permission prompt on screen' });
// A changed prompt in the same row finds no stored peek, so its old buttons go.
assert.equal(peekKey({ ...orca }), peekKey(orca));
for (const [k, v] of [['waitingFor', 'permission Edit'], ['orca', 'term_cd'], ['sinceMs', 101]])
  assert.notEqual(peekKey({ ...orca, [k]: v }), peekKey(orca), `a changed ${k} is a new peek`);
// Only the newest peek per row applies: a stale one resolving late is dropped.
{
  const latest = latestOnly(), got = [];
  let first; const slow = new Promise(r => { first = r; });
  const a = latest('k', slow, v => got.push(v)), b = latest('k', Promise.resolve('new'), v => got.push(v));
  await b; first('old'); await a;
  assert.deepEqual(got, ['new'], 'the stale peek did not overwrite the newer one');
  const c = latest('j', Promise.resolve('other row'), v => got.push(v)); await c;
  assert.deepEqual(got, ['new', 'other row'], 'rows do not cancel each other');
}

// The row: buttons only when its state says so; text as text.
const flat = n => [n, ...n.children.flatMap(flat)];
const buttons = li => flat(li).filter(n => n.tag === 'button' && n.className !== 'ptap').map(n => n.textContent);
const on = { tap() {}, answer(c) { calls.push(['answer', c]); } };
assert.deepEqual(buttons(petitionRow(orca, { ...rowState(orca, { actions: false, peek: shown }), tappable: false, open: true }, on)), []);
assert.ok(!flat(petitionRow(orca, { ...rowState(orca, { actions: false }), tappable: false }, on)).some(n => n.className === 'ptap'), 'actions off: not tappable');
const open = petitionRow(orca, { ...rowState(orca, { actions: true, peek: shown }), tappable: true, open: true }, on);
assert.deepEqual(buttons(open), ['Approve', 'Deny']);
assert.ok(flat(open).some(n => n.className === 'q' && n.textContent === 'Run ls?'));
flat(open).find(n => n.textContent === 'Approve').onclick();
assert.deepEqual(calls.at(-1), ['answer', 'yes']);
assert.deepEqual(buttons(petitionRow(orca, { ...rowState(orca, { actions: true, peek: shown }), tappable: true, open: false }, on)), [], 'closed row: no buttons');

// The rows are rebuilt (roster comes every tick) only on a change, and always when what an answer targets changes.
const st0 = rowState(orca, { actions: true, peek: shown }), sig0 = rowsSig([[orca, st0]]);
assert.equal(rowsSig([[{ ...orca }, { ...st0 }]]), sig0, 'same rows: no rebuild');
for (const [k, v] of [['orca', 'term_cd'], ['opencodeRequest', 'per_2'], ['waitingFor', 'permission Edit'], ['name', 'Other']])
  assert.notEqual(rowsSig([[{ ...orca, [k]: v }, st0]]), sig0, `a changed ${k} rebuilds the row`);
assert.notEqual(rowsSig([[orca, { ...st0, busy: true }]]), sig0, 'a changed row state rebuilds the row');

// No HTML from server text; answers only through answerCall (petition.js), and one peek call.
const src = readFileSync(new URL('./mobile.js', import.meta.url), 'utf8');
for (const banned of ['answer_petition', 'answer_opencode', 'remoteActions', 'innerHTML', 'insertAdjacentHTML', 'outerHTML'])
  assert.ok(!src.includes(banned), `mobile.js must not use ${banned}`);
assert.equal(src.split('peek_petition').length - 1, 1, 'one peek_petition call (openRow)');
console.log('mobile ok');
