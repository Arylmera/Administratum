import assert from 'node:assert/strict';
import { order, depthSort } from './iso.js';
import { hallOf, MAX_W, WALL, layoutDepartments } from './layout.js';
import { setView, sceneSize, toScreen, toFloor } from './view.js';
import { Cast, face39 } from './actors.js';
import { use, pin, placeOf, actorFoot, actorAt39, seatShift } from './scene39.js';
import { setTheme } from './theme.js';
import { beginFrame, stepGate, stepAlarm, sceneBusy, deskFill, reactionLights, KIND } from './scene.js';
import { SCRIBE39, SCRIBE39_AT, RES } from './sprites.js';

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
  assert.equal(actorAt39(...pin(a.x, a.y + 1), [{ ...a, leaving: true }]), null, `${tag}: a leaving actor is not picked`);
}
// seated 39° scribes, every world: drawn north of the seat (never into the desk) so the hands (the arm frame's first
// opaque row) land on the desk top, between its back and front edges at the hands' column
{
  const hall = hallOf(0); sceneSize(hall);
  for (const id of ['tier2', 'cyber', 'orbital', 'tower', 'vault']) {
    setTheme(id); use(hall);
    if (!SCRIBE39.arm) continue; // a world without 39° scribes yet: flat frames, no shift
    for (const kind of ['desk', 'lectern']) {
      const desk = { x: 40, y: 90, compact: kind === 'lectern' }, p = placeOf(kind, desk), a = { id: 's', x: desk.x + 11, y: desk.y + 30 };
      const s = seatShift(p, a), A = SCRIBE39_AT, hand = SCRIBE39.arm.findIndex(r => /[^.]/.test(r)) / RES;
      assert.ok(s >= 0 && a.y - s > p.yb, `${id} ${kind}: shift ${s} keeps the scribe in front of the desk`);
      const hx = a.x - A.feet.x + A.arm.x, hands = pin(a.x, a.y - s)[1] - A.feet.y + A.arm.y + hand;
      const back = pin(hx, p.yb - p.k.d / 2, p.k.top / 2)[1], front = pin(hx, p.yb, p.k.top / 2)[1];
      if (p.k.top < 12) { assert.equal(s, 0, `${id} ${kind}: a pedestal (its surface a detail): the scribe stays at the seat`); continue; }
      assert.ok(hands >= back - 0.5 && hands <= front - 1, `${id} ${kind}: hands at ${hands} on the top ${back}..${front}`);
    }
  }
  setTheme('tier2');
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
console.log('scene39 ok');
