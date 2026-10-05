import assert from 'node:assert/strict';
import { layoutDepartments, route, phaseOf, lightLevel, QUEUE_SLOTS, DOOR_OUT, DOOR_IN, AISLE_Y, HALL } from './layout.js';

const ids = (p, n) => Array.from({ length: n }, (_, i) => `${p}-${i}`);

// one department of six: two rows, six distinct desks, block inside the hall
let L = layoutDepartments([{ name: 'Terra', color: '#d9a84e', ids: ids('t', 6) }]);
assert.equal(L.desks.length, 6);
assert.equal(new Set(L.desks.map(d => `${d.x},${d.y}`)).size, 6);
assert.equal(L.blocks[0].h, 2 * 64 - 8);
assert.equal(L.overflow, 0);
assert.deepEqual(L.seats.get('t-0'), { x: L.desks[0].x + 16, y: L.desks[0].y + 30 });

// many departments overflow instead of drawing outside the hall
L = layoutDepartments(ids('d', 12).map(n => ({ name: n, color: '#ffffff', ids: [n] })));
assert.ok(L.overflow > 0);
for (const b of L.blocks) assert.ok(b.y + b.h <= HALL.y1 && b.x + b.w <= HALL.x1 + 1);
assert.equal(L.desks.length + L.overflow, 12);

// five helpers in one department: two extra desk-sized slots, five consoles clear of the desks
L = layoutDepartments([{ name: 'Terra', color: '#d9a84e', ids: ids('t', 3), helpers: ids('h', 5) }]);
assert.equal(L.consoles.length, 5);
assert.equal(L.consoleSeats.size, 5);
assert.equal(L.blocks[0].w, 4 * 48 + 2);
assert.equal(L.blocks[0].h, 2 * 64 - 8);
assert.equal(new Set(L.consoles.map(c => `${c.x},${c.y}`)).size, 5);
const hit = (a, aw, ah, b, bw, bh) => a.x < b.x + bw && b.x < a.x + aw && a.y < b.y + bh && b.y < a.y + ah;
for (const c of L.consoles) {
  for (const d of L.desks) assert.ok(!hit(c, 14, 10, d, 32, 21), `console ${c.id} overlaps desk ${d.id}`);
  const b = L.blocks[0];
  assert.ok(c.x >= b.x && c.x + 14 <= b.x + b.w && c.y >= b.y && L.consoleSeats.get(c.id).y <= b.y + b.h);
}
assert.deepEqual(L.consoleSeats.get('h-0'), { x: L.consoles[0].x + 7, y: L.consoles[0].y + 22 });
// a freed console (null) keeps the others in place
const L2 = layoutDepartments([{ name: 'Terra', color: '#d9a84e', ids: ids('t', 3), helpers: [null, 'h-1', 'h-2', 'h-3', 'h-4'] }]);
assert.equal(L2.consoles.length, 4);
assert.deepEqual(L2.consoleSeats.get('h-4'), L.consoleSeats.get('h-4'));
// departments without helpers are unchanged
assert.equal(layoutDepartments([{ name: 'T', color: '#fff', ids: ids('t', 6) }]).consoles.length, 0);

// desk to queue goes through both door points; queue to queue inside the office goes straight
const r = route({ x: 24, y: 96 }, QUEUE_SLOTS[0]);
assert.deepEqual(r.at(-1), QUEUE_SLOTS[0]);
assert.ok(r.some(p => p.x === DOOR_OUT.x && p.y === DOOR_OUT.y));
assert.ok(r.some(p => p.x === DOOR_IN.x && p.y === DOOR_IN.y));
assert.equal(route(QUEUE_SLOTS[1], QUEUE_SLOTS[0]).length, 1);
assert.ok(route({ x: 24, y: 96 }, { x: 72, y: 96 }).every(p => p.y === AISLE_Y || p.x === 72));

// lighting phases and modes
assert.equal(phaseOf(5), 'night');
assert.equal(phaseOf(6), 'dusk');
assert.equal(phaseOf(8), 'day');
assert.equal(phaseOf(17), 'day');
assert.equal(phaseOf(18), 'dusk');
assert.equal(phaseOf(21), 'night');
assert.equal(lightLevel('full', 23).phase, 'day');
assert.equal(lightLevel('candles', 12).phase, 'night');
assert.equal(lightLevel('auto', 12).beams, true);
assert.ok(lightLevel('full', 12).dark > 0, 'Tier II keeps a darkness floor in full light');

console.log('layout ok');
