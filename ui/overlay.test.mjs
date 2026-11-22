import assert from 'node:assert/strict';
import { install, flush, tick, emit, invoked, replies } from './testdom.mjs';

// The tags over characters: a stuck tag yields to the sealed tag and to a petition label (overlay.js).
install();
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });
const { initViewport } = await import('./viewport.js');
const { initOverlay, syncLabels, syncScribeKeys, sealText, stuckText, sameText, honoursLines } = await import('./overlay.js');

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
    // F7: Deny sits between Approve and Always, so a slip off Approve cannot hit Always
    assert.deepEqual([...document.getElementById('card').querySelector('.answer').children].map(b => b.dataset.choice), ['yes', 'no', 'always'], 'Always is not next to Approve');
    pick(s.id); actors.delete(s.id); // deselect
  }
}

// F6: a risky petition's first Approve click arms it, and the hall label says so (class and text) until the 5 s window closes.
{
  const { initCard, answer } = await import('./card.js');
  const { T } = await import('./theme.js');
  T.text.petition = { armed: 'armed: click again' }; // theme.js TEXT holds the real key (L3b); the label reads it with t('petition.armed')
  const rk = { id: 'arm', name: 'arm', dept: 'D', status: 'waiting', source: 'claude', orca: 'term_arm', waitingFor: 'approve Bash', sinceMs: 77, asks: 'Bash: ls', risk: 'git reset --hard' };
  initCard({ cast: { actors }, roster: () => [rk] });
  actors.clear(); actors.set(rk.id, { id: rk.id, s: rk, pose: 'queue' });
  syncLabels();
  const label = () => overlay.children.find(e => e.classList.contains('lbl') && e.classList.contains('risky'));
  const approve = () => label().querySelector('.ans').children[0], sub = () => label().querySelector('.sub').textContent;
  assert.ok(!label().classList.contains('armed') && /risky/.test(sub()), 'before the first click: not armed, the reason shows');
  approve().click(); syncLabels();
  assert.ok(label().classList.contains('armed'), 'after the first click: the label carries the armed class');
  assert.equal(sub(), 'armed: click again', 'and the armed text');
  assert.ok(approve().classList.contains('armed'), 'and its Approve button');
  tick(4900); syncLabels();
  assert.ok(label().classList.contains('armed'), 'still armed inside the window');
  tick(200); syncLabels();
  assert.ok(!label().classList.contains('armed') && /risky/.test(sub()), 'after the 5 s window it clears');
  assert.ok(!approve().classList.contains('armed'));
  // F7: the label's Approve and Deny are the only buttons in its answer row (Always is never offered there)
  assert.deepEqual([...label().querySelector('.ans').children].map(b => b.getAttribute('aria-label')), ['Approve arm', 'Deny arm']);
  void answer; actors.clear(); syncLabels();
}

// F15: each live scribe has a focusable button over it, in department then name order; a click on it (Enter or Space on a
// native button) opens its card; a scribe with a petition label has the label's own button and none of these.
{
  const { initCard } = await import('./card.js');
  const mk = (name, dept, extra = {}, a = {}) => ({ id: name, s: { id: name, name, dept, status: 'busy', sinceMs: 1, ...extra }, leaving: false, ...a });
  const list = [mk('zed', 'B'), mk('amy', 'B'), mk('cal', 'A'), mk('pet', 'A', { status: 'waiting', waitingFor: 'approve Bash' }, { pose: 'queue' }), { ...mk('gone', 'A'), leaving: true }, { ...mk('helper', 'A'), h: { kind: 'Explore' } }];
  actors.clear(); for (const a of list) actors.set(a.id, a);
  initCard({ cast: { actors }, roster: () => list.map(a => a.s) });
  syncLabels(); syncScribeKeys();
  const keys = overlay.querySelectorAll('.scribe-key');
  assert.deepEqual(keys.map(k => k.getAttribute('aria-label')), ['cal, Writing', 'amy, Writing', 'zed, Writing'], 'one per live scribe, department then name; name and status; none for the petitioner, the leaver, the adept');
  assert.ok(keys.every(k => k.localName === 'button' && k.getAttribute('tabindex') !== '-1' && !k.hidden), 'real buttons: in the tab order');
  keys[1].focus(); keys[1].click(); // a native button turns Enter and Space into this click
  const card = document.getElementById('card');
  assert.equal(card.hidden, false, 'its card opens');
  assert.match(card.querySelector('.name').textContent, /^amy/, "the scribe's own card");
  actors.get('amy').s.status = 'idle'; syncScribeKeys();
  assert.equal(overlay.querySelectorAll('.scribe-key')[1].getAttribute('aria-label'), 'amy, Turn done, awaiting orders', 'the label follows its status');
  actors.delete('cal'); syncScribeKeys();
  assert.equal(overlay.querySelectorAll('.scribe-key').length, 2, 'a scribe that leaves loses its button');
  keys[1].click(); actors.clear(); syncLabels(); syncScribeKeys();
}

// A click whose terminal does not open: with the card on a click (the default), the card is up and says nothing more
// (Open in Orca comes back on it); with it off (Settings), no card shows, so a toast says so (main.rs open_failed).
{
  const { initCard, pick, closeCard } = await import('./card.js');
  const { settings } = await import('./settings.js');
  const s = { id: 'of', name: 'Scribe of', status: 'idle', source: 'claude', orca: 'term_of', sinceMs: 1 };
  initCard({ cast: { actors }, roster: () => [s] });
  actors.set(s.id, { id: s.id, s, leaving: false });
  const card = document.getElementById('card'), toasts = () => invoked('open_failed').length, base = toasts();
  replies.open_session = new Error('orca not found');
  pick(s.id); await flush();
  assert.equal(card.hidden, false, 'on: the card is up');
  assert.equal(toasts(), base, 'on: no toast, the card shows it');
  closeCard();
  settings.cardOnClick = false;
  pick(s.id); await flush();
  assert.equal(card.hidden, true, 'off: no card for this click');
  assert.equal(toasts(), base + 1, 'off: the failure is said in a toast');
  assert.deepEqual(invoked('open_failed').at(-1).args, { name: 'Scribe of', error: 'orca not found' });
  replies.open_session = undefined;
  pick(s.id); await flush();
  assert.equal(toasts(), base + 1, 'a terminal that opens: no toast');
  settings.cardOnClick = true; actors.delete(s.id); delete replies.open_session;
}

// The claude.ai link: with the Claude desktop app running (s.app) it says so and opens the session in the app.
{
  const { initCard, pick, closeCard } = await import('./card.js');
  const card = document.getElementById('card');
  const link = () => card.querySelectorAll('.links button')[1];
  for (const [app, label, target] of [[true, 'Open in Claude', 'app:'], [false, 'Open on claude.ai', 'web:']]) {
    const s = { id: `w${app}`, name: 'Scribe w', status: 'idle', source: 'claude', web: 'https://claude.ai/code/session_01w', app, sinceMs: 1 };
    initCard({ cast: { actors }, roster: () => [s] });
    actors.set(s.id, { id: s.id, s, leaving: false });
    pick(s.id); await flush();
    assert.equal(link().hidden, false, 'the link is shown');
    assert.equal(link().textContent, label);
    link().click(); await flush();
    assert.deepEqual(invoked('open_session').at(-1).args, { target: `${target}https://claude.ai/code/session_01w` });
    closeCard(); actors.delete(s.id);
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
// I6b: two kinds of lit CI lamp. A scribe's (its own push, Session.ci) beside its desk, a department's main lamp (its
// default branch, the ci-lamps list) at its block's east end. Each shows the card's line as the hover tip and opens its
// checks page (the session id, the department name); an unlit lamp does neither; each lit lamp has a focusable button.
// The words are theme.js `ci.*` (lane L4a), set here.
{
  const { T } = await import('./theme.js');
  const { setLamps, LAMP_SIZE, MAIN_SIZE } = await import('./cilamp.js');
  const { syncHover, syncLampKeys, litLamps, lampHit, lampTip, openLamp } = await import('./overlay.js');
  const { scale } = await import('./viewport.js');
  T.text.ci = { open: 'Open the checks page', running: 'CI · {branch} · {sha} · running {done}/{total}', pass: 'CI · {branch} · {sha} · passed',
    fail: 'CI · {branch} · {sha} · failed: {check}', timeout: 'CI · {branch} · {sha} · no verdict after 30 min', error: 'CI · {branch} · {sha} · could not be read' };
  // two departments, a scribe each: the scribe lamp 34.5 px east of the desk (layout.js scribeSpots), the main lamp at the
  // block's east end (mainSpots: x + w - 4), both feet 8 px under the block's top
  const blocks = [{ name: 'Terra', x: 10, y: 20, w: 100, h: 50 }, { name: 'Geneseed', x: 10, y: 100, w: 100, h: 50 }];
  const L = { blocks, desks: [{ id: 't1', dept: 'Terra', x: 15, y: 28 }, { id: 'g1', dept: 'Geneseed', x: 15, y: 108 }], consoles: [] };
  const ci = (state, extra = {}) => ({ repo: 'a/b', branch: 'feat', sha7: '5d6e7f8', state, done: 3, total: 5, failed: null, ...extra });
  const sess = [{ id: 't1', dept: 'Terra', ci: ci('running') }, { id: 'g1', dept: 'Geneseed' }];
  let pointer = null;
  const at = (x, y) => [x, y];
  const tipEl = document.getElementById('tip'), ov = document.createElement('div');
  initOverlay({ cast: { actors: new Map() }, canvas, overlay: ov, at, feet: () => [0, 0], strip: () => false, hall: () => ({}), layout: () => L,
    roster: () => sess, mouse: () => pointer, actorAt: () => null, lampAt: e => lampHit(litLamps(), e.clientX, e.clientY, at, 2), paused: () => false, hhmm: () => '' });
  const lamp = (dept, state, extra = {}) => ({ dept, cwd: `C:\${dept}`, state, branch: 'main', sha7: '9a8b7c6', failed: null, ...extra });
  const over = (x, y) => { pointer = { clientX: x, clientY: y, pointerType: 'mouse' }; syncHover(); };
  const scribe = [49.5, 25], terra = [106, 22], gene = [106, 102]; // inside each lamp's rect (feet at y 28 / 108)

  // the list: kind, who, the spot, the CI shown, its size; the scribe's from its session, the main from the list
  setLamps([lamp('Terra', 'pass'), lamp('Geneseed', 'none')]);
  assert.deepEqual(litLamps().map(l => [l.kind, l.who, l.s.x, l.s.y, l.ci.state, l.size]), [['main', 'Terra', 106, 28, 'pass', MAIN_SIZE], ['scribe', 't1', 49.5, 28, 'running', LAMP_SIZE]]);
  // the hit test: each by its own rect, the main lamp's taller (14 px) than the scribe's (10)
  assert.equal(lampHit(litLamps(), ...scribe, at, 0)?.who, 't1', 'the scribe lamp at its desk');
  assert.equal(lampHit(litLamps(), ...terra, at, 0)?.who, 'Terra', 'the main lamp at its spot');
  assert.equal(lampHit(litLamps(), 106, 28 - 13, at, 0)?.who, 'Terra', 'the main lamp: 14 px tall');
  assert.equal(lampHit(litLamps(), 49.5, 28 - 13, at, 0), null, 'the scribe lamp: 10 px tall');
  assert.equal(lampHit(litLamps(), 106 + 3.4, 26, at, 0)?.who, 'Terra', 'the main lamp: 7 px wide');
  assert.equal(lampHit(litLamps(), 49.5 + 3.4, 26, at, 0), null, 'the scribe lamp: 5 px wide');

  over(...scribe);
  assert.equal(tipEl.hidden, false, 'a lit scribe lamp under the pointer shows the tip');
  assert.equal(tipEl.textContent, 'CI · feat · 5d6e7f8 · running 3/5', 'the card line of its own push');
  over(...terra);
  assert.equal(tipEl.textContent, 'CI · main · 9a8b7c6 · passed', 'the main lamp: the default branch');
  assert.equal(parseFloat(tipEl.style.left), 106 * scale, 'the tip hangs over the lamp');
  assert.equal(parseFloat(tipEl.style.top), (28 - 14 - 3) * scale, 'over the main lamp\'s own height');
  over(...gene);
  assert.equal(tipEl.hidden, true, 'an unlit main lamp: no tip');
  over(300, 300);
  assert.equal(tipEl.hidden, true, 'nothing under the pointer: no tip');
  for (const state of ['timeout', 'error']) { setLamps([lamp('Terra', state)]); over(...terra); assert.equal(tipEl.hidden, true, `${state}: unlit, no tip`); }
  sess[0].ci = ci('timeout'); over(...scribe);
  assert.equal(tipEl.hidden, true, 'an unlit scribe lamp: no tip');
  sess[0].ci = ci('fail', { failed: 'build' }); over(...scribe);
  assert.equal(tipEl.textContent, 'CI · feat · 5d6e7f8 · failed: build');
  setLamps([lamp('Terra', 'running', { sha7: '2222222' })]); over(...terra);
  assert.equal(tipEl.textContent, 'CI · main · 2222222 · running ?/?', 'a session on another commit does not lend its count');
  sess[0].ci = ci('running', { branch: 'main', sha7: '2222222' }); over(...terra);
  assert.equal(tipEl.textContent, 'CI · main · 2222222 · running 3/5', 'a session that pushed that commit lends its count');
  setLamps([lamp('Terra', 'pass')]); sess[0].ci = ci('pass');

  // the clicks: the session id for a scribe lamp, the department name for the main lamp, never a URL; a rejection
  // shows in that lamp's tip only, then goes
  const before = invoked('ci_open').length;
  openLamp(lampHit(litLamps(), ...scribe, at, 0).who); await flush();
  assert.deepEqual(invoked('ci_open').at(-1).args, { who: 't1' }, 'the scribe lamp: its session');
  openLamp(lampHit(litLamps(), ...terra, at, 0).who); await flush();
  assert.equal(invoked('ci_open').length, before + 2);
  assert.deepEqual(invoked('ci_open').at(-1).args, { who: 'Terra' }, 'the main lamp: its department');
  replies.ci_open = new Error('no browser');
  openLamp('Terra'); await flush(); over(...terra);
  assert.equal(tipEl.textContent, 'no browser', 'the failure is said where the user looks');
  over(...scribe);
  assert.equal(tipEl.textContent, 'CI · feat · 5d6e7f8 · passed', 'not on the other lamp');
  tick(5001); over(...terra);
  assert.equal(tipEl.textContent, 'CI · main · 9a8b7c6 · passed', 'and goes after 5 s');
  delete replies.ci_open;

  // one focusable button per lit lamp, main lamps by department then scribe lamps by session; the unlit have none;
  // Enter or Space (a native click) opens its page
  setLamps([lamp('Terra', 'pass'), lamp('Geneseed', 'running'), lamp('Nope', 'pass')]);
  sess[1].ci = ci('none');
  syncLampKeys();
  let keys = ov.querySelectorAll('.lamp-key');
  assert.deepEqual(keys.map(k => k.getAttribute('aria-label')), ['Geneseed: CI · main · 9a8b7c6 · running ?/?', 'Terra: CI · main · 9a8b7c6 · passed', 'Terra: CI · feat · 5d6e7f8 · passed'], 'lit lamps with a block or a desk only');
  assert.ok(keys.every(k => k.localName === 'button' && k.getAttribute('tabindex') !== '-1'), 'real buttons: in the tab order');
  keys[1].click(); await flush();
  assert.deepEqual(invoked('ci_open').at(-1).args, { who: 'Terra' });
  keys[2].click(); await flush();
  assert.deepEqual(invoked('ci_open').at(-1).args, { who: 't1' });
  assert.equal(parseFloat(keys[1].style.top), (28 - 14 / 2) * scale, 'the main key over the middle of its lamp');
  assert.equal(parseFloat(keys[2].style.top), (28 - 10 / 2) * scale, 'the scribe key over the middle of its lamp');
  // the same lamps a second later: the same buttons, the DOM untouched
  const same = ov.querySelectorAll('.lamp-key');
  setLamps([lamp('Terra', 'pass'), lamp('Geneseed', 'running'), lamp('Nope', 'pass')]); syncLampKeys();
  assert.ok(ov.querySelectorAll('.lamp-key').every((k, i) => k === same[i]), 'unchanged lamps: the same buttons');
  setLamps([lamp('Terra', 'none')]); sess[0].ci = ci('error'); syncLampKeys();
  assert.equal(ov.querySelectorAll('.lamp-key').length, 0, 'a lamp that goes out loses its key');
  setLamps([]); sess[0].ci = null; over(...terra);
  assert.equal(tipEl.hidden, true, 'no lamps: nothing');
  assert.equal(lampTip({ kind: 'main', who: 'Terra' }), '');
  pointer = null;
}
