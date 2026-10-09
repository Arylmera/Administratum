import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { decodePng } from './png.js';
import { loadSheet } from './art.js';
import { BASE } from './theme.js';
import { SCRIBE, SCRIBE_AT, ADEPT_AT, MAGOS_AT, WATCH, WATCH_AT, PROP_AT, MAPS, SHEET_OF, ROOM, RES, ART, FAMILIES39 } from './sprites.js';
import { THEMES, setTheme, t } from './theme.js';
import { BREAKOUT_SIZES } from './layout.js';

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

// The sheets: every family loads, no frame name is defined twice, characters have their walk frames and feet.
const sheets = Object.fromEntries(await Promise.all(fs.readdirSync(new URL('./art/', import.meta.url)).filter(f => f.endsWith('.json') && f !== 'faces.json') // the default art (themes' art: below; faces.json: faces.test.mjs)
  .map(async f => [f.slice(0, -5), await loadSheet(f.slice(0, -5))])));
const owner = {};
for (const [fam, sh] of Object.entries(sheets)) for (const n of Object.keys(sh.frames)) {
  if (['scribe', 'adept', 'magos', 'watch', ...FAMILIES39].includes(fam) || fam.startsWith('room-')) continue; // characters (flat and 39°) and room tiles: named per family
  assert.ok(!owner[n], `frame ${n} in both ${owner[n]} and ${fam}`); owner[n] = fam;
}
for (const n of Object.keys(MAPS)) assert.ok(SHEET_OF[n] && sheets[SHEET_OF[n]], `MAPS.${n} has no sheet`);
assert.deepEqual(Object.keys(owner).sort(), Object.keys(MAPS).filter(n => SHEET_OF[n] !== 'scribe').sort(), 'every prop frame is a MAPS sprite');
for (const fam of ['scribe', 'adept', 'watch']) for (const dir of ['down', 'up', 'right']) for (const i of [0, 1, 2]) assert.ok(sheets[fam].frames[`${dir} ${i}`], `${fam} ${dir} ${i}`);
assert.deepEqual(SCRIBE_AT, { feet: { x: 8, y: 17 }, arm: { x: 14, y: 2 }, armL: { x: 0, y: 2 }, scroll: { x: 14, y: 8 } });
assert.deepEqual(ADEPT_AT, { feet: { x: 6, y: 14 } });
assert.deepEqual(WATCH_AT, { feet: { x: 8, y: 18 }, light: { x: 14, y: 14 } });
assert.ok(sheets.watch.frames.ring, 'watch ring');
assert.deepEqual(WATCH.left[0], WATCH.right[0].map(r => [...r].reverse().join('')));
assert.deepEqual(MAGOS_AT, { arm: { x: 0, y: 0 }, chest: { x: 13, y: 15 }, eyeL: { x: 13, y: 9.5 }, eyeR: { x: 14.5, y: 9.5 } });
assert.ok(sheets.magos.frames.body.every(r => r.startsWith('.'.repeat(10))), 'the Magos body leaves the arm columns to the arm frame');
assert.deepEqual(SCRIBE.left[0], SCRIBE.right[0].map(r => [...r].reverse().join('')));
// Prop anchors: the ones the drawing code reads exist, and every point / rect lies on the art-pixel grid.
const need = { DESK: ['screen', 'lamp', 'seals', 'candle', 'slate', 'shadow', 'paper', 'pile', 'cog', 'puff'],
  LECTERN: ['screen', 'lamp', 'seals', 'candle', 'slate', 'shadow', 'paper', 'pile', 'cog', 'puff'],
  CONSOLE: ['screen', 'lamp', 'seals', 'shadow', 'paper', 'pile', 'light'], COGITATOR: ['screen', 'wave', 'bars', 'lamps', 'drums', 'vents'],
  GATE: ['entry', 'opening', 'leafL', 'leafR', 'slide'], SKULL: ['centre', 'carry', 'beam'] };
for (const [name, keys] of Object.entries(need)) for (const k of keys) {
  assert.ok(PROP_AT[name]?.[k], `PROP_AT.${name}.${k}`);
  for (const v of [PROP_AT[name][k]].flat(2)) assert.ok(Number.isInteger(v * RES), `PROP_AT.${name}.${k} off the art grid`);
}
assert.equal(PROP_AT.DESK.seals.length, 3, 'a desk keeps up to 3 commit seals');
assert.deepEqual(PROP_AT.GATE.opening, [8, 5, 16, 22]);
// Room tiles: every tile scene.js draws exists, fill rules are known, nine-slice edges fit, `top` rows match their tile.
const scene = fs.readFileSync(new URL('./scene.js', import.meta.url), 'utf8');
const drawn = new Set([...scene.matchAll(/tile\(g2?, '([^']+)'/g)].map(m => m[1]));
for (const d of ['sanctum', 'refectory']) for (const s of ['open', 'closed']) drawn.add(`door ${d} ${s}`);
for (const b of ['beacon on', 'beacon off', 'beacon cage']) drawn.add(b);
assert.ok(drawn.size > 20, 'found the tiles scene.js draws');
for (const n of drawn) assert.ok(ROOM.frames[n], `room tile '${n}' is missing`);
for (const [n, t] of Object.entries(ROOM.tiles)) {
  assert.ok(['repeat', 'repeat-x', 'repeat-y', 'nine', 'once', undefined].includes(t.fill), `${n}: fill ${t.fill}`);
  const f = ROOM.frames[n];
  if (t.fill === 'nine') assert.ok(2 * t.edge < f.length && 2 * t.edge < f[0].length, `${n}: edges larger than the tile`);
  if (t.top) assert.deepEqual([ROOM.frames[t.top].length, ROOM.frames[t.top][0].length], [f.length, f[0].length], `${n}: top tile size`);
}
for (const n of ['door sanctum open', 'door sanctum closed', 'door refectory open', 'door refectory closed']) assert.ok(ROOM.anchors[n]?.door, `${n}: door anchor`);
// Themes' own art: only families a theme declares, each frame redrawn at the default's size, anchors known by name.
const dirs = fs.readdirSync(new URL('./art/', import.meta.url), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
for (const id of dirs) assert.ok(THEMES[id]?.art?.length, `ui/art/${id}/ is no theme's art (theme.art)`);
for (const [id, fams] of Object.entries(ART.themed)) for (const [fam, sh] of Object.entries(fams)) {
  assert.ok(fs.existsSync(new URL(`./art/${id}/${fam}.png`, import.meta.url)), `${id}/${fam}.png`);
  for (const [n, f] of Object.entries(sh.frames)) {
    const d = ART.base[fam].frames[n];
    assert.ok(d, `${id}/${fam}: '${n}' is not a frame of ${fam}`);
    assert.deepEqual([f.length, f[0].length], [d.length, d[0].length], `${id}/${fam}: '${n}' must keep the default's size`);
  }
  for (const [n, a] of Object.entries(sh.anchors)) for (const k of Object.keys(a)) assert.ok(ART.base[fam].anchors[n]?.[k] !== undefined, `${id}/${fam}: anchor ${n}.${k} unknown`);
}
// The Watchman's light source must sit on his `light` anchor: that pixel is non-transparent in every non-mirrored
// frame (flat left is a mirror of right, with its own x; 39° has no mirrors), base art and every theme with its own
// watch/watch39 sheet. Mutation-check: nudging a world's light anchor a few px onto empty pixels in its JSON must
// fail this (checked by hand, not re-run here, since it would mean editing a committed art file).
const litAt = (frames, name, [ax, ay]) => assert.ok(frames[name]?.[ay]?.[ax] && frames[name][ay][ax] !== '.', `${name}: light anchor (${ax},${ay}) is off the art`);
for (const [world, flat, w39] of [['base', sheets.watch, sheets.watch39], ...Object.entries(ART.themed).filter(([, f]) => f.watch).map(([id, f]) => [id, f.watch, f.watch39])]) {
  const [fx, fy] = flat.anchors.light;
  for (const dir of ['up', 'down', 'right']) for (const i of [0, 1, 2]) litAt(flat.frames, `${dir} ${i}`, [fx, fy]);
  litAt(flat.frames, 'ring', [fx, fy]);
  if (w39 && Object.keys(w39.frames).length) {
    const [wx, wy] = w39.anchors.light;
    for (const dir of ['E', 'W', 'S', 'N']) for (const i of [0, 1, 2]) litAt(w39.frames, `${dir} ${i}`, [wx, wy]);
    litAt(w39.frames, 'ring', [wx, wy]);
  }
}
// Switching: a theme's frames come in, a theme without art keeps the default, and back again.
const plain = { banner: MAPS.BANNER, table: MAPS.TABLE };
setTheme('cyber');
assert.notDeepEqual(MAPS.BANNER, plain.banner, 'cyber brings its banner');
assert.equal(SHEET_OF.BANNER, 'cyber/walls');
setTheme('forge'); // a palette-only theme
assert.equal(MAPS.BANNER, plain.banner, 'a theme without art draws the default');
assert.equal(MAPS.TABLE, plain.table);
assert.equal(SHEET_OF.BANNER, 'walls');
setTheme('tier2');
assert.equal(MAPS.BANNER, plain.banner);
assert.equal(SHEET_OF.BANNER, 'walls');

// the break-out room: every theme draws all of its frames, at the contract's sizes, and names its room
for (const id of Object.keys(THEMES)) {
  setTheme(id);
  for (const [n, [w, h]] of Object.entries(BREAKOUT_SIZES)) {
    assert.ok(MAPS[n], `${id}: ${n}`);
    assert.deepEqual([Math.max(...MAPS[n].map(r => r.length)), MAPS[n].length], [w, h], `${id}: ${n} size`);
  }
  assert.ok(t('breakout') && t('breakout') !== 'breakout', `${id}: room name`);
}
setTheme('tier2');
console.log('art ok');
