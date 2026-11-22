import assert from 'node:assert/strict';
import { order, depthSort } from './iso.js';
import { hallOf, MAX_W, WALL, layoutDepartments, mainSpots } from './layout.js';
import { LAMP_SIZE, MAIN_SIZE } from './cilamp.js';
import { setView, sceneSize, toScreen, toFloor } from './view.js';
import { Cast, face39, pipeOf } from './actors.js';
import { use, pin, placeOf, lampFoot, actorFoot, actorAt39, frontShift, sitLevel, spriteOf, feetOf, actorShadow, gateFeet } from './scene39.js';
import { setTheme } from './theme.js';
import { beginFrame, stepGate, stepAlarm, sceneBusy, deskFill, reactionLights, KIND, flameOf, doorFrame } from './scene.js';
import { SCRIBE, SCRIBE39 } from './sprites.js';
import { loadAllArt } from './sprites.js';
await loadAllArt(); // sprites.js loads the active theme's art only: these tests visit every world

// facing from movement: E = +x, W = -x, S = +y, N = -y (floor space), from Cast.update's walk direction
const cast = new Cast();
for (const [dx, dy, want] of [[30, 0, 'E'], [-30, 0, 'W'], [0, 30, 'S'], [0, -30, 'N'], [30, 5, 'E'], [-4, -30, 'N']]) {
  const a = { id: want, x: 100, y: 150, path: [{ x: 100 + dx, y: 150 + dy }], dir: 'up', t: 0, pose: 'walk', target: null };
  cast.actors.set(a.id, a);
  cast.update(0.05);
  assert.equal(face39(a.dir), want, `walking (${dx}, ${dy})`);
  cast.actors.delete(a.id);
}

setView('39');
for (const hall of [hallOf(0), hallOf(2, { w: MAX_W, h: 420 })]) {
  sceneSize(hall); use(hall);
  const tag = `${hall.w}x${hall.h}`;
  // the depth sort: a scribe seated south of a desk (layout.js: seat = desk + (11, 30)) is drawn after it; one standing
  // north of a desk (the row below's desk, 64 px down) before it; the same for a lectern and a console
  const desk = { x: 40, y: 90 };
  for (const kind of ['desk', 'lectern', 'console']) {
    const foot = placeOf(kind, desk).foot, seat = { x: desk.x + 11, y: desk.y + 30 }, north = { x: desk.x + 11, y: desk.y - 4 };
    assert.ok(order(foot, actorFoot(seat)) < 0 && order(actorFoot(seat), foot) > 0, `${tag}: ${kind} before the scribe south of it`);
    assert.ok(order(actorFoot(north), foot) < 0 && order(foot, actorFoot(north)) > 0, `${tag}: the scribe north of a ${kind} before it`);
  }
  // ...and over a whole crowded hall (iso.js order alone is not transitive: a plain sort scrambles it), in any input
  // order: every desk before the scribe seated at it, every console before its adept, and nothing in front of a desk
  // (a scribe north of it) drawn after it
  const depts = ['A', 'B', 'C', 'D', 'E'].map((name, k) => ({ name, ids: Array.from({ length: 6 }, (_, i) => `${name}${i}`), helpers: k % 2 ? ['h1', 'h2', 'h3'].map(h => name + h) : [] }));
  const L = layoutDepartments(depts, hall.w < 400 ? { compact: true, bays: 2 } : { bays: 2, size: { w: hall.w, h: hall.h } }); // footprints only: any hall
  assert.ok(L.seats.size >= 18, `${tag}: a crowded hall`);
  const items = [...L.desks.map(d => ({ k: `d:${d.id}`, foot: placeOf(d.compact ? 'lectern' : 'desk', d).foot })), ...L.consoles.map(c => ({ k: `c:${c.id}`, foot: placeOf('console', c).foot })),
    ...L.desks.map(d => ({ k: `p:${d.id}`, foot: actorFoot({ x: d.x + (d.compact ? 20 : 30), y: d.y + 8 }) })), // right behind its back, at its east end
    ...[...L.seats].map(([id, s]) => ({ k: `a:${id}`, foot: actorFoot(s) })), ...[...L.consoleSeats].map(([id, s]) => ({ k: `a:${id}`, foot: actorFoot(s) }))];
  const perm = x => x.map((it, i) => [(i * 7919) % 104729, it]).sort((p, q) => p[0] - q[0]).map(([, it]) => it); // a fixed scramble by index
  for (const shuffle of [x => x, x => x.reverse(), perm]) {
    const at = new Map(depthSort(shuffle(items.slice())).map((it, i) => [it.k, i]));
    for (const [id] of L.seats) assert.ok(at.get(`d:${id}`) < at.get(`a:${id}`), `${tag}: desk ${id} before its scribe`);
    for (const [id] of L.seats) assert.ok(at.get(`p:${id}`) < at.get(`d:${id}`), `${tag}: the scribe behind desk ${id} before it`);
    for (const [id] of L.consoleSeats) assert.ok(at.get(`c:${id}`) < at.get(`a:${id}`), `${tag}: console ${id} before its adept`);
  }
  // a main CI lamp (layout.js mainSpots: the east end, consoles no obstacle) behind the consoles of its first row that
  // stand over it, and behind the desk it may stand behind, in any input order; a scribe lamp keeps its own foot
  for (const compact of [false, true]) for (const h of [1, 2, 3, 4]) {
    const F = layoutDepartments([{ name: 'A', ids: ['a0', 'a1'], helpers: Array.from({ length: h }, (_, i) => `h${i}`) }], { compact, size: { w: hall.w, h: 600 } });
    const [s] = mainSpots(F.blocks, hall, F.desks), lamp = { k: 'lamp', foot: lampFoot({ ...s, size: MAIN_SIZE, frame: 'CIMAIN.red' }) };
    const near = it => it.foot.u0 < lamp.foot.u1 && lamp.foot.u0 < it.foot.u1 && it.foot.v0 < lamp.foot.v1 + 6 && lamp.foot.v0 < it.foot.v1;
    const others = [...F.consoles.map(c => ({ k: `c:${c.id}`, foot: placeOf('console', c).foot })), ...F.desks.map(d => ({ k: `d:${d.id}`, foot: placeOf(compact ? 'lectern' : 'desk', d).foot }))];
    const over = others.filter(near);
    if (compact && h >= 2) assert.ok(over.some(it => it.k.startsWith('c:')), `${tag}: compact, ${h} adepts: a console stands over the main lamp (the case is exercised)`);
    for (const shuffle of [x => x, x => x.reverse()]) {
      const at = new Map(depthSort(shuffle([lamp, ...others])).map((it, i) => [it.k, i]));
      for (const it of over) assert.ok(at.get('lamp') < at.get(it.k), `${tag}: ${compact ? 'compact' : 'normal'}, ${h} adepts: the main lamp behind ${it.k}`);
    }
  }
  assert.deepEqual(lampFoot({ x: 10, y: WALL + 20, size: LAMP_SIZE, frame: 'CILAMP.red' }), { u0: 17, u1: 23, v0: 38, v1: 40 }, 'a scribe lamp: its foot');
  // toFloor(toScreen(p)) round-trips within 1 logical px over the whole floor; pin (the drawing's) within 1 px of toScreen
  for (let x = 0; x <= hall.w; x += 7) for (let y = WALL; y <= hall.h; y += 5) {
    const [fx, fy] = toFloor(...toScreen(x, y));
    assert.ok(Math.abs(fx - x) <= 1 && Math.abs(fy - y) <= 1, `${tag}: (${x}, ${y}) -> (${fx}, ${fy})`);
    const [px, py] = pin(x, y), [sx, sy] = toScreen(x, y);
    assert.ok(Math.abs(px - sx) <= 1 && Math.abs(py - sy) <= 1, `${tag}: pin (${x}, ${y})`);
  }
  // a click on an actor's projected head picks it (the frontmost when two overlap); empty floor picks nobody
  const scribe = (id, x, y) => ({ id, x, y, pose: 'desk', dir: 'up', t: 0, wait: 0, path: [], s: { status: 'busy', context: { model: 'claude-opus-5-5' } }, sash: '#ff0000' });
  const a = scribe('a', 60, 150), b = scribe('b', 120, 150), c = scribe('c', 61, 152);
  const head = s => { const [x, y] = pin(s.x, s.y); return [x, y - 15]; };
  assert.equal(actorAt39(...head(a), [a, b])?.id, 'a', `${tag}: a's head`);
  assert.equal(actorAt39(...head(b), [a, b])?.id, 'b', `${tag}: b's head`);
  assert.equal(actorAt39(...head(c), [a, b, c])?.id, 'c', `${tag}: the frontmost of two`);
  const [ex, ey] = pin(90, 200);
  assert.equal(actorAt39(ex, ey, [a, b]), null, `${tag}: empty floor`);
  // a click on the shadow (no sprite pixel there) picks by the feet; actors come as app.js passes them, an iterator
  const [fx, fy] = pin(...feetOf(a, spriteOf(a)));
  assert.equal(actorAt39(fx, fy + 1.5, new Map([['a', a], ['b', b]]).values())?.id, 'a', `${tag}: a's shadow, from an iterator`);
  assert.equal(actorAt39(...pin(a.x, a.y + 1), [{ ...a, leaving: true }]), null, `${tag}: a leaving actor is not picked`);
}
// seated 39° scribes, every world: drawn just south of the desk's front (frontShift), never into it, the contact
// shadow under the drawn feet (the floor point the body stands on), not the seat
{
  const hall = hallOf(0); sceneSize(hall);
  for (const id of ['tier2', 'cyber', 'orbital', 'tower', 'vault', 'darwin']) {
    setTheme(id); use(hall);
    for (const kind of ['desk', 'lectern']) {
      const desk = { x: 40, y: 90, compact: kind === 'lectern' }, p = placeOf(kind, desk), a = { id: 's', x: desk.x + 11, y: desk.y + 30 }, s = frontShift(p, a);
      const r = spriteOf({ ...a, pose: 'desk', dir: 'up', t: 0, wait: 0, path: [], s: { status: 'busy', context: null }, sash: '#ff0000' }, s);
      const e = actorShadow(a, r), [fx, fy] = feetOf(a, r);
      assert.ok(fy - p.yb > 0 && fy - p.yb <= 2, `${id} ${kind}: feet at ${fy}, just south of the front ${p.yb}`);
      // cx: the frame's foot span (its bottom rows), a px or two off the feet anchor; cy: exactly the feet's floor line
      assert.ok(Math.abs(e.cy - fy) <= 0.5 && Math.abs(e.cx - fx) <= 3, `${id} ${kind}: shadow at (${e.cx}, ${e.cy}) under the feet (${fx}, ${fy})`);
    }
  }
  setTheme('tier2');
}
// adepts at a 2x2 console group (layout.js): drawn at their own console's front, never against the back of the console
// south of it (the upper row's seat is 3 px from it), compact and normal grids
{
  const hall = hallOf(0); sceneSize(hall); use(hall);
  for (const compact of [false, true]) {
    const L = layoutDepartments([{ name: 'T', ids: ['s1'], helpers: ['a', 'b', 'c', 'd'] }], { compact });
    const place = new Map(L.consoles.map(c => [c.id, placeOf('console', c)]));
    for (const c of L.consoles) {
      const p = place.get(c.id), a = { id: c.id, ...L.consoleSeats.get(c.id) }, fy = a.y - frontShift(p, a);
      assert.ok(fy > p.yb && fy - p.yb <= 2, `${c.id}: feet at ${fy}, just south of its console's front ${p.yb}`);
      for (const [id, q] of place) if (id !== c.id && q.yb > p.yb && Math.abs(q.foot.u0 - p.foot.u0) < 4) // the console south of it
        assert.ok(2 * (q.yb - WALL) - q.k.d - 2 * (fy - WALL) >= 8, `${c.id}: clear of console ${id}'s back`);
    }
  }
}
// sitting down and standing up ease the same way (SIT_MS = 300): halfway at 150 ms both ways, a turn mid-ease goes
// on from where it is (no jump), and it settles at 0 / 1
{
  const e = { k: 0, t: 0, down: true };
  assert.equal(sitLevel(e, true, 150), 0.5, 'halfway down');
  assert.equal(sitLevel(e, true, 1000), 1, 'seated');
  assert.equal(sitLevel(e, false, 1000), 1, 'gets up from fully seated');
  assert.equal(sitLevel(e, false, 1150), 0.5, 'halfway up: no snap to standing');
  assert.equal(sitLevel(e, true, 1150), 0.5, 'sits back down mid-rise: from where it is');
  assert.equal(sitLevel(e, true, 1225), 0.75);
  assert.equal(sitLevel(e, false, 1225), 0.75);
  assert.equal(sitLevel(e, false, 1450), 0, 'standing after 225 ms more');
}
// the per-frame state both views share (scene.js): one gate, one alarm skull, one desk-pile fade, the same lights
{
  const hall = hallOf(0);
  beginFrame({ hall, desks: [] }, 1000);
  const near = [{ x: hall.entry.x, y: hall.entry.y - 4 }];
  assert.ok(stepGate(near, 0.1) > 0 && sceneBusy(), 'the gate opens for someone at it, and the app keeps its frame rate');
  for (let i = 0; i < 100; i++) stepGate([], 0.25);
  assert.equal(stepGate([], 0.25), 0, 'and closes behind them');
  const al = stepAlarm([], 2000);
  assert.ok(!al.on && !al.hover && al.lights.length === 1 && al.who === null, 'no stale petition: the skull on its perch, its eye the only light');
  const d = { key: 'k', id: 'x' }, fill = deskFill(d, { s: { context: { tokens: 1 } } }, () => 0.4);
  assert.equal(fill, 0.4);
  assert.ok(Math.abs(deskFill({ key: 'k', id: null, freeSince: Date.now() - 2000 }, undefined, () => 1) - 0.2) < 0.01, 'an emptied desk fades from its last fill');
  const at = { x: 10, y: 100 }, AT = KIND.desk.at;
  assert.deepEqual(reactionLights({ lamp: { ok: true, t: 0 } }, at, AT, 0).map(l => l.r), [16], 'a passed test lamp lights');
}
// the gate: its back (void, leaves) always before its frame, in either input order, in every world; an actor on the
// step at the entry after the frame, one north of the gate before both
for (const id of ['tier2', 'cyber', 'orbital', 'tower', 'vault']) {
  setTheme(id);
  const hall = hallOf(0), { back, frame } = gateFeet(hall), at = { x: hall.entry.x, y: hall.entry.y }, north = { x: hall.entry.x, y: hall.h - 22 };
  assert.ok(back.v1 <= frame.v0, `${id}: the gate's back wholly behind its frame (a constraint, not a centre tie)`);
  for (const list of [[{ k: 'f', foot: frame }, { k: 'b', foot: back }], [{ k: 'b', foot: back }, { k: 'f', foot: frame }]]) {
    const ks = depthSort([...list, { k: 'e', foot: actorFoot(at) }, { k: 'n', foot: actorFoot(north) }]).map(i => i.k).join('');
    assert.equal(ks, 'nbfe', `${id}: gate order ${ks}`);
  }
}
setTheme('tier2');
console.log('scene39 ok');

// the flames lick (fire.json *_FIRE_n frames) in the base art, out of phase per prop; a world with its own fire keeps it still
const licks = (name, x) => new Set(Array.from({ length: 24 }, (_, i) => flameOf(name, x, i / 6)));
setTheme('tier2');
assert.equal(licks('BRAZIER', 72).size, 3, 'a brazier: its still flame and two licking frames');
assert.equal(licks('CANDLES', 100).size, 3, 'candles: the same');
assert.notDeepEqual([...Array(8)].map((_, i) => flameOf('BRAZIER', 72, i / 6)), [...Array(8)].map((_, i) => flameOf('BRAZIER', 118, i / 6)), 'the two gate braziers out of phase');
assert.deepEqual([...licks('DESK', 72)], [null], 'only fire licks');
for (const id of ['cyber', 'orbital', 'tower', 'vault']) { setTheme(id); assert.deepEqual([...licks('BRAZIER', 72)], [null], `${id}: its own brazier keeps a still flame`); }
setTheme('tier2');

// a door passes through its half frame for a moment as it opens or closes (at rest on first sight); a world's own doors jump
const swing = (key, kind) => [[false, 0], [true, 1000], [true, 1100], [true, 1200], [false, 2000], [false, 2200]].map(([o, t]) => doorFrame(key, kind, o, t));
for (const kind of ['sanctum', 'refectory']) assert.deepEqual(swing(`t ${kind}`, kind), ['closed', 'half', 'half', 'open', 'half', 'closed'].map(s => `door ${kind} ${s}`), kind);
for (const id of ['cyber', 'orbital', 'tower', 'vault']) { setTheme(id); assert.ok(!swing(`t ${id}`, 'sanctum').some(n => n.endsWith('half')), `${id}: its own doors jump`); }
setTheme('tier2');

// Arcane Tower only: wizards and the Archmage smoke a pipe while idle or waiting, never apprentices, never while working;
// a pipe in every facing, the back included
const sc = (model, status) => ({ s: { status, context: { model } } }), SONNET = 'claude-sonnet-5', OPUS = 'claude-opus-5-5', HAIKU = 'claude-haiku-4-5';
setTheme('tower');
for (const face of ['down', 'up', 'right', 'left', 'S', 'N', 'E', 'W']) {
  assert.ok(pipeOf(sc(SONNET, 'idle'), face)?.bowl, `wizard idle, ${face}: a pipe`);
  assert.ok(pipeOf(sc(OPUS, 'waiting'), face)?.bowl, `archmage waiting, ${face}: a pipe`);
}
// the bowl stands clear of the drawn figure in every facing (past the hat brim); from the back the stem too stays
// outside the head, poking out to its left
const clear = (map, [i, j, w, h]) => { for (let y = j; y < j + h; y++) for (let x = i; x < i + w; x++) if ((map[y]?.[x] ?? '.') !== '.') return false; return true; };
for (const [face, map] of [...['down', 'up', 'left', 'right'].map(f => [f, SCRIBE[f][0]]), ...['S', 'N', 'W', 'E'].map(f => [f, SCRIBE39[f][0]])]) {
  const P = pipeOf(sc(SONNET, 'idle'), face);
  assert.ok(clear(map, P.bowl), `${face}: the bowl past the silhouette`);
  if (face === 'up' || face === 'N') assert.ok(clear(map, P.stem) && P.bowl[0] < P.stem[0], `${face}: from behind, the stem pokes out left of the head`);
}
assert.equal(pipeOf(sc(HAIKU, 'idle'), 'down'), null, 'an apprentice never smokes');
for (const status of ['busy', 'shell']) assert.equal(pipeOf(sc(OPUS, status), 'down'), null, `${status}: no pipe`);
assert.equal(pipeOf({ ...sc(SONNET, 'idle'), h: { kind: 'Explore' } }, 'down'), null, 'an adept never smokes');
assert.equal(pipeOf({ watch: true }, 'down'), null, 'nor the Watchman');
for (const id of ['tier2', 'cyber', 'orbital', 'vault']) { setTheme(id); assert.equal(pipeOf(sc(SONNET, 'idle'), 'down'), null, `${id}: no pipe`); }
setTheme('tier2');

// The CI lamps (cilamp.js) over the hall, flat and 39°: the department's main lamp (CIMAIN) for each department with an
// entry in the list, at its spot (layout.js mainSpots), its frame the state's (the blink follows the clock); a scribe
// lamp (CILAMP) beside each desk whose session has a CI of its own (layout.roster's Session.ci, layout.js scribeSpots);
// nothing with neither. Recording canvas: node has none; every drawImage is kept with the sprite canvas it drew.
{
  const { setLamps, frameOf, LENS } = await import('./cilamp.js'), { mainSpots, scribeSpots } = await import('./layout.js'), { MAPS, sprite, half } = await import('./sprites.js');
  const { drawScene } = await import('./scene.js');
  const { drawScene39 } = await import('./scene39.js');
  const calls = [];
  const fakeG = () => new Proxy({ globalAlpha: 1, measureText: t => ({ width: 6 * String(t).length }) }, {
    get: (t, k) => (k in t ? t[k] : (...a) => { if (k === 'drawImage') calls.push(a); return k.startsWith('create') ? { addColorStop() {}, data: new Uint8ClampedArray(4096 * 4) } : undefined; }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const had = globalThis.document;
  globalThis.document = { createElement: () => { const g = fakeG(), cv = { width: 0, height: 0, getContext: () => g }; return cv; } };
  const FRAMES = fam => ['off', 'amber', 'amber_dim', 'green', 'red'].map(n => `${fam}.${n}`);
  try {
    setTheme('tier2');
    const hall = hallOf(0), depts = ['a', 'b', 'c'].map((name, i) => ({ name, color: '#336699', ids: [`${name}-0`] }));
    const L = layoutDepartments(depts, { size: { w: hall.w, h: hall.h } });
    const layout = { hall, blocks: L.blocks, desks: L.desks, consoles: [], computers: new Map(), level: { dark: 0.18 }, anchors: null, roster: [] };
    const spots = mainSpots(L.blocks, hall, L.desks), desksAt = scribeSpots(L.desks, hall);
    let lastLights = [];
    const draw = (f, now) => { calls.length = 0; lastLights = f(fakeG(), layout, new Map(), () => 0, now); return calls.slice(); };
    const GLOW = ['rgba(240,168,60,.6)', 'rgba(240,168,60,.3)', 'rgba(61,220,108,.55)', 'rgba(255,58,32,.6)'], glows = () => lastLights.filter(l => GLOW.includes(l.color));
    const lampsIn = (cs, frame) => cs.filter(a => a[0] === sprite(MAPS[frame], LENS[frame]));
    const count = (cs, frames) => frames.reduce((n, fr) => n + lampsIn(cs, fr).length, 0);
    for (const [tag, f] of [['flat', drawScene], ['39°', drawScene39]]) {
      setView(tag === 'flat' ? 'flat' : '39'); sceneSize(hall); use(hall);
      setLamps([]); layout.roster = [];
      let cs = draw(f, 0);
      assert.equal(count(cs, FRAMES('CIMAIN').concat(FRAMES('CILAMP'))), 0, `${tag}: no list, no CI in the roster: no lamp`);
      assert.equal(glows().length, 0, `${tag}: no list, no glow`);
      setLamps([{ dept: 'a', state: 'pass' }, { dept: 'b', state: 'running' }, { dept: 'c', state: 'error' }]);
      cs = draw(f, 0);
      assert.deepEqual(glows().map(l => l.color).sort(), ['rgba(240,168,60,.6)', 'rgba(61,220,108,.55)'], `${tag}: the lit lenses glow (an unlit one does not)`);
      assert.ok(glows().every(l => l.r === 16 && l.x > 0 && l.y > 0), `${tag}: the main lamp's glow`);
      assert.deepEqual(['CIMAIN.green', 'CIMAIN.amber', 'CIMAIN.off'].map(n => lampsIn(cs, n).length), [1, 1, 1], `${tag}: a main lamp each, by its state`);
      assert.equal(lampsIn(cs, 'CIMAIN.amber_dim').length + lampsIn(cs, 'CIMAIN.red').length, 0, `${tag}: none in a state nobody is in`);
      assert.equal(count(cs, FRAMES('CILAMP')), 0, `${tag}: no session with a CI: no scribe lamp`);
      assert.equal(lampsIn(draw(f, 600), frameOf('running', 600, 'CIMAIN')).length, 1, `${tag}: running blinks with the clock`);
      assert.equal(lampsIn(draw(f, 600), 'CIMAIN.amber').length, 0);
      // a lamp list and a roster CI: both kinds, each by its own state
      setLamps([{ dept: 'a', state: 'fail' }]);
      layout.roster = [{ id: 'b-0', dept: 'b', ci: { state: 'pass' } }, { id: 'c-0', dept: 'c', ci: { state: 'none' } }, { id: 'zz', dept: 'c', ci: { state: 'fail' } }];
      cs = draw(f, 0);
      assert.deepEqual([lampsIn(cs, 'CIMAIN.red').length, lampsIn(cs, 'CILAMP.green').length], [1, 1], `${tag}: the main lamp and the scribe lamp`);
      assert.equal(count(cs, FRAMES('CIMAIN')), 1, `${tag}: only a department with an entry has a main lamp`);
      assert.equal(count(cs, FRAMES('CILAMP')), 1, `${tag}: only a seated session with a CI has a scribe lamp`);
      assert.ok(glows().some(l => l.r === 12) && glows().some(l => l.r === 16), `${tag}: both glow`);
      if (tag === 'flat') { // the flat frames sit at their spots' feet, centred, each at its own size
        const a = spots.find(s => s.dept === 'a'), [x, y] = lampsIn(cs, 'CIMAIN.red')[0].slice(1, 3);
        assert.deepEqual([x, y], [half(a.x - 3.5), a.y - 14], 'flat: the main lamp at the department\'s spot');
        const d = desksAt.find(s => s.id === 'b-0'), [sx, sy] = lampsIn(cs, 'CILAMP.green')[0].slice(1, 3);
        assert.deepEqual([sx, sy], [half(d.x - 2.5), d.y - 10], 'flat: the scribe lamp beside its desk');
      }
      layout.roster = [];
    }
    // the desktop strip and column draw through drawScene: a main lamp each on its plaque row, no scribe lamp
    const { layoutStrip, stripOf } = await import('./strip.js'), { layoutColumn, columnOf, COL_W } = await import('./column.js');
    const dd = ['a', 'b'].map(name => ({ name, color: '#336699', ids: [`${name}-0`, `${name}-1`] }));
    const SL = layoutStrip(dd, { size: { w: 1400 } }), CL = layoutColumn(dd, { size: { w: COL_W, h: 420 }, side: 'left' });
    for (const [tag, Hh, B] of [['strip', stripOf(1400), SL], ['column', columnOf({ w: COL_W, h: 420 }, CL.floors, 'left'), CL]]) {
      const lay = { hall: Hh, blocks: B.blocks, desks: B.desks, consoles: [], level: { dark: 0.18 }, roster: [{ id: 'a-0', dept: 'a', ci: { state: 'pass' } }] };
      setLamps([{ dept: 'a', state: 'fail' }, { dept: 'b', state: 'pass' }]);
      const cs = draw(() => drawScene(fakeG(), lay, new Map(), () => 0, 0), 0);
      assert.deepEqual([lampsIn(cs, 'CIMAIN.red').length, lampsIn(cs, 'CIMAIN.green').length], [1, 1], `${tag}: a main lamp each`);
      assert.equal(count(cs, FRAMES('CILAMP')), 0, `${tag}: no scribe lamp`);
      setLamps([]);
      assert.equal(count(draw(() => drawScene(fakeG(), lay, new Map(), () => 0, 0), 0), FRAMES('CIMAIN')), 0, `${tag}: no list, no lamp`);
    }
  } finally { setLamps([]); setView('flat'); if (had) globalThis.document = had; else delete globalThis.document; }
}

// The rooms plan's room computer (scene.js drawComputers, tools/roomcog_art.mjs), flat and 39°: one a room over its first
// spot, its unlit frame and a dim glow while nobody runs code there, its sprite inside its room's cell and clear of
// every block (it is wider than the adepts' console it replaced).
{
  const { setHallPlan } = await import('./hallplan.js'), { zonesOf } = await import('./layout.js'), { MAPS, sprite, RES } = await import('./sprites.js'), { T } = await import('./theme.js');
  const { drawScene, computerAt } = await import('./scene.js'), { drawScene39 } = await import('./scene39.js');
  const calls = [];
  const fakeG = () => new Proxy({ globalAlpha: 1, measureText: t => ({ width: 6 * String(t).length }) }, {
    get: (t, k) => (k in t ? t[k] : (...a) => { if (k === 'drawImage') calls.push(a); return k.startsWith('create') ? { addColorStop() {}, data: new Uint8ClampedArray(4096 * 4) } : undefined; }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const had = globalThis.document;
  globalThis.document = { createElement: () => { const g = fakeG(), cv = { width: 0, height: 0, getContext: () => g }; return cv; } };
  try {
    setTheme('tier2'); setHallPlan('rooms');
    const hall = hallOf(0), depts = ['a', 'b', 'c'].map((name, i) => ({ name, color: '#336699', ids: [`${name}-0`], room: `r${i}` }));
    const L = layoutDepartments(depts, { size: { w: hall.w, h: hall.h } });
    assert.ok(hall.sanct && L.computers.size >= 3, 'rooms plan: a computer a room');
    const layout = { hall, blocks: L.blocks, desks: [], consoles: [], computers: L.computers, level: { dark: 0.18 }, anchors: null };
    const at = [...L.computers.values()].map(spots => computerAt(spots[0])), [w, h] = [MAPS.ROOMCOG[0].length / RES, MAPS.ROOMCOG.length / RES];
    // where it stands: the old console's foot line, centred on the spot; inside its cell, clear of the blocks
    const zones = zonesOf(L.blocks, hall);
    for (const [key, spots] of L.computers) {
      const c = computerAt(spots[0]), Z = zones.find(z => z.id === key);
      assert.deepEqual([c.x + w / 2, c.y + h], [spots[0].x, spots[0].y - 3], `${key}: centred over its first spot, its foot 3 px above it`);
      assert.ok(Z && c.x >= Z.x && c.x + w <= Z.x + Z.w && c.y >= Z.y && c.y + h <= Z.y + Z.h, `${key}: inside its room's cell`);
      for (const b of L.blocks) assert.ok(c.x + w <= b.x || c.x >= b.x + b.w || c.y + h <= b.y || c.y >= b.y + b.h, `${key}: clear of ${b.name}`);
    }
    let lights = [];
    const draw = f => { calls.length = 0; lights = f(fakeG(), layout, new Map(), () => 0, 0); return calls.slice(); };
    const glowAt = c => lights.filter(l => l.color === T.light.green && l.r === 5 && l.x === c.x + 8 && l.y === c.y + 6);
    for (const [tag, f] of [['flat', drawScene], ['39°', drawScene39]]) {
      setView(tag === 'flat' ? 'flat' : '39'); sceneSize(hall); use(hall);
      const cs = draw(f);
      assert.ok(at.every(c => glowAt(c).length === 1), `${tag}: each room computer glows dimly, unlit`);
      if (tag === 'flat') {
        const offs = cs.filter(a => a[0] === sprite(MAPS['ROOMCOG.off']));
        assert.deepEqual(offs.map(a => a.slice(1, 3)).sort(), at.map(c => [c.x, c.y]).sort(), 'flat: each room draws its unlit computer at its place');
        assert.equal(cs.filter(a => a[0] === sprite(MAPS.ROOMCOG) || a[0] === sprite(MAPS.CONSOLE)).length, 0, 'flat: no lit computer, no adepts\' console');
      }
    }
    // someone running code at a room's first spot lights that room's computer only (the lit frame, the bright glow)
    const [first] = L.computers.values(), lit = computerAt(first[0]);
    const shell = { id: 'sh', x: first[0].x, y: first[0].y, pose: 'cog', s: { status: 'shell' } }, actors = new Map([[shell.id, shell]]);
    const drawLit = f => { calls.length = 0; lights = f(fakeG(), layout, actors, () => 0, 0); return calls.slice(); };
    const bright = c => lights.filter(l => l.color === T.light.green && l.r === 10 && l.x === c.x + 8 && l.y === c.y + 6);
    for (const [tag, f] of [['flat', drawScene], ['39°', drawScene39]]) {
      setView(tag === 'flat' ? 'flat' : '39'); sceneSize(hall); use(hall);
      const cs = drawLit(f);
      assert.equal(bright(lit).length, 1, `${tag}: the busy room's computer glows`);
      assert.ok(at.filter(c => c.y !== lit.y || c.x !== lit.x).every(c => glowAt(c).length === 1 && !bright(c).length), `${tag}: the other rooms stay unlit`);
      if (tag === 'flat') assert.deepEqual(cs.filter(a => a[0] === sprite(MAPS.ROOMCOG)).map(a => a.slice(1, 3)), [[lit.x, lit.y]], 'flat: the busy room draws its lit computer');
    }
  } finally { setHallPlan('open'); setView('flat'); if (had) globalThis.document = had; else delete globalThis.document; }
}
