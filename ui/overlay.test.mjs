import assert from 'node:assert/strict';
import { install, flush, tick, emit, invoked, replies } from './testdom.mjs';

// The tags over characters: a stuck tag yields to the sealed tag and to a petition label (overlay.js).
install();
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });
const { initViewport } = await import('./viewport.js');
const { initOverlay, syncLabels, sealText, stuckText, sameText, honoursLines } = await import('./overlay.js');

const actors = new Map(), canvas = document.createElement('canvas'), overlay = document.createElement('div');
initViewport({ canvas, overlay, scene: () => ({ w: 1, h: 1 }), iso: () => false, strip: () => false, at: () => [0, 0], relayout: () => {}, setMouse: () => {} });
initOverlay({ cast: { actors }, canvas, overlay, at: () => [0, 0], feet: () => [0, 0],
  strip: () => false, hall: () => null, layout: () => null, roster: () => [], mouse: () => null, actorAt: () => null, paused: () => false, hhmm: d => d.toISOString().slice(11, 16) });
await flush();

const stuck = { kind: 'silent', sinceMs: Date.now() - 20 * 60_000 };
const actor = (id, s, extra = {}) => { const a = { id, s: { name: id, status: 'busy', stuck, ...s }, ...extra }; actors.set(id, a); return a; };

// Busy and stuck, nothing else: the stuck tag speaks, the sealed tag does not.
const plain = actor('plain', {});
assert.match(stuckText(plain), /20/, 'the stuck line');
assert.equal(sealText(plain), '');

// A usage limit says more: the sealed tag shows, the stuck tag yields.
const sealed = actor('sealed', { limit: { resetMs: Date.UTC(2026, 9, 17, 18, 0) } });
assert.equal(stuckText(sealed), '');
assert.equal(sealText(sealed), 'sealed · resets 18:00');

// A pending petition label says more still: it hides both tags. It exists only for an actor queued with a waiting status.
const waiting = actor('waiting', { status: 'waiting', waitingFor: 'approve Bash', limit: { resetMs: 1 } }, { pose: 'queue' });
assert.equal(stuckText(waiting), '', 'stuck without a label yet: the limit already hides it');
assert.notEqual(sealText(waiting), '', 'sealed until its label exists');
const asking = actor('asking', { status: 'waiting', waitingFor: 'approve Bash' }, { pose: 'queue' });
assert.match(stuckText(asking), /20/, 'no label yet: the stuck tag would show');
syncLabels();
assert.equal(stuckText(asking), '', 'the petition label is up: the stuck tag yields');
assert.equal(sealText(waiting), '', 'and so does the sealed tag');

// Two sessions on one file (O13): the tag names the file and the other session; a stuck tag or a label says more.
{
  const sameFile = { file: 'app.js', other: 'terra-2' };
  const on = actor('same', { stuck: null, sameFile });
  assert.equal(sameText(on), 'same file: app.js · terra-2');
  assert.equal(sameText(actor('same2', { sameFile })), '', 'stuck says more');
  assert.equal(sameText(actor('same3', { stuck: null })), '', 'no overlap: no tag');
  const queued = actor('same4', { stuck: null, sameFile, status: 'waiting', waitingFor: 'approve Bash' }, { pose: 'queue' });
  syncLabels();
  assert.equal(sameText(queued), '', 'the petition label is up: it yields');
}

// A risky petition through card.js `answer` (the card's buttons and the label's ✓ both call it): Always is never
// sent; Approve is sent only on a second click within 5 s; a late second click arms again.
{
  const { initCard, answer, pick } = await import('./card.js');
  let cardRoster = [];
  initCard({ cast: { actors }, roster: () => cardRoster });
  const risky = { id: 'rk', name: 'rk', status: 'waiting', source: 'claude', orca: 'term_rk', waitingFor: 'approve Bash', sinceMs: 7, asks: 'Bash: ls', risk: 'git reset --hard' };
  const sent = () => invoked('answer_petition').length, base = sent();
  answer(risky, 'always'); await flush();
  assert.equal(sent(), base, 'no Always on a risky petition');
  answer(risky, 'yes'); await flush();
  assert.equal(sent(), base, 'the first Approve only arms');
  answer(risky, 'yes'); await flush();
  assert.equal(sent(), base, 'a double-click (under 400 ms) never sends');
  tick(500);
  answer(risky, 'yes'); await flush();
  assert.equal(sent(), base + 1, 'a second click within 5 s sends');
  answer(risky, 'yes'); await flush();
  tick(5001);
  answer(risky, 'yes'); await flush();
  assert.equal(sent(), base + 1, 'too late: armed again, nothing sent');
  const safe = { ...risky, id: 'sf', risk: null };
  answer(safe, 'yes'); await flush();
  assert.equal(sent(), base + 2, 'a safe Approve goes on the first click');

  // The card's buttons: a dialog that offers Always shows it for a safe petition, never for a risky one.
  replies.peek_petition = { question: 'Do you want to proceed?', yes: 'Yes', always: "Yes, and don't ask again", no: 'No' };
  const always = () => document.getElementById('card').querySelector('[data-choice="always"]');
  for (const [s, hidden] of [[{ ...safe, sinceMs: 8 }, false], [{ ...risky, sinceMs: 9 }, true]]) {
    cardRoster = [s]; actors.set(s.id, { id: s.id, s, leaving: false });
    pick(s.id); await flush(); tick(3100); pick(s.id); pick(s.id); await flush();
    assert.equal(document.getElementById('card').hidden, false, 'the card is up');
    assert.equal(document.getElementById('card').querySelector('.answer').hidden, false, 'its answer row too');
    assert.equal(always().hidden, hidden, `Always ${hidden ? 'hidden on a risky' : 'shown on a safe'} petition`);
    pick(s.id); actors.delete(s.id); // deselect
  }
}

// Away, leaving or helper actors carry no tag at all.
assert.equal(stuckText({ ...plain, leaving: true }), '');
assert.equal(stuckText({ ...plain, h: {} }), '');

// The Hall of Honours: asked at start, again on a commit or an answered petition and at midnight, not on other events.
assert.equal(invoked('honours').length, 1, 'asked at start');
emit('chronicle', { kind: 'commit', ts: 0 }); emit('chronicle', { kind: 'petition-answered', ts: 0 }); emit('chronicle', { kind: 'arrived', ts: 0 });
assert.equal(invoked('honours').length, 3, 'a commit and an answered petition ask again; an arrival does not');
emit('chronicle', { kind: 'task-done', ts: 0 });
assert.equal(invoked('honours').length, 4, 'a finished long task asks again (the longest task, the busiest day)');
tick(9.5 * 3_600_000 + 10_000); // the clock starts at 14:30 UTC: past the next midnight
assert.equal(invoked('honours').length, 5, 'asked again at midnight');
// Each mark's department and value; an empty mark shows a dash.
assert.deepEqual(honoursLines(null), [['—', ''], ['—', ''], ['—', ''], ['—', '']]);
assert.deepEqual(honoursLines({ commits: { dept: 'Terra', value: 12 }, longest: { dept: 'Geneseed', value: 3_900_000 }, fast: null,
  busiest: { dept: 'Hololith', value: 7_500_000, day: '2026-11-03' } }), [['Terra', '12'], ['Geneseed', '1h05'], ['—', ''], ['Hololith', '2h05 · Tue 3']]);
console.log('overlay ok');

// Custom rooms (O10c): a west wing room's plaque on its top wall in the rule's colour. One department: that department's
// own plaque (its branch, opens its folder), no other. Several: the room's name (r:<id>), the departments' inside. Empty:
// the rule's name (else its pattern), dim. An empty room's placeholder gets no department plaque.
{
  const { rooms } = await import('./rooms.js');
  const { hallOf, planLayout, layoutDepartments, SCENE } = await import('./layout.js');
  const { renderPlaques } = await import('./overlay.js'), { scale } = await import('./viewport.js');
  rooms.list = [{ id: 'rA', name: 'Terra works', pattern: '**', color: '#aa0000' }, { id: 'rB', name: '', pattern: '**/empty/**', color: '#00bb00' },
    { id: 'rC', name: 'Pair', pattern: '**/pair/**', color: '#0000cc' }];
  const P = planLayout(null, [{ name: 'Terra', color: '#ffffff', ids: ['t1'], room: 'rA' }, { name: 'P1', color: '#ffffff', ids: ['p1'], room: 'rC' },
    { name: 'P2', color: '#ffffff', ids: ['p2'], room: 'rC' }], 0, {}, SCENE, layoutDepartments, rooms.list);
  const H = hallOf(P.bays, SCENE, P.wing), ov = document.createElement('div');
  const roster = [{ id: 't1', dept: 'Terra', cwd: 'C:\\git\\Terra', sinceMs: 1, room: 'rA', branch: 'wing' }, { id: 'p1', dept: 'P1', cwd: 'C:\\pair\\1', sinceMs: 1, room: 'rC' },
    { id: 'p2', dept: 'P2', cwd: 'C:\\pair\\2', sinceMs: 1, room: 'rC' }];
  initOverlay({ cast: { actors: new Map() }, canvas, overlay: ov, at: (x, y) => [x, y], feet: () => [0, 0], strip: () => false, hall: () => H, layout: () => P,
    roster: () => roster, mouse: () => null, actorAt: () => null, paused: () => false, hhmm: () => '' });
  renderPlaques(P.blocks);
  const top = e => parseFloat(e.style.top) / scale, byText = s => ov.children.filter(e => e.textContent.startsWith(s));
  const room = ov.children.filter(e => e.classList.contains('room'));
  assert.deepEqual(room.map(e => [e.textContent, e.style.color, e.classList.contains('dim')]), [['**/empty/**', '#00bb00', true], ['Pair', '#0000cc', false]], 'named (else its pattern), dim while empty');
  const [terra] = byText('Terra');
  assert.equal(byText('Terra').length, 1, 'one department: one plaque');
  assert.deepEqual([terra.textContent, terra.style.color, terra.classList.contains('open'), top(terra)], ['Terrawing', '#aa0000', true, H.rooms[0].plaqueY], 'its own, on the top wall');
  assert.ok(!byText('Terra works').length, 'no room name over a single department');
  for (const n of ['P1', 'P2']) { const [e] = byText(n); assert.ok(e && top(e) > H.rooms[2].y, `${n}: its plaque inside the room`); }
  for (const [e, R] of [[terra, H.rooms[0]], [room[0], H.rooms[1]], [room[1], H.rooms[2]]]) assert.ok(top(e) >= R.top && top(e) + 8 <= R.y, `${e.textContent}: on ${R.id}'s top wall`);
  assert.ok(!ov.children.some(e => e.textContent.startsWith('room:')), 'the placeholder has none');
}
console.log('overlay rooms ok');