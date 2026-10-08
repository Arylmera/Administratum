import assert from 'node:assert/strict';
import { outlineMask } from './outline.js';
// a 1x1 opaque pixel in a 3x3 sprite: the mask is 5x5 (1 px border added), the 4-neighbour ring set, the pixel and
// the diagonals not set
const a = new Uint8ClampedArray(9); a[4] = 255;
const m = outlineMask(a, 3, 3);
assert.equal(m.length, 25);
const on = [...m].flatMap((v, i) => (v ? [[i % 5, Math.floor(i / 5)]] : []));
assert.deepEqual(on, [[2, 1], [1, 2], [3, 2], [2, 3]]);
// faint pixels (alpha < 128: shadows, glows) do not get an outline
const f = new Uint8ClampedArray(9); f[4] = 100;
assert.ok(outlineMask(f, 3, 3).every(v => !v));
console.log('outline ok');
