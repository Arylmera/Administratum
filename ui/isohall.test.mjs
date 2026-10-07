import assert from 'node:assert/strict';
import { roomPlan, bounds, renderHall39, placeProps } from './isohall.js';
import { hallOf, WALL, SCENE, MAX_W } from './layout.js';
import { P39 } from './iso.js';
import { setView, sceneSize, toScreen } from './view.js';

// 2 hall sizes (the minimum, a big window), each without and with bays
const halls = [hallOf(0), hallOf(2), hallOf(0, { w: MAX_W, h: 420 }), hallOf(2, { w: MAX_W, h: 420 })];
setView('39');
for (const hall of halls) {
  const tag = `${hall.w}x${hall.h}:${hall.bays}`, { U, V, Z, surfaces } = roomPlan(hall);
  const named = (kind, name) => surfaces.filter(s => s.kind === kind && s.name === name);
  assert.equal(Z, 2 * WALL);
  // the north wall at full height along the whole width, the west wall along the whole depth
  const north = surfaces.filter(s => s.kind === 'wall' && s.v0 === 0 && s.v1 === 1);
  assert.equal(Math.min(...north.map(s => s.u0)), 0, tag);
  assert.equal(Math.max(...north.map(s => s.u1)), U, tag);
  north.sort((a, b) => a.u0 - b.u0).forEach((s, i, a) => i && assert.equal(s.u0, a[i - 1].u1, `${tag}: north wall gap`));
  assert.ok(north.every(s => s.z0 === 0 && s.z1 === Z), tag);
  const [west] = named('wall', 'west');
  assert.ok(west && west.u0 === 0 && west.v0 === 0 && west.v1 === V && west.z1 === Z, tag);
  // every room's floor
  for (const room of ['scriptorium', 'refectorium', 'sanctum']) assert.equal(named('floor', room).length, 1, `${tag}: ${room} floor`);
  assert.equal(named('floor', 'scriptorium')[0].v1, V, `${tag}: the scriptorium's floor reaches the hall's bottom (bays)`);
  // cutaway inner walls, lower than the outer ones
  const slabs = surfaces.filter(s => s.kind === 'slab');
  assert.ok(slabs.length >= 6, tag);
  assert.ok(slabs.every(s => s.z1 < Z), tag);
  const [back] = named('slab', 'refectorium/sanctum'); // the sanctum's back wall, as tall as its flat wall band
  assert.equal(back.z1, 60, tag);
  assert.ok(slabs.every(s => s === back || s.z1 === 32), tag);
  assert.equal(named('slab', 'bays').length, hall.bays ? 1 : 0, tag);
  // the east wall's door openings at the flat doors' y: the doorways (hall.refOut, doorOut) stand in gaps
  const east = named('slab', 'east wall');
  for (const door of [hall.refOut, hall.doorOut]) {
    const v = 2 * (door.y - WALL);
    assert.ok(!east.some(s => v >= s.v0 && v < s.v1), `${tag}: a door at y ${door.y} is open`);
  }
  assert.equal(east.length, 3, `${tag}: two openings`);
  assert.ok(east.every(s => s.u0 === 2 * hall.sw && s.u1 === 2 * hall.rx), tag);
  // props: hung ones on a wall plane within its height, standing ones on their room's floor, never on a wall band
  const fy = y => 2 * (y - WALL), band = [fy(hall.split), fy(hall.split + 30)], placed = placeProps(hall);
  assert.ok(placed.length > 40, tag);
  for (const p of placed) {
    const { u0, u1, v0, v1 } = p.foot, cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, at = `${tag}: ${p.name} at (${u0}, ${v0}, ${p.z0})`;
    if (p.on === 'wall') {
      const north = p.v0 <= 4, plane = north ? { u0: 0, u1: U, z1: Z } : back;
      assert.ok(north || p.v0 === band[0] || p.v0 === band[0] - 1, `${at}: on a wall plane`);
      assert.ok(u0 >= plane.u0 && u1 <= plane.u1 && p.z0 >= 0 && p.z1 <= plane.z1, `${at}: within its wall`);
      continue;
    }
    if (p.z0) { assert.equal(p.v0, 4, `${at}: resting against the north wall`); continue; }
    assert.ok(surfaces.some(s => s.kind === 'floor' && cu >= s.u0 && cu < s.u1 && cv >= s.v0 && cv < s.v1), `${at}: on a floor`);
    assert.ok(!slabs.some(s => cu >= s.u0 && cu < s.u1 && cv >= s.v0 && cv < s.v1), `${at}: inside a wall`);
    assert.ok(!(cu >= back.u0 && v1 > band[0] && v1 <= band[1]), `${at}: standing on the sanctum's wall band`);
  }
  // nothing outside sceneSize once projected (bounds() is the same box)
  const sz = sceneSize(hall), b = bounds(hall);
  assert.deepEqual([b.w, b.h], [sz.w, sz.h], tag);
  assert.deepEqual(toScreen(0, WALL), [b.ox / 2, b.oy / 2], `${tag}: same offset as toScreen`);
  for (const s of surfaces) for (const u of [s.u0, s.u1]) for (const v of [s.v0, s.v1]) for (const z of [s.z0, s.z1]) {
    const [X, Y] = P39(u, v, z);
    assert.ok(X + b.ox >= 0 && X + b.ox <= 2 * b.w && Y + b.oy >= 0 && Y + b.oy <= 2 * b.h, `${tag}: ${s.kind} ${s.name} (${u}, ${v}, ${z}) outside`);
  }
}

// The render (pure part): the floor, the walls and the props all show; timing for the report.
for (const hall of [hallOf(0), hallOf(2, { w: MAX_W, h: 600 })]) {
  const t0 = performance.now(), { buf, shade, w, h } = renderHall39(hall, true), ms = performance.now() - t0;
  assert.equal(buf.w, 2 * w); assert.equal(buf.h, 2 * h);
  const ids = new Set(buf.id);
  for (const k of [1, 2, 3, 4, 5, 6, 10]) assert.ok(ids.has(k), `id ${k} drawn`);
  assert.ok(shade.some(a => a > 0.3), 'shading baked');
  console.log(`renderHall39 ${hall.w}x${hall.h} bays ${hall.bays}: ${buf.w}x${buf.h} art px, ${ms.toFixed(0)} ms`);
}
setView('flat');
assert.equal(SCENE.w, hallOf(0).w);
console.log('isohall ok');
