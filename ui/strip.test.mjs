import assert from 'node:assert/strict';
import { STRIP_H, FLOOR, stripOf, layoutStrip, stripRoute } from './strip.js';
import { planLayout } from './layout.js';
import { Cast } from './actors.js';

const H = stripOf(800);
assert.equal(H.strip, true);
assert.equal(H.h, STRIP_H);
assert.equal(H.entry.y, FLOOR);
assert.ok(H.entry.x < 0); // off-screen left
// right to left: Magos, queue, bench, cogitator; all on the floor, inside the strip, no overlap between zones
assert.ok(H.magos.x < 800 && H.queue[0].x < H.magos.x);
for (let i = 1; i < H.queue.length; i++) assert.ok(H.queue[i].x < H.queue[i - 1].x);
assert.ok(H.refectory.at(-1).x < H.queue.at(-1).x - 6);
assert.ok(Math.max(...H.cogSpots.map(p => p.x)) < H.recaff.x);
for (const p of [...H.queue, ...H.refectory, ...H.cogSpots, H.recaff]) assert.equal(p.y, FLOOR);
assert.ok(H.x1 < Math.min(...H.cogSpots.map(p => p.x)) - 12);
assert.deepEqual(H.lanes, [FLOOR]);

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
assert.equal(L.seats.get('s1').y, FLOOR);
assert.equal(L.consoleSeats.get('h1').y, FLOOR);
assert.equal(L.blocks.length, 2);
assert.equal(L.overflow, 0);
assert.ok(L.desks[0].x >= H.x0);

// capacity: past x1 the rest overflows (counted by live scribe)
const many = Array.from({ length: 60 }, (_, i) => ({ name: `d${i}`, color: '#00f', ids: [`x${i}`], helpers: [] }));
const F = layoutStrip(many, { size });
assert.ok(F.overflow > 0);
assert.ok(F.desks.every(d => d.x + 24 <= H.x1 + 1)); // a lectern slot is 26 wide, its desk 2 px in

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
console.log('strip ok');
