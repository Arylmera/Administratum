// Scribe gestures (gestures.js): the chooser, pure, then its wiring (actors.js bodyOf / bodyOf39, Cast.update's dozing
// transition) and the optional frames in a world's sheet (sprites.js, artcheck.js). Run: node ui/gestures.test.mjs
import assert from 'node:assert/strict';
import { gestureOf, recurs, hash01, GESTURES, GESTURE_FRAMES, THINK, WONDER, STRETCH_S, JITTER_S, PUZZLE_LAG_S } from './gestures.js';
import { planLayout, layoutDepartments, hallOf, SCENE } from './layout.js';
import { SCRIBE, SCRIBE39, ART } from './sprites.js';
import { Cast, bodyOf, bodyOf39, gestureNow } from './actors.js';
import { checkSheet, gestureWarnings, knownFrames } from './artcheck.js';
import { THEMES, setTheme } from './theme.js';
import './themes.js';

// ---- the chooser ----
const at = (s, t, has) => gestureOf({ id: 'sess-1', desk: true, busy: false, question: false, done: false, dozedFor: null, ...s }, t, has);
const over = (s, from, to, step = 0.05) => { const seen = []; for (let t = from; t < to; t += step) seen.push(at(s, t)); return seen; };
assert.ok(hash01('a') >= 0 && hash01('a') < 1 && hash01('a') === hash01('a') && hash01('a') !== hash01('b'), 'hash01: [0, 1), stable');

// think: busy at the desk, now and then, for THINK.for s each time
const busy = over({ busy: true }, 0, 120);
assert.ok(busy.every(g => g === 'think' || g === null), 'busy: think or nothing');
const share = busy.filter(Boolean).length / busy.length;
assert.ok(share > THINK.for / THINK.every[1] - 0.03 && share < THINK.for / THINK.every[0] + 0.03, `think about ${THINK.for} s every ${THINK.every.join('-')} s (${share.toFixed(3)})`);
// each run lasts THINK.for, runs start between every[0] - JITTER_S and every[1] + JITTER_S apart
const runs = (seen, step = 0.05) => { const r = []; seen.forEach((g, i) => { if (g && !seen[i - 1]) r.push({ at: i * step, n: 0 }); if (g) r.at(-1).n++; }); return r; };
for (const id of ['a', 'b', 'c', 'sess-1', 'ab12cd34-0000']) {
  const r = runs(over({ id, busy: true }, 0, 300)).slice(1, -1);
  assert.ok(r.length >= 15, `${id}: think recurs (${r.length} in 300 s)`);
  for (const x of r) assert.ok(Math.abs(x.n * 0.05 - THINK.for) < 0.11, `${id}: a think lasts ${THINK.for} s (${x.n * 0.05})`);
  for (let i = 1; i < r.length; i++) { const gap = r[i].at - r[i - 1].at; assert.ok(gap > THINK.every[0] - JITTER_S - 0.1 && gap < THINK.every[1] + JITTER_S + 0.1, `${id}: think every ~${THINK.every.join('-')} s (${gap})`); }
}
// deterministic, and not in step from one scribe to the next
assert.deepEqual(over({ busy: true }, 0, 30), over({ busy: true }, 0, 30), 'the same answer for the same scribe and time');
const ids = Array.from({ length: 8 }, (_, i) => `scribe-${i}`), starts = ids.map(id => runs(over({ id, busy: true }, 0, 30))[0]?.at);
assert.ok(new Set(starts.map(s => Math.round(s))).size >= 5, `scribes out of step: ${starts}`);

// wonder: a question at the desk, now and then, WONDER.for s each time, never continuous
const q = over({ question: true }, 0, 120);
assert.ok(q.every(g => g === 'wonder' || g === null) && q.some(Boolean), 'question: wonder now and then');
const qs = q.filter(Boolean).length / q.length;
assert.ok(qs > WONDER.for / WONDER.every[1] - 0.03 && qs < WONDER.for / WONDER.every[0] + 0.03, `wonder about ${WONDER.for} s every ${WONDER.every.join('-')} s (${qs.toFixed(3)})`);
for (const x of runs(q).slice(1, -1)) assert.ok(Math.abs(x.n * 0.05 - WONDER.for) < 0.11, 'a wonder lasts WONDER.for');

// stretch: once, STRETCH_S s from the moment it starts dozing, then nothing (the Zs)
assert.equal(at({ dozedFor: 0 }, 5), 'stretch');
assert.equal(at({ dozedFor: STRETCH_S - 0.01 }, 5), 'stretch');
assert.equal(at({ dozedFor: STRETCH_S }, 5), null);
assert.ok(over({ dozedFor: 60 }, 0, 60).every(g => g === null), 'dozing past the stretch: no gesture');
assert.equal(at({ dozedFor: 0.5, question: true, busy: true }, 5), 'stretch', 'the stretch first');

// puzzled: wonder once, PUZZLE_LAG_S after a tool error, for WONDER.for s, over a think
assert.equal(at({ busy: true, puzzledFor: PUZZLE_LAG_S - 0.01 }, 5, n => n !== 'think'), null, 'the sparks first');
assert.equal(at({ busy: true, puzzledFor: PUZZLE_LAG_S }, 5), 'wonder');
assert.equal(at({ busy: true, puzzledFor: PUZZLE_LAG_S + WONDER.for - 0.01 }, 5), 'wonder');
assert.equal(at({ puzzledFor: PUZZLE_LAG_S + WONDER.for }, 5), null);
assert.equal(at({ puzzledFor: 1, desk: false }, 5), null, 'not away from the desk');
assert.equal(at({ puzzledFor: 1, dozedFor: 0.5 }, 5), 'stretch', 'the stretch first');
// nothing away from the desk, or while a finished scroll is held up; idle without a question: nothing
for (const s of [{ desk: false, busy: true }, { done: true, busy: true }, { desk: false, dozedFor: 0 }, { done: true, dozedFor: 0 }, {}]) assert.ok(over(s, 0, 60).every(g => g === null), JSON.stringify(s));
// a gesture the world does not draw is never played
for (let t = 0; t < 120; t += 0.05) assert.equal(at({ busy: true }, t, n => n !== 'think'), null, 'no think frame: no think');
assert.equal(at({ dozedFor: 0 }, 5, () => false), null, 'no stretch frame: no stretch');
assert.equal(recurs(THINK, 'x', 1), recurs(THINK, 'x', 1));

// ---- the frames: the closed list, and every shipped world loads without any of them ----
assert.deepEqual(GESTURES, ['think', 'wonder', 'stretch']);
assert.deepEqual(GESTURE_FRAMES, { scribe: ['up think', 'up wonder', 'up stretch'], scribe39: ['N think', 'N wonder', 'N stretch'] });
for (const id of Object.keys(THEMES)) {
  setTheme(id);
  assert.deepEqual(SCRIBE.gesture, {}, `${id}: draws no flat gesture yet`);
  if (SCRIBE39.E) assert.deepEqual(SCRIBE39.gesture, {}, `${id}: draws no 2.5D gesture yet`);
}
setTheme('tier2');

// ---- a pack's sheet may carry them, at the seated frame's size; nothing else new ----
const rows = (w, h) => Array.from({ length: h }, () => 'k'.repeat(w));
const sheet = frames => ({ frames, anchors: {}, tiles: {} });
assert.deepEqual(checkSheet('scribe', sheet({ 'up think': rows(32, 34), 'up wonder': rows(32, 34), 'up stretch': rows(32, 34) }), ART.base.scribe), [], 'flat gestures accepted');
assert.deepEqual(checkSheet('scribe39', sheet({ 'N think': rows(32, 34), 'N wonder': rows(32, 34), 'N stretch': rows(32, 34) }), ART.base.scribe39), [], '2.5D gestures accepted');
assert.deepEqual(checkSheet('pelion/scribe', sheet({ 'up think': rows(32, 34) }), ART.base.scribe), [], 'a family named with its folder');
assert.match(checkSheet('scribe', sheet({ 'up think': rows(30, 34) }), ART.base.scribe).join(), /'up think' must keep the default's size \(32x34/);
assert.match(checkSheet('scribe', sheet({ 'up yawn': rows(32, 34) }), ART.base.scribe).join(), /'up yawn' is not a frame of the default art/);
assert.match(checkSheet('scribe', sheet({ 'N think': rows(32, 34) }), ART.base.scribe).join(), /'N think' is not a frame/, 'a 2.5D name in the flat sheet');
assert.match(checkSheet('adept', sheet({ 'up think': rows(24, 28) }), ART.base.adept).join(), /'up think' is not a frame/, 'scribes only');
// in a pack's sheet (knownFrames, before checkSheet), a frame this version does not know is left out, not refused
{
  const { sheet: kept, unknown } = knownFrames('w/scribe', sheet({ 'up think': rows(32, 34), 'up yawn': rows(32, 34), 'N think': rows(32, 34) }), ART.base.scribe);
  assert.deepEqual(unknown, ['up yawn', 'N think']);
  assert.deepEqual(Object.keys(kept.frames), ['up think']);
  assert.deepEqual(checkSheet('w/scribe', kept, ART.base.scribe), []);
  assert.deepEqual(knownFrames('adept', sheet({ 'up think': rows(24, 28) }), ART.base.adept).unknown, ['up think'], 'scribes only');
}

// a gesture in a sheet without its own seated frame loads but never plays: a warning (tools/theme_pack.mjs check)
assert.deepEqual(gestureWarnings('w/scribe', ['up 0', 'up think']), []);
assert.deepEqual(gestureWarnings('w/scribe', ['down 0']), [], 'no gesture: nothing to say');
assert.match(gestureWarnings('w/scribe', ['up think', 'up stretch']).join(), /'up think', 'up stretch' never played: this sheet has no 'up 0'/);
assert.match(gestureWarnings('w/scribe39', ['N wonder']).join(), /'N wonder' never played: this sheet has no 'N 0'/);
assert.deepEqual(gestureWarnings('w/adept', ['up think']), [], 'scribes only');
assert.deepEqual(gestureWarnings('w/scribe', null), [], 'untrusted: never throws');

// ---- wiring: the gesture frame replaces up 0 / N 0 only at the desk and only when drawn ----
const think = rows(32, 34), stretch = rows(32, 34).map(r => r.replace(/^k/, 'r'));
const scribe = (s, more) => ({ id: 'sess-1', x: 100, y: 100, path: [], pose: 'desk', t: 0, dir: 'up', s: { status: 'busy', context: { model: 'opus' }, ...s }, ...more });
const thinkAt = (() => { for (let t = 0; t < 30; t += 0.05) if (at({ busy: true }, t) === 'think') return t; })(), calmAt = (() => { for (let t = 0; t < 30; t += 0.05) if (at({ busy: true }, t) === null) return t; })();
SCRIBE.gesture = {}; // the world draws none: nothing changes
assert.equal(bodyOf(scribe({}, { t: thinkAt })).map, SCRIBE.up[0]);
assert.equal(bodyOf(scribe({}, { t: thinkAt })).gesture, null);
SCRIBE.gesture = { think, stretch };
assert.equal(bodyOf(scribe({}, { t: thinkAt })).map, think, 'busy at the desk: think');
assert.equal(bodyOf(scribe({}, { t: thinkAt })).gesture, 'think');
assert.equal(bodyOf(scribe({}, { t: calmAt })).map, SCRIBE.up[0], 'between thinks: seated');
assert.equal(bodyOf(scribe({}, { t: thinkAt, pose: 'cog' })).map, SCRIBE.up[0], 'at the cogitator: no gesture');
assert.equal(bodyOf(scribe({}, { t: thinkAt, pose: 'walk', dir: 'up' })).gesture, null, 'walking: no gesture');
assert.equal(bodyOf(scribe({ question: 'which?', status: 'idle' }, { t: thinkAt })).gesture, null, 'no wonder frame: no wonder');
assert.equal(gestureNow({ ...scribe({}, { t: thinkAt }), h: { kind: 'plan' } }, () => true), null, 'an adept never');
if (SCRIBE39.E) {
  SCRIBE39.gesture = { think };
  assert.equal(bodyOf39(scribe({}, { t: thinkAt })).map, think, '2.5D: think replaces N 0');
  assert.equal(bodyOf39(scribe({}, { t: calmAt })).map, SCRIBE39.N[0]);
  SCRIBE39.gesture = {};
  assert.equal(bodyOf39(scribe({}, { t: thinkAt })).map, SCRIBE39.N[0], '2.5D: no frame, no gesture');
}

// ---- the stretch: only when a turn ends (busy -> idle), never on a pose change; the puzzled wonder: once per tool error ----
// Actors built the real way: Cast.sync over a laid-out hall, created walking in at the gate, walked by Cast.update.
SCRIBE.gesture = { think, stretch, wonder: think };
const depts = [{ name: 'D', color: '#fff', ids: ['s-0', 's-1', 's-2', 's-3'] }];
const P = planLayout(null, depts, 0, {}, SCENE, layoutDepartments), H = hallOf(P.bays);
const sess = (id, status, extra) => ({ id, dept: 'D', status, sinceMs: Date.now(), context: null, ...extra });
const make = () => new Cast();
const sync = (c, roster) => c.sync(roster, P.seats, () => '#fff', P.consoleSeats, P.blocks, H);
const run = (c, s) => { for (let k = 0; k < s * 10; k++) c.update(0.1); };
const seated = (c, id) => c.actors.get(id).pose === 'desk';
const gest = (c, id) => bodyOf(c.actors.get(id)).gesture;
const stretches = (c, id, s = 3) => { let n = 0, was = false; for (let k = 0; k < s * 10; k++) { c.update(0.1); const g = gest(c, id) === 'stretch'; if (g && !was) n++; was = g; } return n; };

// first seen idle: walks in, sits, dozes, never stretches; nor does anyone else at app start
let c = make();
sync(c, [sess('s-0', 'idle'), sess('s-1', 'idle'), sess('s-2', 'busy')]);
assert.equal(c.actors.get('s-0').pose, 'walk', 'created walking at the gate');
let n = 0; for (let k = 0; k < 300; k++) { c.update(0.1); if (gest(c, 's-0') === 'stretch' || gest(c, 's-1') === 'stretch') n++; }
assert.ok(seated(c, 's-0') && seated(c, 's-1') && c.actors.get('s-0').dozing, 'arrived and dozing');
assert.equal(n, 0, 'first seen idle: no stretch on arriving');
// a turn ends at the desk: one stretch, as it dozes off, then the Zs
sync(c, [sess('s-0', 'idle'), sess('s-1', 'idle'), sess('s-2', 'idle')]);
assert.equal(stretches(c, 's-2', 4), 1, 'busy -> idle at the desk: stretches once');
assert.equal(gest(c, 's-2'), null, `after ${STRETCH_S} s: the Zs`);
assert.equal(bodyOf(c.actors.get('s-2')).map, SCRIBE.up[0]);
assert.equal(stretches(c, 's-0', 4) + stretches(c, 's-1', 1), 0, 'the others did not');
// the finished-turn scroll first, then the stretch
sync(c, [sess('s-0', 'idle'), sess('s-1', 'idle'), sess('s-2', 'busy')]); run(c, 1);
c.actors.get('s-2').fx = [{ kind: 'task-done', t: 0 }];
sync(c, [sess('s-0', 'idle'), sess('s-1', 'idle'), sess('s-2', 'idle')]);
c.update(0.1); assert.equal(gest(c, 's-2'), null, 'scroll held up: no gesture');
assert.equal(stretches(c, 's-2', 4), 1, 'then the stretch, once');
// settle (the column's entry) and resetCast (a new Cast, every actor first seen again): nobody stretches, no unison
const before = c.actors.get('s-0');
c.settle(); run(c, 0.1);
assert.equal(['s-0', 's-1', 's-2'].reduce((k, id) => k + stretches(c, id, 3), 0), 0, 'settle: nobody stretches');
assert.ok(before === c.actors.get('s-0'));
c = make(); // resetCast: the actors cleared, then synced afresh
sync(c, [sess('s-0', 'idle'), sess('s-1', 'idle'), sess('s-2', 'idle')]); c.settle(); run(c, 0.1);
assert.equal(['s-0', 's-1', 's-2'].reduce((k, id) => k + stretches(c, id, 3), 0), 0, 'resetCast + settle: nobody stretches');
// a pose change alone (a reflow re-routing it, a walk away and back while idle): no stretch
const a0 = c.actors.get('s-0');
Object.assign(a0, { destKey: '' }); a0.x += 30; sync(c, [sess('s-0', 'idle'), sess('s-1', 'idle'), sess('s-2', 'idle')]);
assert.equal(a0.pose, 'walk', 'moved: walks back to its desk');
assert.equal(stretches(c, 's-0', 10), 0, 'idle when it started walking: no stretch on sitting');
assert.ok(seated(c, 's-0'));
// the turn ends while it walks back from the cogitator: it stretches once, as it sits
sync(c, [sess('s-0', 'shell'), sess('s-1', 'idle'), sess('s-2', 'idle')]); run(c, 10);
assert.equal(c.actors.get('s-0').pose, 'cog', 'at the cogitator');
c.actors.get('s-0').lastShell = 0;
sync(c, [sess('s-0', 'idle'), sess('s-1', 'idle'), sess('s-2', 'idle')]);
assert.equal(c.actors.get('s-0').pose, 'walk', 'walking back, its turn over');
assert.equal(stretches(c, 's-0', 12), 1, 'stretches once when it sits');
// a turn that starts again before it sits calls the stretch off
sync(c, [sess('s-0', 'busy'), sess('s-1', 'idle'), sess('s-2', 'idle')]); run(c, 1);
sync(c, [sess('s-0', 'idle'), sess('s-1', 'idle'), sess('s-2', 'idle')]);
sync(c, [sess('s-0', 'busy'), sess('s-1', 'idle'), sess('s-2', 'idle')]);
sync(c, [sess('s-0', 'idle', { background: true }), sess('s-1', 'idle'), sess('s-2', 'idle')]);
assert.equal(c.actors.get('s-0').turnEnded, true);
sync(c, [sess('s-0', 'busy'), sess('s-1', 'idle'), sess('s-2', 'idle')]);
assert.equal(c.actors.get('s-0').turnEnded, false, 'busy again: no stretch pending');

// the puzzled wonder: once per tool error at the desk, PUZZLE_LAG_S after the sparks, for WONDER.for s
c = make();
sync(c, [sess('s-0', 'busy'), sess('s-1', 'busy')]); run(c, 30);
assert.ok(seated(c, 's-0') && seated(c, 's-1'));
const wonders = (id, s) => { let w = 0, was = false, first = null; for (let k = 0; k < s * 10; k++) { c.update(0.1); const g = gest(c, id) === 'wonder'; if (g && !was) { w++; first ??= k / 10; } was = g; } return { w, first }; };
assert.equal(wonders('s-0', 20).w, 0, 'busy, no error: no wonder (think only)');
assert.ok(c.chronicle({ kind: 'tool-error', sessionId: 's-0', ts: Date.now() }));
assert.equal(c.actors.get('s-0').fx.at(-1).kind, 'tool-error', 'the error effect itself still plays');
assert.equal(gest(c, 's-0') === 'wonder', false, 'the sparks first');
const w0 = wonders('s-0', 4);
assert.equal(w0.w, 1, 'one wonder per error');
assert.ok(w0.first >= PUZZLE_LAG_S - 0.15 && w0.first <= PUZZLE_LAG_S + 0.15, `after ${PUZZLE_LAG_S} s (${w0.first})`);
assert.equal(wonders('s-1', 4).w, 0, 'only the scribe that erred');
assert.equal(wonders('s-0', 20).w, 0, 'and only once');
sync(c, [sess('s-0', 'shell'), sess('s-1', 'busy')]); run(c, 10);
assert.equal(c.actors.get('s-0').pose, 'cog');
c.chronicle({ kind: 'tool-error', sessionId: 's-0', ts: Date.now() });
assert.equal(c.actors.get('s-0').puzzleAt < c.actors.get('s-0').t - 5, true, 'away from its desk: no wonder');
SCRIBE.gesture = {};
console.log('gestures ok');
