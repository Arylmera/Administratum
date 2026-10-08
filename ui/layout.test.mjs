import assert from 'node:assert/strict';
import { layoutDepartments, planLayout, DESK_GRACE_MS, DEPT_GRACE_MS, SHRINK_MS, MAX_BAYS, BAY_H, hallOf, route, phaseOf, lightLevel, QUEUE_SLOTS, DOOR_OUT, DOOR_IN, AISLE_Y, HALL, ENTRY, REF_OUT, REF_IN, RECAFF_SPOT, REFECTORY_SPOTS, COG_SPOTS, SCENE, MAX_W, roomOf, WALL, WALL_DY } from './layout.js';
import { propsOf, WIN_Y, wallArt } from './scene.js';
import { MAPS, RES, ART } from './sprites.js';
import { setTheme, THEMES } from './theme.js';

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
assert.deepEqual({ ...L.consoleSeats.get('h-0'), via: undefined }, { x: L.consoles[0].x + 7, y: L.consoles[0].y + 22, via: undefined });
// two-row departments: scribes and adepts walk to and from every seat without crossing a console or a desk
// (upper consoles step into the column gap, first-row seats use the lane between the rows)
for (const D of [L, layoutDepartments([{ name: 'T', color: '#fff', ids: ids('t', 6) }])]) {
  const solid = D.consoles.map(c => [c, 14, 10]).concat(D.desks.map(d => [d, 32, 21]));
  for (const seat of [...D.consoleSeats.values(), ...D.seats.values()]) for (const e of [ENTRY, QUEUE_SLOTS[0], COG_SPOTS[2]]) for (const [a, b] of [[seat, e], [e, seat]]) {
    const rt = [a].concat(route(a, b, D.blocks));
    rt.slice(1).forEach((q, i) => {
      const p = rt[i], x0 = Math.min(p.x, q.x), y0 = Math.min(p.y, q.y);
      for (const [o, w, h] of solid) assert.ok(!(x0 < o.x + w && Math.max(p.x, q.x) > o.x && y0 < o.y + h && Math.max(p.y, q.y) > o.y), `leg ${JSON.stringify([p, q])} crosses ${o.id}`);
    });
  }
}
// a freed console (null) keeps the others in place
const L2 = layoutDepartments([{ name: 'Terra', color: '#d9a84e', ids: ids('t', 3), helpers: [null, 'h-1', 'h-2', 'h-3', 'h-4'] }]);
assert.equal(L2.consoles.length, 4);
assert.deepEqual(L2.consoleSeats.get('h-4'), L.consoleSeats.get('h-4'));
// departments without helpers are unchanged
assert.equal(layoutDepartments([{ name: 'T', color: '#fff', ids: ids('t', 6) }]).consoles.length, 0);

// stable seating (planLayout): departures leave empty desks, arrivals reuse them, the grace period compacts
{
  const at = P => new Map(P.desks.map(d => [d.key, `${d.x},${d.y}`]));
  const D = (a, b, c) => [{ name: 'A', color: '#fff', ids: a }, { name: 'B', color: '#fff', ids: b }, ...(c ? [{ name: 'C', color: '#fff', ids: c }] : [])];
  let P = planLayout(null, D(['a0', 'a1', 'a2'], ['b0', 'b1']), 0);
  const before = at(P), keyA1 = P.desks.find(d => d.id === 'a1').key;
  P = planLayout(P, D(['a0', 'a2'], ['b0', 'b1']), 1000);
  assert.deepEqual(at(P), before, 'a departure moves no desk');
  assert.equal(P.desks.find(d => d.key === keyA1).id, null);
  assert.equal(P.desks.find(d => d.key === keyA1).was, 'a1');
  assert.ok(!P.seats.has('a1'));
  P = planLayout(P, D(['a0', 'a2', 'a9'], ['b0', 'b1']), 2000);
  assert.deepEqual(at(P), before, 'an arrival reuses the empty desk');
  assert.equal(P.desks.find(d => d.key === keyA1).id, 'a9');
  // a new department appends without moving the existing blocks when it fits
  const blocks = P.blocks.map(b => `${b.name}:${b.x},${b.y},${b.w},${b.h}`);
  P = planLayout(P, D(['a0', 'a2', 'a9'], ['b0', 'b1'], ['c0']), 3000);
  assert.deepEqual(P.blocks.slice(0, 2).map(b => `${b.name}:${b.x},${b.y},${b.w},${b.h}`), blocks);
  assert.equal(P.blocks[2].name, 'C');
  assert.deepEqual(new Map([...at(P)].filter(([k]) => before.has(k))), before);
  // b0 leaves; after DESK_GRACE_MS its desk goes and b1 compacts into the first slot
  P = planLayout(P, D(['a0', 'a2', 'a9'], ['b1'], ['c0']), 4000);
  const b0x = P.desks.find(d => d.was === 'b0').x;
  P = planLayout(P, D(['a0', 'a2', 'a9'], ['b1'], ['c0']), 4000 + DESK_GRACE_MS - 1);
  assert.equal(P.desks.filter(d => d.dept === 'B').length, 2);
  P = planLayout(P, D(['a0', 'a2', 'a9'], ['b1'], ['c0']), 4000 + DESK_GRACE_MS);
  assert.deepEqual(P.desks.filter(d => d.dept === 'B').map(d => [d.id, d.x]), [['b1', b0x]]);
  // a department with nobody left keeps its block until DEPT_GRACE_MS
  P = planLayout(P, D(['a0', 'a2', 'a9'], [], ['c0']), 10_000_000);
  assert.ok(P.blocks.some(b => b.name === 'B'));
  P = planLayout(P, D(['a0', 'a2', 'a9'], [], ['c0']), 10_000_000 + DEPT_GRACE_MS);
  assert.deepEqual(P.blocks.map(b => b.name), ['A', 'C']);
  // dozing in the refectorium releases the desk; a waking scribe takes its own desk back if still free, else any free one
  const N = a => [{ name: 'A', color: '#fff', ids: a }];
  P = planLayout(null, N(['a0', 'a1', 'a2']), 0);
  const deskOf = (P, id) => P.desks.find(d => d.id === id)?.key, k0 = deskOf(P, 'a0'), k1 = deskOf(P, 'a1');
  P = planLayout(P, N(['a2']), 1000); // a0 and a1 doze
  assert.ok(!P.seats.has('a0') && P.desks.length === 3);
  P = planLayout(P, N(['a2', 'a9']), 2000); // a newcomer takes the first free desk
  assert.equal(deskOf(P, 'a9'), k0);
  P = planLayout(P, N(['a2', 'a9', 'a1']), 3000); // a1 wakes: its own desk
  assert.equal(deskOf(P, 'a1'), k1);
  P = planLayout(P, N(['a2', 'a9', 'a1', 'a0']), 4000); // a0 wakes, nothing free: a new desk
  assert.equal(P.desks.length, 4);
  assert.ok(P.seats.has('a0'));
  // spare console slots wait too: an adept finishing doesn't shrink the block
  const H = h => [{ name: 'A', color: '#fff', ids: ['a0'], helpers: h }];
  P = planLayout(null, H(['h0']), 0);
  P = planLayout(P, H([]), 1000);
  assert.equal(P.blocks[0].w, 2 * 48 + 2);
  P = planLayout(P, H([]), 1000 + DESK_GRACE_MS);
  assert.equal(P.blocks[0].w, 48 + 2);
  // capacity: empties waiting their grace are dropped at once rather than overflow a newcomer (in the largest hall)
  const many = k => ids('d', k).map(n => ({ name: n, color: '#fff', ids: [n] }));
  P = planLayout(null, many(60), 0);
  assert.equal(P.bays, MAX_BAYS);
  const fit = P.blocks.length;
  P = planLayout(P, many(fit).slice(1), 1000); // d-0 left: its block waits
  assert.equal(P.blocks.length, fit);
  P = planLayout(P, many(fit).slice(1).concat({ name: 'new', color: '#fff', ids: ['n'] }), 2000);
  assert.equal(P.overflow, 0);
  assert.ok(P.seats.has('n') && !P.blocks.some(b => b.name === 'd-0'));
}

// space: compact lecterns past capacity, then bays; hysteresis on the way back
{
  const dept = (name, n) => ({ name, color: '#fff', ids: ids(name, n) });
  const D = n => ['A', 'B'].map(name => dept(name, n));
  let P = planLayout(null, D(2), 0);
  assert.equal(P.level, 0);
  assert.ok(!P.compact && P.bays === 0 && !P.desks.some(d => d.compact));
  P = planLayout(P, D(5), 1000); // two blocks of five overflow the hall in full desks
  assert.ok(P.compact && P.bays === 0 && P.overflow === 0, 'compact first');
  assert.ok(P.desks.every(d => d.compact));
  // six lecterns per row, each 31 wide, seats centred on a 22-wide lectern
  const C = layoutDepartments([dept('T', 6)], { compact: true });
  assert.equal(C.blocks[0].w, 6 * 31 + 2);
  assert.equal(C.blocks[0].h, 64 - 8);
  assert.deepEqual(C.seats.get('T-0'), { x: C.desks[0].x + 11, y: C.desks[0].y + 30 });
  // hysteresis: back to 2 x 4 (fits full desks) does not flip back at once, nor while one more department wouldn't fit
  P = planLayout(P, D(4), 2000);
  assert.ok(P.compact, 'no flip right after');
  P = planLayout(P, D(4), 2000 + 10 * SHRINK_MS);
  assert.ok(P.compact, 'one more department would overflow full desks: stay compact');
  P = planLayout(P, D(2), 3_000_000);
  P = planLayout(P, D(2), 3_000_000 + DESK_GRACE_MS); // the freed desks go
  assert.ok(P.compact);
  P = planLayout(P, D(2), 3_000_000 + DESK_GRACE_MS + SHRINK_MS - 1);
  assert.ok(P.compact, 'roomy, but not for SHRINK_MS yet');
  P = planLayout(P, D(2), 3_000_000 + DESK_GRACE_MS + SHRINK_MS);
  assert.ok(!P.compact && P.level === 0, 'back to full desks');
  // a short dip in the middle restarts the wait
  P = planLayout(null, D(5), 0);
  P = planLayout(P, D(2), 1, { desk: 0 });
  P = planLayout(P, D(5), 2, { desk: 0 });
  P = planLayout(P, D(2), 3, { desk: 0 });
  P = planLayout(P, D(2), 3 + SHRINK_MS - 1, { desk: 0 });
  assert.ok(P.compact);
  P = planLayout(P, D(2), 3 + SHRINK_MS, { desk: 0 });
  assert.ok(!P.compact);

  // bays: compact still too full grows the hall downward; the aisle, gate and the hall's queue move with it
  const E = k => ids('e', k).map(name => dept(name, 5)); // a five-desk department fills a compact row with one gap
  P = planLayout(null, E(2), 0);
  assert.ok(P.compact && P.bays === 0);
  P = planLayout(P, E(3), 1000);
  assert.equal(P.bays, 1);
  assert.equal(P.overflow, 0);
  const H1 = hallOf(1);
  assert.equal(H1.h, SCENE.h + BAY_H);
  assert.ok(P.blocks.every(b => b.y + b.h <= H1.y1), 'blocks inside the grown hall');
  assert.ok(P.blocks.some(b => b.y + b.h > HALL.y1), 'the third row stands in the bay');
  assert.deepEqual(H1.entry, { x: ENTRY.x, y: ENTRY.y + BAY_H });
  assert.ok(H1.entry.y > H1.aisleY && H1.entry.y <= H1.h, 'the gate in the new bottom wall');
  assert.deepEqual(H1.queue.slice(0, 3), QUEUE_SLOTS.slice(0, 3), 'the sanctum queue stays');
  for (const q of H1.queue.slice(3)) assert.ok(q.y > H1.aisleY && q.y < H1.h && Math.abs(q.x - H1.entry.x) >= 36);
  // routes in the grown hall: axis-aligned, through no block but the seat's own, and ending where asked
  const seats = [...P.seats.values()];
  const cuts = (b, p, q) => Math.max(p.x, q.x) > b.x && Math.min(p.x, q.x) < b.x + b.w && Math.max(p.y, q.y) > b.y && Math.min(p.y, q.y) < b.y + b.h;
  const inside = (b, p) => p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h;
  for (const s of seats) for (const e of [H1.entry, ...H1.queue, COG_SPOTS[0], RECAFF_SPOT]) for (const [a, b] of [[s, e], [e, s]]) {
    const rt = [a].concat(route(a, b, P.blocks, H1));
    assert.deepEqual(rt.at(-1), { x: b.x, y: b.y });
    rt.slice(1).forEach((q, i) => {
      const p = rt[i];
      if (p.x <= REF_IN.x && q.x <= REF_IN.x) assert.ok(p.x === q.x || p.y === q.y, `diagonal ${JSON.stringify([p, q])}`);
      assert.ok(p.y <= H1.h && q.y <= H1.h);
      for (const blk of P.blocks) if (cuts(blk, p, q)) assert.ok(inside(blk, p) || inside(blk, q), `${JSON.stringify([p, q])} crosses ${blk.name}`);
    });
  }
  assert.equal(route(H1.entry, seats[0], P.blocks, H1)[0].x, H1.entry.x, 'newcomers walk straight up out of the gate');
  // the bay goes again once compact without it holds one more department, after SHRINK_MS, one level at a time
  // (a newcomer's lectern beside a five-lectern block would stand in the corridor: e-1 keeps four)
  const E2 = [dept('e-0', 5), dept('e-1', 4)];
  P = planLayout(P, E2, 2000, { desk: 0, dept: 0 });
  assert.equal(P.bays, 1, 'no shrink right after');
  P = planLayout(P, E2, 2000 + SHRINK_MS - 1, { desk: 0, dept: 0 });
  assert.equal(P.bays, 1);
  P = planLayout(P, E2, 2000 + SHRINK_MS, { desk: 0, dept: 0 });
  assert.ok(P.bays === 0 && P.compact, 'bay gone, still compact (a five-desk department takes two rows of full desks)');
  assert.ok(P.blocks.every(b => b.y + b.h <= HALL.y1));
  P = planLayout(P, E2, 2000 + 9 * SHRINK_MS, { desk: 0, dept: 0 });
  assert.ok(P.compact);
  // lecterns and their consoles: adepts and scribes reach every seat without crossing furniture
  const K = layoutDepartments([{ name: 'T', color: '#fff', ids: ids('t', 4), helpers: ids('h', 8) }], { compact: true });
  assert.equal(K.consoles.length, 8);
  const solid = K.consoles.map(c => [c, 14, 10]).concat(K.desks.map(d => [d, 22, 21]));
  for (const [i, [o, w, h]] of solid.entries()) for (const [p, pw, ph] of solid.slice(i + 1)) assert.ok(!hit(o, w, h, p, pw, ph), 'furniture overlap');
  for (const seat of [...K.consoleSeats.values(), ...K.seats.values()]) for (const e of [ENTRY, QUEUE_SLOTS[0], COG_SPOTS[2]]) for (const [a, b] of [[seat, e], [e, seat]]) {
    const rt = [a].concat(route(a, b, K.blocks));
    rt.slice(1).forEach((q, i) => {
      const p = rt[i], x0 = Math.min(p.x, q.x), y0 = Math.min(p.y, q.y);
      for (const [o, w, h] of solid) assert.ok(!(x0 < o.x + w && Math.max(p.x, q.x) > o.x && y0 < o.y + h && Math.max(p.y, q.y) > o.y), `leg ${JSON.stringify([p, q])} crosses ${o.id}`);
    });
  }
}

const desk = { x: 24, y: 96 + WALL_DY }; // a first-row seat
// desk to queue goes through both door points; queue to queue inside the office goes straight
const r = route(desk, QUEUE_SLOTS[0]);
assert.deepEqual(r.at(-1), QUEUE_SLOTS[0]);
assert.ok(r.some(p => p.x === DOOR_OUT.x && p.y === DOOR_OUT.y));
assert.ok(r.some(p => p.x === DOOR_IN.x && p.y === DOOR_IN.y));
assert.equal(route(QUEUE_SLOTS[1], QUEUE_SLOTS[0]).length, 1);
assert.deepEqual(route(desk, { x: 72, y: desk.y }), [{ x: 24, y: HALL.y0 + 60 }, { x: 72, y: HALL.y0 + 60 }, { x: 72, y: desk.y }]); // the gap under the row

// the gate is centred in the scriptorium's bottom wall, below the aisle; newcomers walk up to the aisle first
assert.equal(ENTRY.x, (HALL.x0 + HALL.x1) / 2);
assert.ok(ENTRY.y > AISLE_Y && ENTRY.y <= SCENE.h);
const inGate = route(ENTRY, desk);
assert.equal(inGate[0].x, ENTRY.x);
assert.deepEqual(inGate.at(-1), desk);
for (const q of QUEUE_SLOTS.slice(3)) assert.ok(Math.abs(q.x - ENTRY.x) >= 36, `queue slot ${q.x} clear of the gate`);

// desk to the refectorium goes through its door; inside the refectorium it walks straight
const has = (rt, p) => rt.some(q => q.x === p.x && q.y === p.y);
const toRef = route(desk, RECAFF_SPOT);
assert.ok(has(toRef, REF_OUT) && has(toRef, REF_IN) && !has(toRef, DOOR_IN));
assert.ok(toRef.indexOf(toRef.find(p => p.x === REF_OUT.x && p.y === REF_OUT.y)) < toRef.findIndex(p => p.x === REF_IN.x && p.y === REF_IN.y));
assert.deepEqual(toRef.at(-1), RECAFF_SPOT);
assert.equal(route(RECAFF_SPOT, REFECTORY_SPOTS[3]).length, 1);
const back = route(REFECTORY_SPOTS[0], desk);
assert.deepEqual(back.slice(0, 2), [REF_IN, REF_OUT]);
const refToQueue = route(REFECTORY_SPOTS[0], QUEUE_SLOTS[0]);
assert.ok(has(refToQueue, REF_IN) && has(refToQueue, DOOR_IN));
assert.equal(REFECTORY_SPOTS.length, 6);
assert.equal(new Set(REFECTORY_SPOTS.map(p => `${p.x},${p.y}`)).size, 6);
for (const p of REFECTORY_SPOTS.concat(RECAFF_SPOT)) assert.ok(p.x > 208 && p.y > WALL && p.y < 100 + WALL_DY, 'refectory spot inside the room');

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
assert.equal(lightLevel('auto', 12, 'night').phase, 'night'); // the sun overrides fixed hours
assert.equal(lightLevel('full', 2, 'night').phase, 'day');
assert.ok(lightLevel('full', 12).dark > 0, 'Tier II keeps a darkness floor in full light');

// cogitator stations: on the floor in front of the bank (its desk ends 11 px below the wall foot), above the department blocks, reachable
for (const p of COG_SPOTS) {
  assert.ok(p.y > WALL + 11 && p.y < HALL.y0 && p.x - 8 >= HALL.x0 && p.x + 8 <= HALL.x1, `cog spot ${p.x}`);
  assert.deepEqual(route(ENTRY, p).at(-1), p);
}

// no prop under a queued petitioner (scribe sprite 16x17 above the feet)
for (const [name, x, y] of propsOf(hallOf(0)).props) {
  const w = MAPS[name][0].length / RES, h = MAPS[name].length / RES;
  for (const q of QUEUE_SLOTS) assert.ok(!hit({ x, y }, w, h, { x: q.x - 8, y: q.y - 17 }, 16, 17), `${name} at ${x},${y} under queue slot ${q.x},${q.y}`);
}

// The resizable hall: the window sizes the scene. Minimum, 1080p at 2x (uncapped), the capped 1080p and
// ultra-wide scenes app.js makes, a tall window, a middling one; each also with bays.
{
  const SIZES = [SCENE, { w: 960, h: 520 }, { w: MAX_W, h: 297 }, { w: MAX_W, h: SCENE.h }, { w: 346, h: 680 }, { w: 450, h: 400 }];
  const dept = (name, n, h = 0) => ({ name, color: '#fff', ids: ids(name, n), helpers: ids(`${name}h`, h) });
  const sprite = q => ({ x: q.x - 8, y: q.y - 17 });
  const SIX = [dept('A', 3, 5), dept('B', 1), dept('C', 6, 2), dept('D', 2), dept('E', 4, 1), dept('F', 5)];
  for (const S of SIZES) for (const bays of [0, 2]) {
    const H = hallOf(bays, S), tag = `${S.w}x${S.h}+${bays}`;
    assert.equal(H.w, S.w); assert.equal(H.h, S.h + bays * BAY_H);
    assert.equal(H.rx, S.w - 138, 'the right column keeps its width, anchored east');
    assert.equal(H.entry.x, H.x0 + Math.floor((H.x1 - H.x0) / 2), 'the gate centred in the scriptorium');
    // queue: the sanctum's slots in the sanctum, the rest in the hall's bottom aisle clear of the gate; capacity grows
    const sanct = H.queue.filter(q => roomOf(q, H) === 'sanct');
    assert.deepEqual(H.queue.slice(0, sanct.length), sanct, `${tag}: the sanctum's slots first`);
    for (const q of sanct) assert.ok(q.x - 8 >= H.rx + 4 && q.x + 8 <= H.w - 12 && q.y - 17 >= H.split + 40 && q.y <= H.baseH - 30, `${tag}: slot ${q.x},${q.y} in the sanctum`);
    for (const q of H.queue.slice(sanct.length)) assert.ok(q.y > H.aisleY && q.y < H.h && q.x - 8 > 0 && q.x <= H.corridorX && Math.abs(q.x - H.entry.x) >= 36, `${tag}: hall slot ${q.x},${q.y}`);
    assert.equal(new Set(H.queue.map(q => `${q.x},${q.y}`)).size, H.queue.length);
    assert.ok(sanct.length >= 3 && H.queue.length >= QUEUE_SLOTS.length, `${tag}: queue capacity`);
    if (S.h >= 300) assert.ok(sanct.length > 3, `${tag}: the taller sanctum holds more`);
    // refectory: spots in the room, more as it grows; the recaff in it
    for (const p of H.refectory.concat(H.recaff)) assert.ok(roomOf(p, H) === 'ref' && p.x > H.rx + 8 && p.y > WALL && p.y <= H.split - 10, `${tag}: refectory spot ${p.x},${p.y}`);
    assert.ok(H.refectory.length >= REFECTORY_SPOTS.length && H.refectory.length % 3 === 0);
    assert.equal(new Set(H.refectory.map(p => `${p.x},${p.y}`)).size, H.refectory.length);
    if (S.h >= 400) assert.ok(H.refectory.length > REFECTORY_SPOTS.length, `${tag}: the taller refectorium seats more`);
    assert.equal(roomOf(H.doorIn, H), 'sanct'); assert.equal(roomOf(H.refIn, H), 'ref');
    for (const p of H.cogSpots) assert.ok(p.y > WALL + 11 && p.y < H.y0 && p.x - 8 >= H.x0 && p.x + 8 <= H.x1, `${tag}: cog spot`);
    // props inside the scene, none under a queued petitioner
    for (const [name, x, y] of propsOf(H).props) {
      const w = MAPS[name][0].length / RES, h = MAPS[name].length / RES;
      assert.ok(x >= 0 && x + w <= H.w && y >= 0 && y + h <= H.h, `${tag}: ${name} at ${x},${y} inside the scene`);
      for (const q of H.queue) assert.ok(!hit({ x, y }, w, h, sprite(q), 16, 17), `${tag}: ${name} at ${x},${y} under queue slot ${q.x},${q.y}`);
    }
    // a busy hall at this size (desks and lecterns): furniture apart, every walk ends where asked, axis-aligned in
    // the hall, through no desk or console, and into a room by its door
    for (const compact of [false, true]) {
      const D = layoutDepartments(SIX, { compact, bays, size: S });
      const solid = D.consoles.map(c => [c, 14, 10]).concat(D.desks.map(d => [d, compact ? 22 : 32, 21]));
      for (const [i, [o, w, h]] of solid.entries()) for (const [q, qw, qh] of solid.slice(i + 1)) assert.ok(!hit(o, w, h, q, qw, qh), `${tag}: furniture overlap`);
      for (const b of D.blocks) assert.ok(b.x >= H.x0 && b.x + b.w <= H.x1 + 1 && b.y + b.h <= H.y1, `${tag}: block inside the hall`);
      const ends = [H.entry, ...H.cogSpots, ...H.queue, H.recaff, ...H.refectory];
      for (const seat of [...D.seats.values(), ...D.consoleSeats.values()]) for (const e of ends) for (const [a, b] of [[seat, e], [e, seat]]) {
        const rt = [a].concat(route(a, b, D.blocks, H));
        assert.deepEqual(rt.at(-1), { x: b.x, y: b.y });
        rt.slice(1).forEach((q, i) => {
          const p = rt[i];
          if (roomOf(p, H) === 'hall' && roomOf(q, H) === 'hall') assert.ok(p.x === q.x || p.y === q.y, `${tag}: diagonal ${JSON.stringify([p, q])}`);
          assert.ok(p.y <= H.h && q.y <= H.h && p.x <= H.w && q.x <= H.w);
          const x0 = Math.min(p.x, q.x), y0 = Math.min(p.y, q.y);
          for (const [o, w, h] of solid) assert.ok(!(x0 < o.x + w && Math.max(p.x, q.x) > o.x && y0 < o.y + h && Math.max(p.y, q.y) > o.y), `${tag}: leg ${JSON.stringify([p, q])} crosses ${o.id}`);
        });
        const has = d => rt.some(p => p.x === d.x && p.y === d.y);
        if (roomOf(e, H) === 'sanct') assert.ok(has(H.doorOut) && has(H.doorIn), `${tag}: through the sanctum's door`);
        if (roomOf(e, H) === 'ref') assert.ok(has(H.refOut) && has(H.refIn) && !has(H.doorIn), `${tag}: through the refectorium's door`);
      }
    }
  }
  // bigger windows hold more before going compact; a wide one, more desks per row
  const many = k => ids('m', k).map(n => ({ name: n, color: '#fff', ids: [n] }));
  const fits = S => { let k = 1; while (!planLayout(null, many(k + 1), 0, {}, S).level) k++; return k; };
  const atBase = fits(SCENE);
  assert.ok(fits({ w: MAX_W, h: 297 }) > atBase && fits({ w: 346, h: 680 }) > atBase && fits({ w: 960, h: 520 }) > fits({ w: MAX_W, h: 297 }));
  const rowOf = S => layoutDepartments(many(12), { size: S }).blocks.filter(b => b.y === HALL.y0).length;
  assert.ok(rowOf({ w: MAX_W, h: SCENE.h }) > rowOf(SCENE));
  // a resize that doesn't force a reflow moves no desk: taller, or wider while every block already fits its row
  const D = [dept('A', 2), dept('B', 1)];
  const at = P => P.desks.map(d => `${d.key}:${d.x},${d.y}`).join(' ');
  let P = planLayout(null, D, 0);
  const before = at(P);
  for (const S of [{ w: 346, h: 600 }, { w: MAX_W, h: 300 }, { w: 450, h: SCENE.h }]) assert.equal(at(planLayout(P, D, 1000, {}, S)), before, `stable at ${S.w}x${S.h}`);
  // ...and one that does reflows: the second block joins the first row once wide enough, its desks keep their keys
  const R = [dept('A', 4), dept('B', 4), dept('C', 1)];
  P = planLayout(null, R, 0);
  const wide = planLayout(P, R, 1000, {}, { w: MAX_W, h: SCENE.h });
  assert.ok(wide.blocks[1].y === wide.blocks[0].y && P.blocks[1].y > P.blocks[0].y, 'wider: B moves up beside A');
  assert.deepEqual(wide.desks.map(d => d.key), P.desks.map(d => d.key));
  // the minimum is the original hall
  assert.equal(hallOf(0, { w: 100, h: 100 }), hallOf(0));
  assert.deepEqual(propsOf(hallOf(0)).windows, [78, 292]);
  // ...its floor the original hall's (two slot rows, 138 px of desks), under a back wall WALL_DY taller
  assert.equal(hallOf(0).rows, 2);
  assert.deepEqual([HALL.y0 - WALL, HALL.y1 - HALL.y0, SCENE.h - WALL], [18, 138, 186]);
}
// The tall back wall holds the gothic window and the full-height hangings above its foot (WALL - 4), in every hall.
assert.ok(WIN_Y + MAPS.WINDOW_TALL.length / RES <= WALL - 4, 'the tall window above the wall foot');
for (const S of [SCENE, { w: MAX_W, h: 400 }]) {
  const hangs = propsOf(hallOf(0, S)).props.filter(([name]) => name === 'HANGING');
  assert.ok(hangs.length >= 2, 'hangings on the scriptorium and refectorium walls');
  for (const [, , y] of hangs) assert.ok(y >= 4 && y + MAPS.HANGING.length / RES <= WALL - 4, `hanging at y ${y}`);
}

// wallArt(): for every theme, the tall gothic window and full-height hanging are drawn exactly when the theme's
// own art (or base, for a theme without 'walls' art of its own) defines WINDOW_TALL/HANGING the same way it
// defines the short WINDOW/BANNER; otherwise the short ones. tier2 (no art of its own) -> tall.
for (const id of Object.keys(THEMES)) {
  setTheme(id);
  const own = ART.themed[ART.dirOf(id)]?.walls?.frames ?? {};
  const tallWin = !!own.WINDOW_TALL === !!own.WINDOW, tallHang = !!own.HANGING === !!own.BANNER;
  const a = wallArt();
  assert.equal(a.win, MAPS[tallWin ? 'WINDOW_TALL' : 'WINDOW'], `${id}: win`);
  assert.equal(a.tallHang, tallHang, `${id}: tallHang`);
}
setTheme('tier2');
assert.equal(wallArt().tallHang, true, 'tier2 (no art of its own) -> tall');

// clearCog (the 39° view): no first-row desk before the cogitator bank (x 116..198 + dx); every block stays on the
// slot-row grid (y0 + 64k), the lanes' gaps; without it the layout is unchanged.
{
  const four = n => Array.from({ length: n }, (_, i) => ({ name: 'D' + i, color: '#fff', ids: ['a' + i, 'b' + i, 'c' + i, 'd' + i] }));
  for (const size of [SCENE, { w: MAX_W, h: SCENE.h }]) {
    const H = hallOf(0, size), plain = layoutDepartments(four(3), { size }), clear = layoutDepartments(four(3), { size, clearCog: true });
    assert.ok(plain.desks.some(d => d.y < H.y0 + 64 && d.x + 32 > 114 + H.dx && d.x < 200 + H.dx), 'the plain layout puts a desk there');
    for (const d of clear.desks) assert.ok(!(d.y < H.y0 + 64 && d.x + 32 > 114 + H.dx && d.x < 200 + H.dx), `desk at ${d.x},${d.y} before the cogitator`);
    for (const b of clear.blocks) assert.equal((b.y - H.y0) % 64, 0, `block ${b.name} off the slot grid`);
  }
}

console.log('layout ok');
