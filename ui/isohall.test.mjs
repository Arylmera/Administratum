import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setTheme, T } from './theme.js';
import './themes.js';
import { roomPlan, bounds, renderHall39, buildHall39, placeProps } from './isohall.js';
import { hung as hungOn } from './scene.js';
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
  assert.ok(slabs.every(s => s.z1 === 8), `${tag}: walls down, every inner wall 4 logical px`);
  const [back] = named('slab', 'refectorium/sanctum'); // the wall between refectorium and sanctum
  assert.equal(named('slab', 'bays').length, hall.bays ? 1 : 0, tag);
  // the east wall's door openings at the flat doors' y: the doorways (hall.refOut, doorOut) stand in gaps
  const east = named('slab', 'east wall');
  for (const door of [hall.refOut, hall.doorOut]) {
    const v = 2 * (door.y - WALL);
    assert.ok(!east.some(s => v >= s.v0 && v < s.v1), `${tag}: a door at y ${door.y} is open`);
  }
  // walls down: an open gap between two low posts, no lintel, no door leaves
  assert.ok(!surfaces.some(s => s.kind === 'door' || s.name === 'lintel'), tag);
  assert.equal(named('box', 'jamb').length, 4, tag);
  assert.ok(named('box', 'jamb').every(s => s.z1 === 12), tag);
  assert.equal(east.length, 3, `${tag}: two openings`);
  assert.ok(east.every(s => s.u0 === 2 * hall.sw && s.u1 === 2 * hall.rx), tag);
  // props: hung ones on a wall plane within its height, standing ones on their room's floor, never on a wall band
  const fy = y => 2 * (y - WALL), band = [fy(hall.split), fy(hall.split + 30)], placed = placeProps(hall);
  assert.ok(placed.length > 40, tag);
  const hung = p => p.name === 'HANGING' || hungOn(p.name, p.y);
  const shelves = placed.filter(q => q.name === 'SHELF');
  const roomOf = p => (p.x + p.map[0].length / 4 <= hall.sw ? 'scriptorium' : p.yb < hall.split - 6 ? 'refectorium' : 'sanctum');
  const TOL = 2; // art px: a flat frame may overlap its room's wall by a pixel (the censer by the east wall)
  assert.ok(placed.some(hung), tag);
  for (const p of placed) {
    const { u0, u1, v0, v1 } = p.foot, at = `${tag}: ${p.name} at (${u0}, ${v0}, ${p.z0})`;
    if (hung(p)) { // the north wall's hangings: on its plane, at their flat height
      assert.equal(p.on, 'wall', `${at}: hung on the north wall`);
      assert.ok(p.v0 <= 4, `${at}: on the north wall's plane`);
      assert.equal(p.z1, 2 * (WALL - p.y), `${at}: at its flat height`);
    }
    if (p.on === 'wall') {
      assert.ok(p.v0 <= 4, `${at}: only the north wall carries hangings (the sanctum's is low)`);
      assert.ok(u0 >= 0 && u1 <= U && p.z0 >= 0 && p.z1 <= Z, `${at}: within its wall`);
      continue;
    }
    if (p.z0) { // resting on a shelf's top, against the north wall
      assert.equal(p.v0, 4, `${at}: against the north wall`);
      assert.ok(shelves.some(q => q.foot.u0 <= (u0 + u1) / 2 && (u0 + u1) / 2 < q.foot.u1 && q.z1 === p.z0), `${at}: on a shelf's top`);
      continue;
    }
    const [floor] = named('floor', roomOf(p));
    assert.ok(u0 >= floor.u0 - TOL && u1 <= floor.u1 + TOL && v0 >= floor.v0 - TOL && v1 <= floor.v1 + TOL, `${at}: on the ${floor.name}'s floor`);
    const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
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
  for (const p of placed) for (const u of [p.foot.u0, p.foot.u1]) for (const v of [p.foot.v0, p.foot.v1]) for (const z of [p.z0, p.z1]) {
    const [X, Y] = P39(u, v, z);
    assert.ok(X + b.ox >= 0 && X + b.ox <= 2 * b.w && Y + b.oy >= 0 && Y + b.oy <= 2 * b.h, `${tag}: ${p.name} (${u}, ${v}, ${z}) outside`);
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
// Speed-ups of the render must not move a pixel: the char grid and the shading of the default hall and a big 2-bay
// hall, in Tier II and the vault, against hashes recorded before the T12 optimisation (iso.js box/outline, texOf).
// An art or layout change on purpose changes them: re-record (print the hash below) once the new look is checked.
const GRID = {
  'tier2 346x248 day': '7c59b58676e1', 'tier2 554x728 night': '1e511c8ef6dc', 'vault 346x248 day': 'b3f75bc3043f', 'vault 554x728 night': '52791b0ee72b',
};
for (const id of ['tier2', 'vault']) {
  setTheme(id);
  for (const [hall, day] of [[hallOf(0), true], [hallOf(2, { w: MAX_W, h: 600 }), false]]) {
    const { buf, shade } = renderHall39(hall, day), k = `${id} ${hall.w}x${hall.h} ${day ? 'day' : 'night'}`;
    const hash = createHash('sha1').update(buf.ch.join('')).update(new Uint8Array(shade.buffer)).digest('hex').slice(0, 12);
    assert.equal(hash, GRID[k], `${k}: the 39° background changed`);
  }
}
// The paint (buildHall39): the windows' glass takes the night colours at night (T.ink.windowNight), not its px colour.
{
  let D = null;
  globalThis.document = { createElement: () => ({ getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(4 * w * h) }), putImageData: img => { D = img.data; } }) }) };
  setTheme('tier2');
  const hall = hallOf(0), { buf, shade } = renderHall39(hall, false);
  buildHall39(hall, false);
  const night = T.ink.windowNight, i = buf.id.findIndex((k, j) => k === 6 && night[buf.ch[j]] && night[buf.ch[j]] !== T.px[buf.ch[j]] && !shade[j]);
  assert.ok(i >= 0, 'an unshaded glass pixel');
  const hex = night[buf.ch[i]], want = [1, 3, 5].map(k => parseInt(hex.slice(k, k + 2), 16));
  assert.deepEqual([...D.slice(4 * i, 4 * i + 3)], want, `glass '${buf.ch[i]}' in the night colour`);
  delete globalThis.document;
}
setTheme('tier2');
setView('flat');
assert.equal(SCENE.w, hallOf(0).w);
console.log('isohall ok');
