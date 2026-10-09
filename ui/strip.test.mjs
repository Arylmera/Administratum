import assert from 'node:assert/strict';
import { STRIP_H, FLOOR, MARGIN_R, stripOf, layoutStrip, stripRoute, breakoutOfStrip } from './strip.js';
import { planLayout } from './layout.js';
import { Cast } from './actors.js';

const H = stripOf(800);
assert.equal(H.strip, true);
assert.equal(H.h, STRIP_H);
assert.equal(H.entry.y, FLOOR);
assert.ok(H.entry.x < 0); // off-screen left
// left to right: gate, recaff and two benches, the departments, cogitator, queue, Magos; all on the floor, no overlap
assert.ok(H.magos.x < 800 && H.queue[0].x < H.magos.x);
for (let i = 1; i < H.queue.length; i++) assert.ok(H.queue[i].x < H.queue[i - 1].x);
assert.ok(H.recaff.x < H.refectory[0].x && H.refectory.at(-1).x < H.x0 - 12);
assert.ok(H.x1 < Math.min(...H.cogSpots.map(p => p.x)) - 12);
assert.ok(Math.max(...H.cogSpots.map(p => p.x)) < H.queue.at(-1).x - 12);
for (const p of [...H.queue, ...H.refectory, ...H.cogSpots, H.recaff]) assert.equal(p.y, FLOOR);
assert.deepEqual(H.lanes, [FLOOR]);

// the right group keeps MARGIN_R from the right edge (the throne, 20 wide, centred on the Magos)
assert.ok(800 - (H.magos.x + 10) >= MARGIN_R);
// doors, left to right: the gate (clear of the handle, 6..18), refectory | departments | cogitator | sanctum
const [gate, dRef, dCog, dSan] = H.doors;
assert.deepEqual(H.doors.map(d => d.kind), ['gate', 'sanctum', 'sanctum', 'sanctum']);
for (let i = 1; i < H.doors.length; i++) assert.ok(H.doors[i - 1].x + H.doors[i - 1].w <= H.doors[i].x);
assert.ok(gate.x >= 18 && gate.x + gate.w <= H.recaff.x - 18); // the recaff drawn 18 px left of its spot
assert.equal(H.benches.length, 2);
assert.ok(H.benches[0].x + H.benchW < H.benches[1].x && H.benches[1].x + H.benchW <= dRef.x && dRef.x + dRef.w <= H.x0);
for (let i = 1; i < H.refectory.length; i++) if (i % 3) assert.ok(H.refectory[i].x - H.refectory[i - 1].x >= 16); // nappers don't overlap
for (const b of H.benches) for (const p of H.refectory.filter(p => p.x >= b.x && p.x < b.x + H.benchW)) assert.ok(p.x - 8 >= b.x && p.x + 8 <= b.x + H.benchW);
assert.equal(H.refectory.length, 6); // three nappers a bench
assert.ok(H.recaff.x - 18 - (gate.x + gate.w) >= 20); // room between the gate and the refectory
assert.ok(H.cog.x - (dCog.x + dCog.w) >= 14 && dSan.x - (H.cog.x + 82) >= 14); // the bank clear of both its doors
for (let i = 1; i < H.queue.length; i++) assert.ok(H.queue[i - 1].x - H.queue[i].x >= 22); // petitioners spaced out
assert.ok(H.x1 <= dCog.x && dCog.x + dCog.w <= H.cog.x);
assert.ok(H.cog.x + 82 <= dSan.x && dSan.x + dSan.w <= H.queue.at(-1).x - 6);
// nobody standing at a spot holds a door open (scene.js near: 12 px)
const away = (p, d) => Math.max(d.x - p.x, p.x - (d.x + d.w));
for (const p of [...H.queue, ...H.refectory, ...H.cogSpots, H.recaff, H.magos]) for (const d of H.doors.slice(1)) assert.ok(away(p, d) >= 12);

// a narrow strip (a 1280 px screen at scale 2) still holds every room without overlap, and departments between them
const N = stripOf(640);
for (let i = 1; i < N.doors.length; i++) assert.ok(N.doors[i - 1].x + N.doors[i - 1].w <= N.doors[i].x);
assert.ok(N.x1 - N.x0 > 44);
assert.ok(N.magos.x < 640 && N.queue[0].x < N.magos.x);

// route: one step along the floor
assert.deepEqual(stripRoute({ x: 10, y: FLOOR }, { x: 90, y: FLOOR }), [{ x: 90, y: FLOOR }]);
assert.deepEqual(stripRoute({ x: 10, y: FLOOR }, { x: 10, y: FLOOR }), []);

// layout: departments in arrival order, lecterns then consoles, a gap between departments
const size = { w: 800, h: STRIP_H };
const L = layoutStrip([
  { name: 'a', color: '#f00', ids: ['s1', 's2'], helpers: ['h1', 'h2', 'h3'] },
  { name: 'b', color: '#0f0', ids: ['s3'], helpers: [] },
], { size });
assert.equal(L.desks.length, 3);
assert.ok(L.desks.every(d => d.compact)); // lecterns
assert.equal(L.consoles.length, 3);
const xs = [...L.desks.map(d => d.x), ...L.consoles.map(c => c.x)];
assert.equal(new Set(xs).size, xs.length); // no two items at one x
assert.ok(L.desks.find(d => d.id === 's3').x > Math.max(...L.consoles.map(c => c.x))); // b after a's consoles
// neighbouring lecterns in the same department (s1, s2 in 'a') clear 8 px edge to edge (lectern width 22)
const [s1x, s2x] = [L.desks.find(d => d.id === 's1').x, L.desks.find(d => d.id === 's2').x];
assert.ok(s2x - (s1x + 22) >= 8);
assert.equal(L.seats.get('s1').y, FLOOR);
assert.equal(L.consoleSeats.get('h1').y, FLOOR);
assert.equal(L.blocks.length, 2);
assert.equal(L.overflow, 0);
assert.ok(L.desks[0].x >= H.x0);

// capacity: past x1 the rest overflows (counted by live scribe)
const many = Array.from({ length: 60 }, (_, i) => ({ name: `d${i}`, color: '#00f', ids: [`x${i}`], helpers: [] }));
const F = layoutStrip(many, { size });
assert.ok(F.overflow > 0);
assert.ok(F.desks.every(d => d.x + 30 <= H.x1 + 1)); // a lectern slot is 32 wide, its desk 2 px in

// planLayout keeps stable slots with the strip's layout
const P1 = planLayout(null, [{ name: 'a', color: '#f00', ids: ['s1', 's2'], helpers: [] }], 0, {}, size, layoutStrip);
const P2 = planLayout(P1, [{ name: 'a', color: '#f00', ids: ['s2'], helpers: [] }], 1000, {}, size, layoutStrip);
assert.equal(P2.desks.find(d => d.id === 's2').x, P1.desks.find(d => d.id === 's2').x); // s1's desk held empty

// the cast walks in from off-screen left along the floor; compaction is a puff
const cast = new Cast();
cast.sync([{ id: 's2', dept: 'a', status: 'busy', sinceMs: 0, context: null }], P2.seats, () => '#f00', P2.consoleSeats, P2.blocks, H);
const a = cast.actors.get('s2');
assert.deepEqual([a.x, a.y], [H.entry.x, H.entry.y]);
assert.deepEqual(a.path, [{ x: P2.seats.get('s2').x, y: FLOOR }]);
a.pose = 'desk';
cast.compacted(a);
assert.ok(a.puff > 0 && !a.burn);
// the break-out bay: temp departments after the others, a floor band with a gate at each end, clear of the cogitator door
{
  const P = planLayout(null, [{ name: 'out', color: '#fff', ids: ['o1', 'o2'], temp: true }, { name: 'Terra', color: '#fff', ids: ['t1'] }], 0, {}, { w: 800, h: STRIP_H }, layoutStrip);
  assert.deepEqual(P.blocks.map(b => [b.name, !!b.temp]), [['Terra', false], ['out', true]]);
  const [terra, out] = P.blocks, Z = breakoutOfStrip(P.blocks), dCog = stripOf(800).doors[2];
  assert.ok(Z.x < out.x && Z.x + Z.w > out.x + out.w && Z.x > terra.x + terra.w);
  assert.deepEqual(Z.gates.map(g => g.x), [Z.x, Z.x + Z.w]);
  assert.ok(Z.x + Z.w + 4 <= dCog.x); // the east gate (8 wide, centred on its x) stays off the door
  assert.equal(breakoutOfStrip([terra]), null);
}

// break-out room scribes stay in: no refectory nap, no cogitator, a compaction is a puff (no brazier walk)
{
  const c = new Cast(), now = 10 ** 13, s = (id, temp) => ({ id, status: 'idle', sinceMs: 1, ...(temp && { temp }) });
  assert.deepEqual([...c.napping([s('t', true), s('n')], [{ x: 0, y: 0 }, { x: 1, y: 0 }], now)], ['n']);
  const a = { id: 't', s: { id: 't', status: 'shell', temp: true } };
  assert.equal(c.destination(a, new Map([['t', { x: 50, y: 60 }]]), [], ['t']).pose, 'desk');
  const b = { id: 'b', pose: 'desk', x: 50, y: 60, s: { id: 'b', temp: true } };
  c.compacted(b);
  assert.ok(b.puff > 0 && !b.burn);
}

// a finished adept leaves no hole: the strip packs the live consoles side by side, the block shrinks with them
{
  const lay = helpers => layoutStrip([{ name: 'Terra', color: '#fff', ids: ['t1'], helpers, cons: 1 }], { size: { w: 800 } });
  const holed = lay(['a', null, 'c']), packed = lay(['a', 'c']);
  assert.deepEqual(holed.consoles, packed.consoles);
  assert.deepEqual(holed.blocks, packed.blocks);
}

// the departments sit centred between the refectory and the cogitator, not packed against the refectory
{
  const S = stripOf(1000), L = layoutStrip([{ name: 'a', color: '#fff', ids: ['s1'] }], { size: { w: 1000 } }), [b] = L.blocks;
  assert.ok(Math.abs((b.x - S.x0) - (S.x1 + 1 - (b.x + b.w))) <= 1);
  assert.equal(L.seats.get('s1').x, L.desks[0].x + 11); // seats move with their desks
}

console.log('strip ok');
