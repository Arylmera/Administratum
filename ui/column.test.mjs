import assert from 'node:assert/strict';
import { COL_W, FH, TOP, SHAFT_W, MIN_FLOORS, columnOf, layoutColumn, columnRoute, floorAt, maxDeptFloors, columnScale, columnPlaced } from './column.js';
import { planLayout } from './layout.js';

const h = 400, size = { w: COL_W, h };
const dept = (name, n = 1, helpers = []) => ({ name, color: '#fff', ids: Array.from({ length: n }, (_, i) => `${name}${i}`), helpers });

// floor ys: the sanctum on top, the departments in order under it, the cogitator and the refectory at the bottom
{
  const H = columnOf(size, ['a', 'b'], 'left');
  assert.equal(H.strip, true); assert.equal(H.column, true); assert.equal(H.route, columnRoute);
  assert.equal(H.w, COL_W); assert.equal(H.h, h); assert.equal(H.baseH, h);
  assert.deepEqual(H.floors, [{ key: 'sanctum', y: TOP + FH }, { key: 'd:a', y: TOP + 2 * FH }, { key: 'd:b', y: TOP + 3 * FH }, { key: 'cog', y: h - FH }, { key: 'ref', y: h }]);
  assert.deepEqual([...H.stops], H.floors.map(f => [f.key, f.y]));
  assert.equal(H.magos.y, TOP + FH); assert.ok(H.queue.every(q => q.y === TOP + FH));
  assert.ok(H.cogSpots.every(p => p.y === h - FH) && H.refectory.every(p => p.y === h) && H.recaff.y === h);
  assert.equal(floorAt(H, TOP + 2 * FH - 6), 'd:a'); // a console seat, 6 px above its floor line
  assert.equal(floorAt(H, h), 'ref');
  assert.equal(columnOf(size, ['a', 'b'], 'left'), H); // cached
  assert.equal(maxDeptFloors(h), Math.floor((h - TOP) / FH) - 3);
}

// a new department appends below the last (nothing moves); a removed one lifts only the floors below it by FH
{
  const ys = H => Object.fromEntries(H.floors.map(f => [f.key, f.y]));
  const A = ys(columnOf(size, ['a', 'b'])), B = ys(columnOf(size, ['a', 'b', 'c'])), C = ys(columnOf(size, ['b', 'c']));
  for (const k of Object.keys(A)) assert.equal(B[k], A[k], k);
  assert.equal(B['d:c'], A['d:b'] + FH);
  assert.equal(C['d:b'], B['d:b'] - FH); assert.equal(C['d:c'], B['d:c'] - FH);
  assert.equal(C.sanctum, B.sanctum); assert.equal(C.cog, B.cog); assert.equal(C.ref, B.ref);
}

// the right side mirrors every x (x' = COL_W - x), rects by their width; the shaft is on the inner side
{
  const Lf = columnOf(size, ['a'], 'left'), R = columnOf(size, ['a'], 'right');
  for (const k of ['magos', 'recaff', 'entry']) assert.equal(R[k].x, COL_W - Lf[k].x, k);
  assert.deepEqual(R.queue.map(p => p.x), Lf.queue.map(p => COL_W - p.x));
  assert.deepEqual(R.cogSpots.map(p => p.x), Lf.cogSpots.map(p => COL_W - p.x));
  assert.equal(R.landing('d:a').x, COL_W - Lf.landing('d:a').x);
  assert.equal(Lf.shaftX, COL_W - SHAFT_W); assert.equal(R.shaftX, 0);
  assert.equal(R.cog.x, COL_W - Lf.cog.x - 82); assert.equal(R.benches[0].x, COL_W - Lf.benches[0].x - R.benchW);
  assert.ok(Lf.carX > Lf.shaftX && Lf.carX < COL_W && R.carX > 0 && R.carX < SHAFT_W);
  const ll = layoutColumn([dept('a', 3, ['h1', 'h2'])], { size, side: 'left' }), rl = layoutColumn([dept('a', 3, ['h1', 'h2'])], { size, side: 'right' });
  assert.deepEqual(rl.desks.map(d => d.x), ll.desks.map(d => COL_W - d.x - 22));
  assert.deepEqual([...rl.seats.values()].map(s => s.x), [...ll.seats.values()].map(s => COL_W - s.x));
  assert.deepEqual([...rl.consoleSeats.values()].map(s => s.x), [...ll.consoleSeats.values()].map(s => COL_W - s.x));
  assert.equal(rl.blocks[0].x, COL_W - ll.blocks[0].x - ll.blocks[0].w);
  // entry off-screen past the outer edge; everything else inside the column, clear of the shaft
  assert.ok(Lf.entry.x < 0 && R.entry.x > COL_W);
  for (const d of ll.desks) assert.ok(d.x >= 0 && d.x + 22 <= Lf.shaftX);
  for (const d of rl.desks) assert.ok(d.x >= SHAFT_W && d.x + 22 <= COL_W);
}

// one floor per department, at its floor's y; pitch bounds; overflow past the floors and past 6 lecterns
{
  const L = layoutColumn([dept('a', 2), dept('b', 1, ['h'])], { size, side: 'left' });
  assert.deepEqual(L.floors, ['a', 'b']);
  assert.deepEqual(L.blocks.map(b => b.name), ['a', 'b']);
  assert.equal(L.seats.get('a0').y, TOP + 2 * FH); assert.equal(L.seats.get('b0').y, TOP + 3 * FH);
  assert.equal(L.consoleSeats.get('h').y, TOP + 3 * FH - 6);
  assert.ok(L.consoles[0].y < L.desks.find(d => d.dept === 'b').y + 30 - 22); // the back row stands higher
  const pitch = n => { const D = layoutColumn([dept('x', n)], { size, side: 'left' }).desks; return D.length > 1 ? D[1].x - D[0].x : null; };
  assert.equal(pitch(2), 24); assert.equal(pitch(4), 23); assert.equal(pitch(6), 14);
  // every lectern and console, 1 to 6 (9) a floor, clear of the lift's first line spot, on either side
  for (const side of ['left', 'right']) for (let n = 1; n <= 6; n++) {
    const Lc = layoutColumn([dept('x', n, Array.from({ length: n + 3 }, (_, i) => `h${i}`))], { size, side }), Hc = columnOf(size, ['x'], side), spot = Hc.lineSpot('d:x', 0).x;
    for (const d of Lc.desks) assert.ok(side === 'left' ? d.x + 22 <= spot : d.x >= spot, `${side} n=${n}: lectern at ${d.x} over the landing line`);
    for (const c of Lc.consoles) assert.ok(side === 'left' ? c.x + 14 <= spot : c.x >= spot, `${side} n=${n}: console at ${c.x}`);
  }
  const cpitch = n => { const C = layoutColumn([dept('x', 1, Array.from({ length: n }, (_, i) => `h${i}`))], { size, side: 'left' }).consoles; return C[1].x - C[0].x; };
  assert.equal(cpitch(2), 16); assert.equal(cpitch(9), 9);
  const many = layoutColumn([dept('x', 8)], { size, side: 'left' });
  assert.equal(many.desks.length, 6); assert.equal(many.overflow, 2);
  const max = maxDeptFloors(h), F = layoutColumn(Array.from({ length: max + 2 }, (_, i) => dept(`d${i}`, 2)), { size, side: 'left' });
  assert.equal(F.floors.length, max); assert.equal(F.overflow, 4);
  const Hf = columnOf(size, F.floors, 'left');
  assert.ok(Hf.floors.at(-3).y + FH <= h - FH); // the last department floor clears the cogitator's
}

// routes: same floor straight; another floor through the landings with one lift waypoint; a nap passes the recaff
{
  const H = columnOf(size, ['a', 'b'], 'left'), seat = { x: 30, y: TOP + 2 * FH };
  assert.deepEqual(columnRoute({ x: 10, y: seat.y }, seat, [], H), [{ x: 30, y: seat.y }]);
  assert.deepEqual(columnRoute(seat, seat, [], H), []);
  const r = columnRoute(H.entry, seat, [], H);
  assert.deepEqual(r, [H.landing('ref'), { ...H.landing('d:a'), lift: { from: 'ref', to: 'd:a' } }, seat]);
  assert.equal(r.filter(p => p.lift).length, 1);
  assert.equal(r[0].y, h);
}

// the Strip size drops L -> M -> S on a short work area until MIN_FLOORS department floors fit
{
  const fits = (cssH, s) => maxDeptFloors(Math.floor(cssH / s)) >= MIN_FLOORS;
  assert.equal(columnScale(1300, 2.5), 2.5);
  assert.ok(fits(1300, 2.5));
  const cssH = 816; // 1080p at 125 %, the work area
  const s = columnScale(cssH, 2.5);
  assert.ok(fits(cssH, s) && s <= 2.5);
  assert.equal(columnScale(cssH, 2), 2); // M fits: 5 department floors
  assert.equal(maxDeptFloors(Math.floor(cssH / 2)), 5);
  assert.equal(maxDeptFloors(Math.floor(cssH / 1.5)), 9);
  assert.equal(columnScale(400, 2.5), 1.5); // too short for any: the smallest
}

// planLayout keeps stable slots with the column's layout (an emptied desk held, its neighbour unmoved)
{
  const lay = (p, o) => layoutColumn(p, { ...o, side: 'left' });
  const P1 = planLayout(null, [dept('a', 2)], 0, {}, size, lay);
  const P2 = planLayout(P1, [{ ...dept('a', 2), ids: ['a1'] }], 1000, {}, size, lay);
  assert.equal(P2.desks.find(d => d.id === 'a1').x, P1.desks.find(d => d.id === 'a1').x);
  assert.deepEqual(P2.floors, ['a']);
}

// ---- the cast in the column (actors.js with lift.js) ----
const { Cast } = await import('./actors.js');
const roll = (id, dept, status = 'busy', helpers) => ({ id, dept, status, sinceMs: 1, context: null, ...(helpers && { helpers }) });
const scene = (depts, roster, side = 'left') => {
  const Lc = layoutColumn(depts, { size, side });
  return { Lc, H: columnOf(size, Lc.floors, side), roster };
};
const sync = (cast, { Lc, H, roster }) => cast.sync(roster, Lc.seats, () => '#f00', Lc.consoleSeats, Lc.blocks, H);
// Steps the cast, noting each scribe's ride state as it changes.
function sim(cast, s, onStep, dt = 0.05) {
  const seen = new Map();
  for (let t = 0; t < s; t += dt) {
    cast.update(dt);
    for (const a of cast.actors.values()) { const r = a.ride ?? '-', l = seen.get(a.id) ?? []; if (l.at(-1) !== r) seen.set(a.id, [...l, r]); }
    onStep?.(t);
  }
  return seen;
}

// arrive -> call -> board -> alight -> sit; the adept appears at its floor's landing and never calls the car
{
  const cast = new Cast(), S = scene([dept('b'), { ...dept('a'), helpers: ['a0|h'] }], [roll('b0', 'b'), roll('a0', 'a', 'busy', [{ id: 'h', kind: 'explore' }])]);
  sync(cast, S);
  const a = cast.actors.get('a0'), h = cast.actors.get('a0|h');
  assert.deepEqual([a.x, a.y], [S.H.entry.x, S.H.entry.y]); // in from off-screen, outside the edge
  assert.deepEqual(a.path.map(p => p.lift ?? null), [null, { from: 'ref', to: 'd:a' }, null]);
  assert.deepEqual([h.x, h.y], [S.H.landing('d:a').x, S.H.landing('d:a').y]);
  let adeptCalled = false, carried = 0;
  const seen = sim(cast, 30, () => {
    adeptCalled ||= cast.lift.calls.has('a0|h') || cast.lift.riders.some(r => r.id === 'a0|h');
    carried = Math.max(carried, cast.lift.riders.length);
  });
  assert.deepEqual(seen.get('a0'), ['-', 'wait', 'in', '-']);
  assert.deepEqual(seen.get('a0|h'), ['-']);
  assert.equal(adeptCalled, false);
  assert.equal(carried, 2); // both scribes rode up together
  assert.deepEqual([a.x, a.y, a.pose], [S.Lc.seats.get('a0').x, S.Lc.seats.get('a0').y, 'desk']);
  assert.equal(h.pose, 'console');
}

// a petition mid-ride retargets the rider: it gets off at the sanctum and queues there
{
  const cast = new Cast(), S = scene([dept('a')], [roll('a0', 'a')]);
  sync(cast, S);
  const a = cast.actors.get('a0');
  let asked = false;
  const seen = sim(cast, 30, () => {
    if (!asked && a.ride === 'in') { asked = true; sync(cast, { ...S, roster: [roll('a0', 'a', 'waiting')] }); }
  });
  assert.ok(asked);
  assert.deepEqual(seen.get('a0'), ['-', 'wait', 'in', '-']);
  assert.deepEqual([a.x, a.y, a.pose], [S.H.queue[0].x, S.H.queue[0].y, 'queue']);
}

// a new destination while in line: on the same floor the call is withdrawn and it walks; another floor keeps its place
{
  const cast = new Cast(), S = scene([dept('a'), dept('b')], [roll('a0', 'a'), roll('b0', 'b')]);
  sync(cast, S); cast.settle();
  const a = cast.actors.get('a0');
  sync(cast, { ...S, roster: [roll('a0', 'a', 'waiting'), roll('b0', 'b')] }); // up to the sanctum
  sim(cast, 1.5);
  assert.equal(a.ride, 'wait');
  const n = cast.lift.calls.get('a0').n;
  sync(cast, { ...S, roster: [roll('a0', 'a', 'shell'), roll('b0', 'b')] }); // the cogitator, two floors down
  assert.equal(cast.lift.calls.get('a0').n, n);
  assert.equal(cast.lift.calls.get('a0').to, 'cog');
  sync(cast, { ...S, roster: [roll('a0', 'a', 'idle'), roll('b0', 'b')] }); // back to its desk, the same floor (idle: no cogitator hold)
  assert.equal(cast.lift.calls.has('a0'), false);
  assert.equal(a.ride, null);
  sim(cast, 5);
  assert.equal(a.pose, 'desk');
}

// a floor move shifts the seated actors on it; nobody rides for it
{
  const cast = new Cast(), S = scene([dept('a'), dept('b')], [roll('a0', 'a'), roll('b0', 'b')]);
  sync(cast, S); cast.settle();
  const b = cast.actors.get('b0'), y0 = b.y;
  assert.equal(y0, TOP + 3 * FH);
  const S2 = scene([dept('b')], [roll('b0', 'b')]); // 'a' leaves: 'b' moves up a floor
  sync(cast, S2);
  assert.equal(b.y, y0 - FH);
  const seen = sim(cast, 10);
  assert.deepEqual(seen.get('b0'), ['-']);
  assert.deepEqual([b.x, b.y, b.pose], [S2.Lc.seats.get('b0').x, S2.Lc.seats.get('b0').y, 'desk']);
  assert.equal(cast.lift.calls.size, 0);
}

// settle: on entry to the column the cast is already where it goes, the leavers gone; nobody calls the car
{
  const cast = new Cast(), S = scene([dept('a')], [roll('a0', 'a', 'shell')]);
  sync(cast, S); cast.settle();
  const a = cast.actors.get('a0');
  assert.deepEqual([a.x, a.y, a.pose, a.path.length], [S.H.cogSpots[0].x, S.H.cogSpots[0].y, 'cog', 0]);
  sim(cast, 2);
  assert.equal(cast.lift.calls.size + cast.lift.riders.length, 0);
}

// a nap: down in the lift, a stop at the recaff, then a bench spot on the refectory floor
{
  const cast = new Cast(), S = scene([dept('a', 2)], [roll('a0', 'a'), roll('a1', 'a')]);
  sync(cast, S); cast.settle();
  const a = cast.actors.get('a0'), sleepy = [roll('a0', 'a', 'idle'), roll('a1', 'a')];
  assert.deepEqual([...cast.napping(sleepy, S.H.refectory, Date.now())], ['a0']); // idle since long ago
  const S2 = scene([{ ...dept('a', 2), ids: ['a1'] }], sleepy); // its desk released
  sync(cast, S2);
  assert.equal(a.path.filter(p => p.lift).length, 1);
  const r = a.path.findIndex(p => p.x === S2.H.recaff.x && p.y === S2.H.recaff.y);
  assert.ok(r > 0 && a.path[r].wait === 2, 'stops at the recaff on the way');
  assert.ok(S2.H.refectory.some(p => p.x === a.path.at(-1).x && p.y === a.path.at(-1).y));
  sim(cast, 30);
  assert.equal(a.pose, 'nap');
  assert.equal(a.y, h);
}

// a rider whose destination floor goes (its department left, its seat with it) snaps to where it now goes: no ride on
{
  const cast = new Cast(), S = scene([dept('a'), dept('b')], [roll('a0', 'a'), roll('b0', 'b')]);
  sync(cast, S); cast.settle();
  const b = cast.actors.get('b0');
  sync(cast, { ...S, roster: [roll('a0', 'a'), roll('b0', 'b', 'shell')] }); // down to the cogitator
  sim(cast, 30, () => {}, 0.05);
  sync(cast, { ...S, roster: [roll('a0', 'a'), roll('b0', 'b', 'idle')] }); // back up to its desk on d:b (idle: no cogitator hold)
  let t = 0;
  while (b.ride !== 'in' && t < 30) { cast.update(0.05); t += 0.05; }
  assert.equal(b.ride, 'in');
  const S2 = scene([dept('a')], [roll('a0', 'a'), roll('b0', 'b', 'idle')]); // 'b' gone: d:b with it, b0 seatless
  sync(cast, S2);
  assert.equal(b.ride, null);
  assert.equal(cast.lift.riders.some(r => r.id === 'b0'), false);
  assert.deepEqual([b.x, b.y, b.path.length], [S2.H.entry.x, S2.H.entry.y, 0]); // snapped to its destination (out)
}

// entering the column: the cast settles only once the window is the column (its height the work area's at its scale)
{
  assert.equal(columnPlaced(Math.floor(1040 / 2), 1040, 2), true);
  assert.equal(columnPlaced(Math.floor(500 / 2), 1040, 2), false); // still the hall's window
  assert.equal(columnPlaced(Math.floor(1040 / 2.5), 1040, 2), false); // another scale
}

// a compaction in the column is a puff (no brazier); the right side's riders stand in its car
{
  const cast = new Cast(), S = scene([dept('a')], [roll('a0', 'a')], 'right');
  sync(cast, S);
  const a = cast.actors.get('a0');
  assert.ok(a.x > COL_W);
  let inCar = null;
  sim(cast, 30, () => { if (a.ride === 'in' && !inCar) inCar = a.x; });
  assert.equal(inCar, S.H.carX - 5); // slot 0, left of the car's centre
  a.pose = 'desk'; cast.compacted(a);
  assert.ok(a.puff > 0 && !a.burn);
}

console.log('column ok');
