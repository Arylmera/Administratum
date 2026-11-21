import assert from 'node:assert/strict';
import { answerable, answerCall, ANSWER_ORDER, kinOf, lineageOf, stuckLine, watchLines, cacheLine, cardOnPick } from './card.js';
import { candleOf } from './scene.js';

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
// A click's card (Settings: Show the card when I click a character). On: always. Off, on the desktop: only for a petition
// to answer, or with no terminal to open; an adept's card answers nothing. The remote view opens no terminal: always.
{
  const scribe = { id: 's1' }, adept = { id: 's1|h1', h: { kind: 'Explore' } }, idle = { ...claude, status: 'idle' }, off = { on: false };
  assert.ok(cardOnPick(scribe, idle), 'default on');
  assert.ok(!cardOnPick(scribe, idle, off), 'off: the terminal only');
  assert.ok(cardOnPick(scribe, claude, off), 'off: a petition to answer still shows it');
  assert.ok(!cardOnPick(scribe, { ...claude, waitingFor: 'input needed' }, off), 'off: a free-text petition is answered in the terminal');
  assert.ok(cardOnPick(scribe, oc, off), 'off: an OpenCode request outside Orca');
  assert.ok(cardOnPick(scribe, { ...idle, orca: null }, off), 'off: no terminal to open');
  assert.ok(cardOnPick({ id: 'watch', watch: true }, undefined, off), 'off: the Watchman (no session)');
  assert.ok(!cardOnPick(adept, claude, off), "off: an adept's card answers nothing");
  assert.ok(cardOnPick(scribe, idle, { on: false, remote: true }), 'remote: always');
}
// F7: Always is never next to Approve in the card's answer row (overlay.test.mjs checks the real DOM order).
assert.deepEqual([...ANSWER_ORDER].sort(), ['always', 'no', 'yes'], 'every choice once');
assert.ok(Math.abs(ANSWER_ORDER.indexOf('always') - ANSWER_ORDER.indexOf('yes')) > 1, 'Always is not adjacent to Approve');
console.log('card ok');

// A stuck session (monitor.rs): silent since its last write, or looping on one call.
assert.equal(stuckLine({ kind: 'silent', sinceMs: 0, tool: null, count: 0 }, 16 * 60_000 + 5), 'stalled · 16m');
assert.equal(stuckLine({ kind: 'loop', sinceMs: 0, tool: 'Bash', count: 5 }, 0), 'looping · Bash ×5');
assert.equal(stuckLine(null, 0), '');

// The watch's lines (O13): the same file and the other session; a port this turn found in use.
assert.deepEqual(watchLines({ sameFile: { file: 'app.js', other: 'terra-2' }, turn: { portInUse: '3000' } }),
  ['same file: app.js · terra-2', 'port 3000 already in use']);
assert.deepEqual(watchLines({ turn: { portInUse: null } }), []);
assert.deepEqual(watchLines({}), []);

// The cache clock (O15): the candle's phase from the time left over the TTL; the card's line; who shows it.
{
  const now = 1_000_000, M = 60_000;
  const at = (status, untilMs, ttlMs = 5 * M, pose = 'desk') => ({ pose, s: { status, cache: untilMs == null ? null : { untilMs, ttlMs } } });
  assert.deepEqual(candleOf(at('idle', now + 5 * M), now), { phase: 'lit', k: 1 }, 'just written: lit');
  assert.equal(candleOf(at('idle', now + 3 * M), now).phase, 'lit', 'more than half the TTL left');
  assert.equal(candleOf(at('idle', now + 2.5 * M), now).phase, 'low', 'half: burning down');
  assert.equal(candleOf(at('idle', now + 1), now).phase, 'low');
  assert.deepEqual(candleOf(at('idle', now), now), { phase: 'out', k: 0 }, 'cold at the TTL');
  assert.equal(candleOf(at('idle', null), now).phase, 'out', 'nothing cached: cold');
  assert.equal(candleOf(at('idle', now + 40 * M, 60 * M), now).phase, 'lit', 'a 1 h cache with 40 min left');
  assert.equal(candleOf(at('idle', now + 20 * M, 60 * M), now).phase, 'low', 'a 1 h cache with 20 min left');
  assert.deepEqual(candleOf(at('busy', now - M), now), { phase: 'lit', k: 1 }, 'a working scribe stays lit');
  assert.equal(candleOf(at('idle', now + M, 5 * M, 'nap'), now), null, 'a napper in the refectory shows nothing');
  assert.equal(candleOf(at('waiting', now + M), now), null);
  assert.equal(candleOf({ ...at('idle', now + M), h: {} }, now), null, 'adepts have no candle');
  assert.equal(cacheLine(at('idle', now + 3 * M), now), 'cache warm · 3 min left');
  assert.equal(cacheLine(at('idle', now + 10_000), now), 'cache warm · 1 min left');
  assert.equal(cacheLine(at('idle', now - 1), now), 'cache cold');
  assert.equal(cacheLine(at('busy', now + M), now), '', 'only idle scribes show it');
  assert.equal(cacheLine(at('idle', now + M, 5 * M, 'nap'), now), '');
  assert.deepEqual(watchLines({}, at('idle', now - 1), now), ['cache cold']);
}

// I6: the CI line of a card (words: theme.js `ci.*`, set here as lane L4a's placeholders {branch} {sha} {done} {total} {check}).
{
  const { install, flush, invoked, replies } = await import('./testdom.mjs');
  const { T } = await import('./theme.js');
  const { ciLine, initCard, pick, closeCard } = await import('./card.js');
  install();
  T.text.ci = { open: 'Open the checks page', running: 'CI · {branch} · {sha} · running {done}/{total}', pass: 'CI · {branch} · {sha} · passed',
    fail: 'CI · {branch} · {sha} · failed: {check}', timeout: 'CI · {branch} · {sha} · no verdict after 30 min', error: 'CI · {branch} · {sha} · could not be read' };
  const ci = (state, extra = {}) => ({ repo: 'a/b', branch: 'feat', sha7: '5d6e7f8', state, done: 3, total: 5, failed: null, ...extra });
  assert.equal(ciLine(ci('running')), 'CI · feat · 5d6e7f8 · running 3/5');
  assert.equal(ciLine(ci('pass')), 'CI · feat · 5d6e7f8 · passed');
  assert.equal(ciLine(ci('fail', { failed: 'build' })), 'CI · feat · 5d6e7f8 · failed: build');
  assert.equal(ciLine(ci('timeout')), 'CI · feat · 5d6e7f8 · no verdict after 30 min');
  assert.equal(ciLine(ci('error')), 'CI · feat · 5d6e7f8 · could not be read');
  assert.equal(ciLine(ci('none')), '', 'no CI found: no line');
  assert.equal(ciLine(null), '', 'a session that never pushed');

  const actors = new Map(), card = document.getElementById('card');
  let list = [];
  initCard({ cast: { actors }, roster: () => list });
  const show = async s => { list = [s]; actors.set(s.id, { id: s.id, s, leaving: false }); pick(s.id); await flush(); };
  const row = () => card.querySelector('.ci'), line = () => card.querySelector('.ci-line'), openErr = () => card.querySelector('.open-err');
  const base = { id: 'c1', name: 'Scribe c', dept: 'D', status: 'idle', source: 'claude', sinceMs: 1 };
  for (const [state, want] of [['running', 'CI · feat · 5d6e7f8 · running 3/5'], ['pass', 'CI · feat · 5d6e7f8 · passed'], ['fail', 'CI · feat · 5d6e7f8 · failed: build'],
    ['timeout', 'CI · feat · 5d6e7f8 · no verdict after 30 min'], ['error', 'CI · feat · 5d6e7f8 · could not be read']]) {
    await show({ ...base, ci: ci(state, { failed: 'build' }) });
    assert.equal(row().hidden, false, `${state}: the line shows`);
    assert.equal(line().textContent, want);
    assert.equal(line().localName, 'button', 'a real button: keyboard reachable');
    assert.equal(line().title, 'Open the checks page');
    closeCard(); actors.clear();
  }
  for (const s of [{ ...base, ci: null }, { ...base, ci: ci('none') }, { ...base }]) {
    await show(s);
    assert.equal(card.hidden, false);
    assert.equal(row().hidden, true, 'no line for a null or none ci');
    closeCard(); actors.clear();
  }

  // the click: ci_open with the session id, never a URL; a rejection shows on the card, the next pick clears it
  await show({ ...base, ci: ci('pass') });
  const before = invoked('ci_open').length;
  line().click(); await flush();
  assert.equal(invoked('ci_open').length, before + 1);
  assert.deepEqual(invoked('ci_open').at(-1).args, { who: 'c1' }, 'the session id, nothing else');
  assert.ok(!JSON.stringify(invoked('ci_open').at(-1).args).includes('http'), 'never a URL');
  assert.equal(openErr().hidden, true, 'it opened: no error');
  replies.ci_open = new Error('could not open the checks page: no browser');
  line().click(); await flush();
  assert.equal(openErr().hidden, false);
  assert.equal(openErr().textContent, 'could not open the checks page: no browser', 'the error is on the card');
  pick('c1'); pick('c1'); await flush(); // closes it, then reopens it: the next pick
  assert.equal(openErr().hidden, true, 'cleared on the next pick');
  delete replies.ci_open;
  closeCard(); actors.clear();

  // F5: a failed open from the card (the terminal a pick opens, the Open in Orca and claude.ai buttons) shows its error on the
  // card, not only in the console; the buttons close the card on a click, so a failure shows it again
  for (const [i, extra, msg] of [[0, { orca: 'term_x' }, 'orca not found'], [1, { web: 'https://claude.ai/code/session_01x' }, 'no claude.ai']]) {
    replies.open_session = new Error(msg);
    await show({ ...base, id: `o${i}`, ...extra }); // an Orca session: the pick's own open fails here
    const button = () => card.querySelectorAll('.links button')[i];
    assert.equal(card.hidden, false);
    if (i === 0) assert.equal(openErr().textContent, msg, 'the pick that could not open the terminal says so on the card');
    else assert.equal(openErr().hidden, true, 'nothing failed yet');
    assert.equal(button().hidden, false, 'the link is offered');
    button().click(); await flush();
    assert.equal(card.hidden, false, 'the failure shows the card again');
    assert.equal(openErr().textContent, msg, 'on the card, not only in the console');
    replies.open_session = undefined;
    button().click(); await flush();
    assert.equal(card.hidden, true, 'the next action opened: the card is done');
    pick(`o${i}`); await flush();
    assert.equal(openErr().hidden, true, 'and the error did not come back');
    closeCard(); actors.clear(); delete replies.open_session;
  }
}
