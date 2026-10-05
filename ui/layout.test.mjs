import assert from 'node:assert/strict';
import { layoutDepartments, route, phaseOf, lightLevel, QUEUE_SLOTS, DOOR_OUT, DOOR_IN, AISLE_Y, HALL, ENTRY, REF_OUT, REF_IN, RECAFF_SPOT, REFECTORY_SPOTS, COG_SPOTS } from './layout.js';

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
assert.deepEqual(route({ x: 24, y: 96 }, { x: 72, y: 96 }), [{ x: 24, y: 118 }, { x: 72, y: 118 }, { x: 72, y: 96 }]); // the gap under the row

// the gate is centred in the scriptorium's bottom wall, below the aisle; newcomers walk up to the aisle first
assert.equal(ENTRY.x, (HALL.x0 + HALL.x1) / 2);
assert.ok(ENTRY.y > AISLE_Y && ENTRY.y <= 226);
const inGate = route(ENTRY, { x: 24, y: 96 });
assert.equal(inGate[0].x, ENTRY.x);
assert.deepEqual(inGate.at(-1), { x: 24, y: 96 });
for (const q of QUEUE_SLOTS.slice(3)) assert.ok(Math.abs(q.x - ENTRY.x) >= 36, `queue slot ${q.x} clear of the gate`);

// desk to the refectorium goes through its door; inside the refectorium it walks straight
const has = (rt, p) => rt.some(q => q.x === p.x && q.y === p.y);
const toRef = route({ x: 24, y: 96 }, RECAFF_SPOT);
assert.ok(has(toRef, REF_OUT) && has(toRef, REF_IN) && !has(toRef, DOOR_IN));
assert.ok(toRef.indexOf(toRef.find(p => p.x === REF_OUT.x && p.y === REF_OUT.y)) < toRef.findIndex(p => p.x === REF_IN.x && p.y === REF_IN.y));
assert.deepEqual(toRef.at(-1), RECAFF_SPOT);
assert.equal(route(RECAFF_SPOT, REFECTORY_SPOTS[3]).length, 1);
const back = route(REFECTORY_SPOTS[0], { x: 24, y: 96 });
assert.deepEqual(back.slice(0, 2), [REF_IN, REF_OUT]);
const refToQueue = route(REFECTORY_SPOTS[0], QUEUE_SLOTS[0]);
assert.ok(has(refToQueue, REF_IN) && has(refToQueue, DOOR_IN));
assert.equal(REFECTORY_SPOTS.length, 6);
assert.equal(new Set(REFECTORY_SPOTS.map(p => `${p.x},${p.y}`)).size, 6);
for (const p of REFECTORY_SPOTS.concat(RECAFF_SPOT)) assert.ok(p.x > 208 && p.y > 40 && p.y < 100, 'refectory spot inside the room');

// lanes: with several departments, every route is axis-aligned and only the legs into a seat touch its own block
L = layoutDepartments([{ name: 'A', color: '#fff', ids: ids('a', 2) }, { name: 'B', color: '#fff', ids: ids('b', 1) }, { name: 'C', color: '#fff', ids: ids('c', 3) }]);
assert.equal(new Set(L.blocks.map(b => b.y)).size, 2, 'two block rows');
const inside = (b, p) => p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h;
const cuts = (b, p, q) => Math.max(p.x, q.x) > b.x && Math.min(p.x, q.x) < b.x + b.w && Math.max(p.y, q.y) > b.y && Math.min(p.y, q.y) < b.y + b.h;
const seats = [...L.seats.values()];
const ends = seats.concat(ENTRY, COG_SPOTS, QUEUE_SLOTS, RECAFF_SPOT);
const hallSide = p => p.x <= REF_IN.x;
for (const s of seats) for (const e of ends) for (const [a, b] of [[s, e], [e, s]]) {
  const rt = [a].concat(route(a, b, L.blocks));
  rt.slice(1).forEach((q, i) => {
    const p = rt[i];
    if (hallSide(p) && hallSide(q)) assert.ok(p.x === q.x || p.y === q.y, `diagonal ${JSON.stringify([p, q])}`);
    for (const blk of L.blocks) if (cuts(blk, p, q)) assert.ok(inside(blk, p) || inside(blk, q), `${JSON.stringify([p, q])} crosses block ${blk.name}`);
  });
}
// a top-row desk reaches the refectorium by the gap under its row and the east corridor, not the bottom aisle
const top = L.seats.get('a-0'), rt = route(top, RECAFF_SPOT, L.blocks);
const oldLen = (AISLE_Y - top.y) + (REF_OUT.x - top.x) + (AISLE_Y - REF_OUT.y);
const len = [top].concat(rt).slice(0, rt.findIndex(p => p.x === REF_OUT.x && p.y === REF_OUT.y) + 2).reduce((s, p, i, arr) => s + (i ? Math.abs(p.x - arr[i - 1].x) + Math.abs(p.y - arr[i - 1].y) : 0), 0);
assert.ok(len < oldLen / 1.5, `refectorium walk ${len} vs ${oldLen}`);
assert.ok(rt.every(p => p.y < AISLE_Y));

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

// cogitator stations: on the floor in front of the bank (its desk ends at y 51), above the department blocks, reachable
for (const p of COG_SPOTS) {
  assert.ok(p.y > 51 && p.y < HALL.y0 && p.x - 8 >= HALL.x0 && p.x + 8 <= HALL.x1, `cog spot ${p.x}`);
  assert.deepEqual(route(ENTRY, p).at(-1), p);
}

console.log('layout ok');
