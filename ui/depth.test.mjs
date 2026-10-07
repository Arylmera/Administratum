import assert from 'node:assert/strict';
import { depth, on, setDepth, onDepth, footOf, shadowOf, silhouette, aoBands, casterOf, EFFECTS } from './depth.js';
import { hallOf } from './layout.js';

// Footprint: the opaque span of the frame's bottom 3 art rows, in logical px (RES 2).
const map = ['......', '..##..', '.####.', '......', '..##..', '...#..'];
assert.deepEqual(footOf(map), { x0: 1, w: 1 }); // the bottom 3 rows' opaque cols are 2..3: x0 1, w 1
assert.equal(footOf(['....', '....']), null);
const e = shadowOf(map, 10, 20);
assert.equal(e.cx, 10 + 1 + 0.5);
assert.equal(e.cy, 20 + 3); // the frame's bottom: 6 art rows = 3 logical px
assert.equal(e.ry, e.rx / 3);
assert.ok(e.rx >= 1.5, 'a floor shadow is a little wider than the footprint');
assert.equal(shadowOf(['..'], 0, 0), null);

// Settings: levels and which effect each turns on.
setDepth('off', true);
for (const k of EFFECTS) assert.equal(on(k), false, `off: ${k}`);
setDepth('subtle', true);
assert.deepEqual(EFFECTS.filter(on), ['contact', 'ao', 'motion']);
setDepth('full', false);
assert.deepEqual(EFFECTS.filter(on), ['contact', 'ao', 'motion', 'cast', 'height', 'parallax']);
setDepth('full', true);
assert.ok(on('dov'));
setDepth('bogus', false);
assert.equal(depth.level, 'subtle');
let heard = 0;
const stop = onDepth(() => heard++);
setDepth('full', false);
setDepth('full', false); // no change: no event
stop();
setDepth('off', false);
assert.equal(heard, 1);
setDepth('subtle', false);

// Silhouettes are cached per source canvas (the maker is injectable for node).
let made = 0;
silhouette.make = cv => ({ of: cv, n: ++made });
const a = {}, b = {};
assert.equal(silhouette(a), silhouette(a));
assert.notEqual(silhouette(a), silhouette(b));
assert.equal(made, 2);

// Ambient occlusion: bands inside the hall, one along the scriptorium's wall foot.
for (const bays of [0, 2]) {
  const H = hallOf(bays, { w: 520, h: 300 }), bands = aoBands(H);
  for (const r of bands) {
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= H.w && r.y + r.h <= H.h, `band inside the hall: ${JSON.stringify(r)}`);
    assert.ok(r.w > 0 && r.h > 0 && 'nsew'.includes(r.side));
  }
  assert.ok(bands.some(r => r.side === 'n' && r.x === 0 && r.y === 40 && r.w === H.sw), 'scriptorium wall foot');
  assert.ok(bands.some(r => r.side === 'e' && r.x + r.w === H.sw), 'east wall, scriptorium side');
}
// Cast shadows: by day one direction for everyone; at night the nearest coloured light in reach, fading with distance.
const day = casterOf(100, 100, [], 0.18), day2 = casterOf(10, 50, [], 0.18);
assert.deepEqual([day.from.x - 100, day.from.y - 100], [day2.from.x - 10, day2.from.y - 50]);
const lamps = [{ x: 0, y: 0, r: 20, color: 'c' }, { x: 30, y: 0, r: 20, color: 'c' }, { x: 12, y: 0, r: 40 }];
assert.equal(casterOf(10, 0, lamps, 0.78).from, lamps[0]); // the uncoloured one (a window) casts nothing
assert.equal(casterOf(22, 0, lamps, 0.78).from, lamps[1]);
assert.equal(casterOf(100, 0, lamps, 0.78), null);
assert.ok(casterOf(1, 0, lamps, 0.78).alpha > casterOf(15, 0, lamps, 0.78).alpha);
console.log('depth ok');
