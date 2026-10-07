import assert from 'node:assert/strict';
import { P39, floorToWorld, view, setView, onView, toScreen, toFloor, sceneSize } from './view.js';

// P39: the exact formula from the trial.
assert.deepEqual(P39(0, 0, 0), [0, 0]);
assert.deepEqual(P39(3, 0, 0), [3, 1]); // u/3 steps Y every 3 u
assert.deepEqual(P39(0, 3, 0), [-2, 1]); // w = floor(3*sqrt(2/3)) = 2
assert.deepEqual(P39(5, 0, 2), [5, 1 - 2]); // z shifts Y down only

// floorToWorld: floor (y >= WALL) vs the back wall band (y < WALL), default WALL = 40.
assert.deepEqual(floorToWorld(10, 40), [20, 0, 0]);
assert.deepEqual(floorToWorld(10, 60), [20, 40, 0]);
assert.deepEqual(floorToWorld(10, 10), [20, 0, 60]);
assert.deepEqual(floorToWorld(10, 60, 50), [20, 20, 0]); // explicit WALL

// view mode: default flat, setView switches, onView notifies, unknown mode falls back to flat.
assert.equal(view.mode, 'flat');
let seen = null;
const off = onView(m => { seen = m; });
setView('39');
assert.equal(view.mode, '39');
assert.equal(seen, '39');
setView('39'); // no-op: no re-notify on the same mode
seen = null;
setView('39');
assert.equal(seen, null);
setView('nope');
assert.equal(view.mode, 'flat');
off();

// Flat mode: toScreen/toFloor are the identity (z ignored).
setView('flat');
assert.deepEqual(toScreen(12, 34), [12, 34]);
assert.deepEqual(toScreen(12, 34, 5), [12, 34]);
assert.deepEqual(toFloor(12, 34), [12, 34]);

// sceneSize: flat is the hall's own size.
const hall = { w: 346, h: 226 };
assert.deepEqual(sceneSize(hall), { w: 346, h: 226 });

// 39 mode: sceneSize's bounding box contains every corner of the hall (floor + wall band up to WALL), and
// toFloor inverts toScreen for floor points (z = 0) to within one logical px, over a grid covering the hall.
setView('39');
const WALL = 40;
const size = sceneSize(hall, WALL);
assert.ok(size.w > 0 && size.h > 0);
for (const [x, y] of [[0, 0], [hall.w, 0], [0, WALL], [hall.w, WALL], [0, hall.h], [hall.w, hall.h]]) {
  const [sx, sy] = toScreen(x, y, 0, WALL);
  assert.ok(sx >= -0.001 && sx <= size.w + 0.001, `x ${x},${y} -> ${sx} outside [0, ${size.w}]`);
  assert.ok(sy >= -0.001 && sy <= size.h + 0.001, `x ${x},${y} -> ${sy} outside [0, ${size.h}]`);
}
let worst = 0;
for (let x = 0; x <= hall.w; x += 7) {
  for (let y = WALL; y <= hall.h; y += 7) {
    const [sx, sy] = toScreen(x, y, 0, WALL);
    const [fx, fy] = toFloor(sx, sy, WALL);
    worst = Math.max(worst, Math.abs(fx - x), Math.abs(fy - y));
  }
}
assert.ok(worst <= 1, `toFloor(toScreen(.)) off by ${worst} logical px, want <= 1`);
setView('flat');

console.log('view.test.mjs OK');
