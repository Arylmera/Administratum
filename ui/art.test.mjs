import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { decodePng } from './png.js';
import { loadSheet } from './art.js';
import { BASE } from './theme.js';
import { SCRIBE, SCRIBE_AT, MAPS } from './sprites.js';

// A PNG as an editor might write it: any colour type / depth, a chosen filter per row.
function encode(w, h, type, depth, rows, filters, { plte, trns } = {}) {
  const ch = { 6: 4, 2: 3, 3: 1 }[type], bpp = Math.max(1, (ch * depth) / 8), stride = Math.ceil((w * ch * depth) / 8);
  const out = [];
  rows.forEach((row, y) => {
    const f = filters[y % filters.length], prev = y ? rows[y - 1] : new Uint8Array(stride);
    out.push(f);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      out.push((row[i] - pred) & 255);
    }
  });
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length); b.write(t, 4); Buffer.from(d).copy(b, 8); return b; }; // CRC unchecked
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w); ihdr.writeUInt32BE(h, 4); ihdr[8] = depth; ihdr[9] = type;
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), ...(plte ? [chunk('PLTE', plte)] : []),
    ...(trns ? [chunk('tRNS', trns)] : []), chunk('IDAT', zlib.deflateSync(Buffer.from(out))), chunk('IEND', [])]));
}
const px = (img, x, y) => [...img.rgba.subarray((y * img.w + x) * 4, (y * img.w + x) * 4 + 4)];

// RGBA and RGB through every filter type.
const W = 5, H = 5, colour = (x, y) => [x * 50, y * 50, (x * y * 13) & 255, x === 2 ? 0 : 255];
const rgbaRows = Array.from({ length: H }, (_, y) => Uint8Array.from({ length: W * 4 }, (_, i) => colour(i >> 2, y)[i & 3]));
for (const f of [0, 1, 2, 3, 4]) {
  const img = await decodePng(encode(W, H, 6, 8, rgbaRows, [f]));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) assert.deepEqual(px(img, x, y), colour(x, y), `RGBA filter ${f} at ${x},${y}`);
}
const rgbRows = rgbaRows.map(r => Uint8Array.from({ length: W * 3 }, (_, i) => r[(i / 3 | 0) * 4 + i % 3]));
const rgb = await decodePng(encode(W, H, 2, 8, rgbRows, [4, 1, 3, 2, 0]));
assert.deepEqual(px(rgb, 3, 2), [...colour(3, 2).slice(0, 3), 255]);
// Indexed, 8 and 4 bit, index 0 transparent.
const plte = [0, 0, 0, 255, 0, 0, 0, 255, 0], trns = [0];
const idx = (x, y) => (x + y) % 3;
const rows8 = Array.from({ length: H }, (_, y) => Uint8Array.from({ length: W }, (_, x) => idx(x, y)));
const rows4 = rows8.map(r => Uint8Array.from({ length: Math.ceil(W / 2) }, (_, i) => (r[2 * i] << 4) | (r[2 * i + 1] ?? 0)));
for (const [depth, rows] of [[8, rows8], [4, rows4]]) {
  const img = await decodePng(encode(W, H, 3, depth, rows, [0, 1, 2, 3, 4], { plte, trns }));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    assert.deepEqual(px(img, x, y), [...plte.slice(i * 3, i * 3 + 3), i ? 255 : 0], `indexed ${depth} bit at ${x},${y}`);
  }
}
await assert.rejects(decodePng(new Uint8Array(16)), /not a PNG/);

// key.gpl: a unique colour per palette char, each within a few steps of its Tier II colour (same look).
const key = fs.readFileSync(new URL('./art/key.gpl', import.meta.url), 'utf8').split('\n')
  .map(l => l.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S)/)).filter(Boolean).map(m => ({ c: m[4], rgb: [+m[1], +m[2], +m[3]] }));
assert.deepEqual(key.map(k => k.c).sort(), Object.keys(BASE).sort(), 'key.gpl has every palette char once');
assert.equal(new Set(key.map(k => k.rgb.join())).size, key.length, 'key.gpl colours are unique');
for (const { c, rgb } of key) {
  const base = [1, 3, 5].map(i => parseInt(BASE[c].slice(i, i + 2), 16));
  assert.ok(rgb.every((v, i) => Math.abs(v - base[i]) <= 4), `key '${c}' strays from Tier II`);
}

// The scribe sheet: the frames sprites.js expects, anchors inside sensible bounds.
const scribe = await loadSheet('scribe');
for (const dir of ['down', 'up', 'right']) for (const i of [0, 1, 2]) assert.deepEqual(scribe.frames[`${dir} ${i}`], SCRIBE[dir][i]);
assert.deepEqual(scribe.frames.arm, MAPS.ARM);
assert.deepEqual(SCRIBE_AT, { feet: { x: 8, y: 17 }, arm: { x: 14, y: 2 }, armL: { x: 0, y: 2 }, scroll: { x: 14, y: 8 } });
console.log('art ok');
