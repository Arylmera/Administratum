// The hall plan (hallplan.js; docs/superpowers/specs/2026-11-14-hall-plan-toggle-design.md): 'open', Guillaume's open
// space, untouched (every other test runs in it), or 'rooms', the rooms round the Sanctum (the mirror hall): its
// geometry, places, walks, props, and the behaviour that goes with it (a shell at the room's computer, a nap at the desk).
import assert from 'node:assert/strict';
import { layoutDepartments, planLayout, zonesOf, mirrorPlaces, SANCT_W, MIN_H, MAX_W, MAX_BAYS, SLOT_H, COMPUTER_W, HORS_COLOR, hallOf, route, WALL, WALL_DY, SCENE, roomOf } from './layout.js';
import { hallPlan, setHallPlan } from './hallplan.js';
import { propsOf } from './scene.js';
import { MAPS, RES } from './sprites.js';
import { Cast, asleep } from './actors.js';
import { stripOf } from './strip.js';
import { settings, questions } from './settings.js';
import { t, setTheme } from './theme.js';
import './themes.js';
import { sleepText } from './overlay.js';

const ids = (p, n) => Array.from({ length: n }, (_, i) => `${p}-${i}`);

// the switch: open by default; each plan its own hall, the open one the same object after a round trip
const open0 = hallOf(0);
assert.ok(!hallPlan.rooms && !open0.sanct && open0.refectory.length && open0.cogSpots.length, 'open by default: bank and benches');
setHallPlan('rooms');
assert.ok(hallOf(0).sanct && !hallOf(0).refectory.length && !hallOf(0).cogSpots.length, 'rooms: the Sanctum in the middle, no bank, no bench');
setHallPlan('nonsense'); assert.ok(!hallPlan.rooms, 'an unknown plan is the open space');
assert.equal(hallOf(0), open0, 'back to the open space: the very same hall');
// the open space keeps its west wing, the rooms plan has none
{
  const R = [{ id: 'rA', name: 'A', pattern: '**', color: '#aa0000' }], D = [{ name: 'Ad', color: '#fff', ids: ids('Ad', 2), room: 'rA' }];
  assert.ok(planLayout(null, D, 0, {}, SCENE, layoutDepartments, R).wing, 'open: the west wing');
  setHallPlan('rooms');
  assert.equal(planLayout(null, D, 0, {}, SCENE, layoutDepartments, R).wing, null, 'rooms: no wing');
}
// the words follow the plan, world by world (theme.js inRooms)
for (const [id, openShell, roomsShell] of [['tier2', 'At the cogitator', "At the room's cogitator"], ['breakingbad', 'At the reactor', "At the room's terminal"], ['darwin', 'At the specimen cabinet', 'At the specimen cabinet']]) {
  setTheme(id);
  setHallPlan('open'); assert.equal(t('status.shell'), openShell, `${id}, open`);
  setHallPlan('rooms'); assert.equal(t('status.shell'), roomsShell, `${id}, rooms`);
}
setTheme('tier2');
assert.equal(t('elsewhere'), 'Elsewhere');

// ---- from here on: the rooms plan -------------------------------------------------------------------------------------
setHallPlan('rooms');
// The mirror hall (personal fork): the Sanctum a full-height column centred on the gate, a corridor each side of it,
// the rooms' sides beyond; the Magos at its top, the petition line two abreast down it; no east column, refectorium,
// cogitator bank or door; at least MIN_H tall (four slot rows of rooms).
for (const S of [SCENE, { w: 700, h: 500 }, { w: MAX_W, h: SCENE.h }, { w: 960, h: 520 }]) for (const bays of [0, 2]) {
  const H = hallOf(bays, S), tag = `${S.w}x${S.h}+${bays}`, { sanct, corridors: [cL, cR], sides: { L: SL, R: SR } } = H;
  assert.equal((sanct.x0 + sanct.x1) / 2, H.entry.x, `${tag}: the Sanctum centred on the gate`);
  assert.equal(sanct.x1 - sanct.x0, SANCT_W);
  assert.ok(SL.x0 === H.x0 && SL.x1 < cL && cL < sanct.x0 && sanct.x1 < cR && cR < SR.x0 && SR.x1 === H.x1, `${tag}: side, corridor, Sanctum, corridor, side`);
  assert.ok(H.baseH >= MIN_H && H.rows >= 4, `${tag}: room for four slot rows`);
  assert.equal(roomOf(H.magos, H), 'sanct'); assert.equal(roomOf({ x: 10, y: 100 }, H), 'hall');
  assert.ok(H.queue.length >= 8 && new Set(H.queue.map(q => `${q.x},${q.y}`)).size === H.queue.length, `${tag}: queue capacity, distinct slots`);
  for (const q of H.queue) assert.ok(roomOf(q, H) === 'sanct' && q.y > H.magos.y && q.y < H.aisleY, `${tag}: slot ${q.x},${q.y} in the column`);
  assert.deepEqual([H.refectory, H.cogSpots, H.recaff, H.doorOut, H.refOut], [[], [], null, null, null], `${tag}: no east rooms`);
}

// The mirror hall's rooms (Task 4): seven rules and Hors zones, four places down each side of the Sanctum; each room a
// cell of its side, its departments inside it, a computer (3 spots) on its Sanctum side.
{
  const R = Array.from({ length: 7 }, (_, i) => ({ id: `r${i}`, name: `R${i}`, pattern: `**/r${i}/**`, color: `#1122${i}0` }));
  const d = (name, n, room, temp) => ({ name, color: '#fff', ids: ids(name, n), ...(room && { room }), ...(temp && { temp }) });
  const sessions = [d('a', 2, 'r0'), d('b', 1, 'r1'), d('c', 3, 'r2'), d('e', 1, 'r4'), d('f', 2, 'r5'), d('g', 1, 'r6'), d('h', 2)];
  const overlap = (p, q) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
  const inside = (b, Z) => b.x >= Z.x && b.y >= Z.y && b.x + b.w <= Z.x + Z.w && b.y + b.h <= Z.y + Z.h;
  for (const size of [{ w: MAX_W, h: SCENE.h }, { w: 700, h: 500 }]) {
    const P = planLayout(null, sessions, 0, {}, size, layoutDepartments, R), H = hallOf(P.bays, size), tag = `${size.w}x${size.h}`;
    const Zs = zonesOf(P.blocks, H).filter(Z => Z.kind === 'room'), S = { x: H.sanct.x0, y: WALL, w: H.sanct.x1 - H.sanct.x0, h: H.aisleY - WALL };
    assert.equal(Zs.length, 8, `${tag}: the 8 places drawn`);
    const L = Zs.filter(Z => Z.x + Z.w <= H.sides.L.x1 && Z.x >= H.sides.L.x0), Rt = Zs.filter(Z => Z.x >= H.sides.R.x0 && Z.x + Z.w <= H.sides.R.x1);
    assert.deepEqual([L.length, Rt.length], [4, 4], `${tag}: 4 cells each side`);
    assert.deepEqual(L.sort((p, q) => p.y - q.y).map(Z => Z.id), ['r0', 'r1', 'r2', 'r3'], `${tag}: rule order down the left`);
    assert.deepEqual(Rt.sort((p, q) => p.y - q.y).map(Z => Z.id), ['hors', 'r4', 'r5', 'r6'], `${tag}: Hors zones heading the right`);
    for (const Z of Zs) {
      assert.ok(!overlap(Z, S), `${tag}: ${Z.id} clear of the Sanctum`);
      assert.ok(Z.y + Z.h <= H.aisleY, `${tag}: ${Z.id} above the bottom aisle`);
      for (const W of Zs) if (W !== Z) assert.ok(!overlap(Z, W), `${tag}: ${Z.id} and ${W.id} overlap`);
      for (const b of P.blocks.filter(b => (b.room ?? 'hors') === Z.id && !b.temp)) assert.ok(inside(b, Z), `${tag}: ${b.name} inside ${Z.id}`);
      const C = P.computers.get(Z.id), left = Z.x < H.entry.x;
      assert.equal(C?.length, 3, `${tag}: ${Z.id} has its computer`);
      for (const c of C) {
        assert.ok(c.x > Z.x && c.x < Z.x + Z.w && c.y > Z.y && c.y < Z.y + Z.h, `${tag}: ${Z.id} computer in its cell`);
        assert.ok(left ? c.x > Z.x + Z.w / 2 : c.x < Z.x + Z.w / 2, `${tag}: ${Z.id} computer on its Sanctum side`);
        for (const b of P.blocks) assert.ok(!(c.x > b.x && c.x < b.x + b.w && c.y > b.y && c.y < b.y + b.h), `${tag}: ${Z.id} computer clear of ${b.name}`);
      }
    }
    assert.equal(P.overflow, 0, `${tag}: no overflow (Review 1)`);
  }
  // Review 2: a room with more desks than its cell holds grows down; its side's next room starts below it, the other side unchanged
  const base = planLayout(null, sessions, 0, {}, SCENE, layoutDepartments, R);
  const busy = sessions.concat(Array.from({ length: 7 }, (_, i) => d(`x${i}`, 1, 'r1')));
  const P = planLayout(null, busy, 0, {}, SCENE, layoutDepartments, R), H = hallOf(P.bays);
  const zs = (Q, HH) => Object.fromEntries(zonesOf(Q.blocks, HH).map(Z => [Z.id, Z])), Z0 = zs(base, hallOf(base.bays)), Z1 = zs(P, H);
  assert.ok(Z1.r1.h > Z0.r1.h, 'r1 grows');
  assert.ok(Z1.r2.y >= Z1.r1.y + Z1.r1.h, 'r2 below it');
  for (const k of ['hors', 'r4', 'r5']) assert.ok(Z1[k].y <= Z0[k].y + (H.h - hallOf(base.bays).h) && Z1[k].x === Z0[k].x, `${k} on the other side keeps its column`);
  for (const b of P.blocks.filter(b => b.room === 'r1')) assert.ok(inside(b, Z1.r1), `${b.name} inside r1`);
  assert.equal(P.overflow, 0);
  // Review 5: the break-out room fenced under the right side's last room
  const T = planLayout(null, sessions.concat(d('t', 2, null, true)), 0, {}, SCENE, layoutDepartments, R), HT = hallOf(T.bays);
  const ZT = zonesOf(T.blocks, HT), temp = ZT.find(Z => Z.kind === 'temp'), r6 = ZT.find(Z => Z.id === 'r6');
  assert.ok(temp && temp.gates.length > 0, 'the break-out room fenced, gated');
  assert.ok(temp.x >= HT.sides.R.x0 && temp.y >= r6.y + r6.h - 2, 'under the right side\'s last room');
}

// The mirror hall's walks (Task 5): from a seat in every place to the queue and back, and from the entry: never through
// another room's cell, into the Sanctum only from the own side's corridor, no diagonal leg.
{
  const R = Array.from({ length: 7 }, (_, i) => ({ id: `r${i}`, name: `R${i}`, pattern: `**/r${i}/**`, color: '#123456' }));
  const d = (name, n, room) => ({ name, color: '#fff', ids: ids(name, n), ...(room && { room }) });
  const sessions = R.map((r, i) => d(`d${i}`, 2, r.id)).concat(d('h', 2));
  const P = planLayout(null, sessions, 0, {}, SCENE, layoutDepartments, R), H = hallOf(P.bays);
  const Zs = zonesOf(P.blocks, H).filter(Z => Z.kind === 'room');
  const walk = (a, path) => {
    const pts = [a];
    for (const q of path) {
      const p = pts.at(-1);
      assert.ok(p.x === q.x || p.y === q.y, `diagonal leg ${p.x},${p.y} -> ${q.x},${q.y}`);
      const n = Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y));
      for (let i = 1; i <= n; i++) pts.push({ x: p.x + (q.x - p.x) * i / n, y: p.y + (q.y - p.y) * i / n });
    }
    return pts;
  };
  const strictIn = (p, Z) => p.x > Z.x + 1 && p.x < Z.x + Z.w - 1 && p.y > Z.y + 1 && p.y < Z.y + Z.h - 1;
  const check = (pts, own, tag) => {
    for (const p of pts) for (const Z of Zs) if (Z !== own) assert.ok(!strictIn(p, Z), `${tag}: crosses ${Z.id} at ${p.x},${p.y}`);
    const cx = own.x < H.entry.x ? H.corridors[0] : H.corridors[1];
    for (let i = 1; i < pts.length; i++) if (roomOf(pts[i], H) === 'sanct' && roomOf(pts[i - 1], H) !== 'sanct')
      assert.ok(Math.abs(pts[i - 1].x - cx) <= SANCT_W / 2 + 6 && (cx < H.entry.x ? pts[i].x <= H.sanct.x0 + 1 : pts[i].x >= H.sanct.x1 - 1), `${tag}: enters the Sanctum from its own side (${pts[i].x},${pts[i].y})`);
    for (let i = 1; i < pts.length; i++) if ((roomOf(pts[i], H) === 'sanct') !== (roomOf(pts[i - 1], H) === 'sanct') && pts[i].y > WALL)
      assert.ok(H.lanes.some(l => Math.abs(l - pts[i].y) < 1), `${tag}: crosses the rail off a lane's opening (${pts[i].x},${pts[i].y})`);
  };
  for (const Z of Zs) {
    const b = P.blocks.find(b => (b.room ?? 'hors') === Z.id && !b.empty), id = P.desks.find(k => k.dept === b.name && k.id)?.id, seat = P.seats.get(id);
    for (const q of [H.queue[0], H.queue.at(-1)]) {
      check(walk(seat, route(seat, q, P.blocks, H)), Z, `${Z.id} -> queue`);
      check(walk(q, route(q, seat, P.blocks, H)), Z, `queue -> ${Z.id}`);
    }
    for (const pts of [walk(H.entry, route(H.entry, seat, P.blocks, H)), walk(seat, route(seat, H.entry, P.blocks, H))]) {
      for (const p of pts) for (const W of Zs) if (W !== Z) assert.ok(!strictIn(p, W), `entry <-> ${Z.id}: crosses ${W.id}`);
      const cx = Z.x < H.entry.x ? H.corridors[0] : H.corridors[1];
      assert.ok(pts.some(p => p.x === cx), `entry <-> ${Z.id}: by its side's corridor`);
    }
  }
}

// The mirror places: the first ceil(n / 2) rules down the left, Hors zones heading the right, then the other rules.
{
  const ids7 = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6'];
  assert.deepEqual(mirrorPlaces(ids7), [{ key: 'r0', side: 'L', row: 0 }, { key: 'r1', side: 'L', row: 1 }, { key: 'r2', side: 'L', row: 2 },
    { key: 'r3', side: 'L', row: 3 }, { key: 'hors', side: 'R', row: 0 }, { key: 'r4', side: 'R', row: 1 }, { key: 'r5', side: 'R', row: 2 },
    { key: 'r6', side: 'R', row: 3 }]);
  assert.deepEqual(mirrorPlaces([]), [{ key: 'hors', side: 'R', row: 0 }]);
  for (let n = 1; n <= 8; n++) {
    const ids = Array.from({ length: n }, (_, i) => `r${i}`), P = mirrorPlaces(ids), count = s => P.filter(p => p.side === s).length;
    assert.deepEqual(P.map(p => p.key).sort(), ids.concat('hors').sort(), `${n}: every rule once, Hors zones once`);
    assert.deepEqual(P.find(p => p.key === 'hors'), { key: 'hors', side: 'R', row: 0 }, `${n}: Hors zones heads the right`);
    assert.ok(Math.abs(count('L') - count('R')) <= 1, `${n}: balanced`);
  }
}

// The mirror hall's walks to the bottom aisle (final review): the gate, the braziers' spots and the Watchman's post lie under
// the Sanctum; a desk's walk there keeps to its side's corridor then the aisle, never through the Sanctum nor past
// its target and back; from a queue slot, out by the Sanctum's open bottom.
{
  const R = Array.from({ length: 7 }, (_, i) => ({ id: `r${i}`, name: `R${i}`, pattern: `**/r${i}/**`, color: '#123456' }));
  const d = (name, n, room) => ({ name, color: '#fff', ids: ids(name, n), ...(room && { room }) });
  const P = planLayout(null, R.map((r, i) => d(`d${i}`, 3, r.id)).concat(d('h', 3)), 0, {}, SCENE, layoutDepartments, R), H = hallOf(P.bays);
  const low = [H.entry, { x: H.entry.x - 23, y: H.aisleY }, { x: H.entry.x + 23, y: H.aisleY }, { x: H.entry.x + 36, y: H.entry.y - 6 }];
  const pts = (a, path) => { const out = [a]; for (const q of path) { const p = out.at(-1), n = Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)); assert.ok(p.x === q.x || p.y === q.y, 'diagonal'); for (let i = 1; i <= n; i++) out.push({ x: p.x + (q.x - p.x) * i / n, y: p.y + (q.y - p.y) * i / n }); } return out; };
  for (const [id, seat] of P.seats) for (const q of low) for (const [a, b] of [[seat, q], [q, seat]]) {
    const w = pts(a, route(a, b, P.blocks, H)), tag = `${id} ${a === seat ? '->' : '<-'} ${q.x},${q.y}`;
    assert.ok(!w.some(p => roomOf(p, H) === 'sanct'), `${tag}: through the Sanctum`);
    const xs = w.filter(p => p.y >= H.aisleY).map(p => p.x), dir = Math.sign(xs.at(-1) - xs[0]);
    assert.ok(xs.every((x, i) => !i || (x - xs[i - 1]) * dir >= 0), `${tag}: past its target and back along the aisle`);
    assert.deepEqual(w.at(-1), { x: b.x, y: b.y }, tag);
  }
  for (const slot of [H.queue[0], H.queue.at(-1)]) for (const [a, b] of [[slot, H.entry], [H.entry, slot]]) {
    const w = pts(a, route(a, b, P.blocks, H));
    assert.ok(w.every(p => p.x >= H.sanct.x0 && p.x <= H.sanct.x1), 'queue <-> gate: by the Sanctum\'s open bottom, never out to a corridor');
  }
}

// The mirror hall's props: none under a queue slot, nor in the Sanctum but its own furniture round the Magos's desk.
for (const size of [SCENE, { w: 700, h: 500 }, { w: 900, h: 700 }]) {
  const H = hallOf(0, size), { props } = propsOf(H);
  for (const [name, x, y] of props) {
    const m = MAPS[name], w = m[0].length / RES, h = m.length / RES;
    for (const q of H.queue) assert.ok(!(q.x > x - 2 && q.x < x + w + 2 && q.y > y && q.y < y + h + 4), `${size.w}x${size.h}: ${name} at ${x},${y} under queue slot ${q.x},${q.y}`);
    if (y > WALL && y + h < H.aisleY - 30) assert.ok(x + w <= H.sanct.x0 || x >= H.sanct.x1 || y + h < H.magos.y + 60, `${size.w}x${size.h}: ${name} at ${x},${y} in the Sanctum's line`);
  }
}


// ---- behaviour: a shell at the room's computer, a nap at the desk (actors.js) ----
// The mirror hall (personal fork): a shell runs at its room's computer, a nap at its own desk.
const R = [{ id: 'rA', name: 'A', pattern: '**', color: '#aa0000' }, { id: 'rB', name: 'B', pattern: '**', color: '#00bb00' }];
const depts = [{ name: 'Ad', color: '#fff', ids: ids('Ad', 3), room: 'rA' }, { name: 'Bd', color: '#fff', ids: ids('Bd', 1), room: 'rB' },
  { name: 'out', color: '#fff', ids: ids('out', 1), temp: true }, { name: 'h', color: '#fff', ids: ids('h', 1) }];
const P = planLayout(null, depts, 0, {}, SCENE, layoutDepartments, R), H = hallOf(P.bays);
const now = Date.now(), napped = now - (settings.napMin + 1) * 60_000;
const sess = (id, dept, status, extra) => ({ id, dept, status, sinceMs: now, context: null, ...extra });
const roster = [sess('Ad-0', 'Ad', 'shell'), sess('Ad-1', 'Ad', 'busy'), sess('Ad-2', 'Ad', 'shell'), sess('Bd-0', 'Bd', 'shell'),
  sess('out-0', 'out', 'shell', { temp: true }), sess('h-0', 'h', 'idle', { sinceMs: napped })];
const c = new Cast();
assert.equal(c.napping(roster, H.refectory, now).size, 0, 'no bench on the mirror hall: nobody leaves their desk to nap');
c.sync(roster, P.seats, () => '#fff', P.consoleSeats, P.blocks, H, P.computers);
const dest = id => c.actors.get(id).target;
const A = P.computers.get('rA'), B = P.computers.get('rB');
assert.deepEqual([dest('Ad-0'), dest('Ad-2')].map(d => [d.x, d.y, d.pose]), [[A[0].x, A[0].y, 'cog'], [A[1].x, A[1].y, 'cog']], 'room A\'s shells at A\'s computer');
assert.deepEqual([dest('Bd-0').x, dest('Bd-0').y, dest('Bd-0').pose], [B[0].x, B[0].y, 'cog'], 'room B\'s shell at B\'s');
assert.deepEqual([dest('out-0').x, dest('out-0').y, dest('out-0').pose], [P.seats.get('out-0').x, P.seats.get('out-0').y, 'desk'], 'the break-out room runs its shells at its desk');
assert.deepEqual([dest('h-0').x, dest('h-0').y, dest('h-0').pose], [P.seats.get('h-0').x, P.seats.get('h-0').y, 'desk'], 'a napper keeps its desk');
// a Hors zones shell goes to Hors zones' computer
c.sync(roster.map(s => (s.id === 'h-0' ? { ...s, status: 'shell' } : s)), P.seats, () => '#fff', P.consoleSeats, P.blocks, H, P.computers);
assert.deepEqual([dest('h-0').x, dest('h-0').y], [P.computers.get('hors')[0].x, P.computers.get('hors')[0].y]);
// the strip keeps its benches
assert.deepEqual([...new Cast().napping([sess('n', 'a', 'idle', { sinceMs: napped })], stripOf(800).refectory, now)], ['n'], 'strip: napping still on a bench');

// resized: a hall actor stays on its side, a Sanctum actor keeps its slot
{
  const W = { w: 760, h: SCENE.h }, H1 = hallOf(0, W), cast = new Cast();
  cast.hall = H;
  const left = { id: 'l', x: H.sides.L.x1 - 4, y: 120 }, right = { id: 'r', x: H.sides.R.x0 + 4, y: 120 }, q = { id: 'q', ...H.queue[2] };
  for (const a of [left, right, q]) cast.actors.set(a.id, a);
  cast.resized(H, H1);
  assert.ok(left.x >= H1.sides.L.x0 && left.x <= H1.corridors[0], 'left stays left');
  assert.ok(right.x >= H1.corridors[1] && right.x <= H1.sides.R.x1, 'right stays right');
  assert.deepEqual([q.x, q.y], [H1.queue[2].x, H1.queue[2].y], 'its queue slot');
  assert.equal(roomOf(q, H1), 'sanct');
}

// ---- the sleep tag (overlay.js): only in the rooms plan ----
// The sleep tag (Review 4): past napMin idle, '💤 N min' in whole minutes; nothing busy, asking, backgrounded or under napMin.
{

  const napMin = settings.napMin, q = questions.on;
  settings.napMin = 10; questions.on = true;
  const now = 10 ** 13, a = (min, s = {}) => ({ id: 'x', pose: 'desk', s: { status: 'idle', sinceMs: now - min * 60_000, ...s } });
  assert.equal(sleepText(a(9), now), '');
  assert.equal(sleepText(a(12.5), now), '💤 12 min');
  assert.equal(sleepText(a(12.5, { status: 'busy' }), now), '');
  assert.equal(sleepText(a(12.5, { question: 'ok?' }), now), '');
  assert.equal(sleepText(a(12.5, { background: true }), now), '');
  assert.equal(sleepText({ ...a(12.5), pose: 'walk' }, now), '', 'gone the tick it gets up');
  assert.equal(sleepText({ ...a(12.5), h: {} }, now), '', 'adepts never sleep');
  settings.napMin = napMin; questions.on = q;
}
{
  const now = 10 ** 13, a = { id: 'x', pose: 'desk', s: { status: 'idle', sinceMs: now - 600 * 60_000 } };
  assert.ok(asleep(a, now));
  setHallPlan('open');
  assert.ok(!asleep(a, now) && sleepText(a, now) === '', 'open space: a scribe at its desk is never a tagged sleeper (it naps on a bench)');
  setHallPlan('rooms');
}
// a department's plaque may run past its block: to the next block on its row, else to its room's edge
{
  const { plaqueRoom } = await import('./overlay.js');
  const zone = { x: 10, y: 80, w: 200, h: 58 }, a = { x: 13, y: 80, w: 50, h: 56, zone }, b = { x: 67, y: 80, w: 50, h: 56, zone }, c = { x: 13, y: 144, w: 50, h: 56, zone };
  assert.equal(plaqueRoom(a, [a, b, c]), b.x - 4 - (a.x + 2), 'up to the next block on its row');
  assert.equal(plaqueRoom(b, [a, b, c]), zone.x + zone.w - 2 - (b.x + 2), 'the last on its row: up to the cell\'s edge');
  assert.equal(plaqueRoom(c, [a, b, c]), zone.x + zone.w - 2 - (c.x + 2), 'alone on its row');
  assert.ok(plaqueRoom(a, [a, b, c]) >= a.w - 4, 'never narrower than its block');
}
// no floor channel in the rooms plan: nothing runs through a room (flat props, 39° plan)
{
  const { roomPlan } = await import('./isohall.js');
  for (const size of [SCENE, { w: 760, h: 520 }]) {
    assert.deepEqual(propsOf(hallOf(0, size)).channels, [], 'no vertical channel');
    assert.ok(!roomPlan(hallOf(0, size)).surfaces.some(s => s.name === 'channel'), '39°: no channel strip');
  }
  setHallPlan('open');
  assert.ok(propsOf(hallOf(0)).channels.length && roomPlan(hallOf(0)).surfaces.some(s => s.name === 'channel'), 'the open space keeps its channels');
}
setHallPlan('open');
console.log('hallplan ok');
