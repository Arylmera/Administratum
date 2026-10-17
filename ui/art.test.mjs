import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { decodePng } from './png.js';
import { loadSheet } from './art.js';
import { BASE } from './theme.js';
import { SCRIBE, SCRIBE_AT, ADEPT, ADEPT_AT, ADEPT39, ADEPT39_AT, marked, MAGOS, MAGOS_AT, MAGOS39, SCRIBE39, WATCH, WATCH_AT, PROP_AT, MAPS, SHEET_OF, ROOM, RES, ART, FAMILIES39 } from './sprites.js';
import { THEMES, setTheme, t } from './theme.js';
import { BREAKOUT_SIZES } from './layout.js';
import { markOf, bodyOf, bodyOf39, liftOf } from './actors.js';
import { catalog } from '../tools/sprite_catalog.mjs';

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
assert.deepEqual(SCRIBE_AT, { feet: { x: 8, y: 17 }, arm: { x: 14, y: 9 }, armL: { x: 0, y: 9 }, scroll: { x: 14, y: 8 } }); // the mechadendrites hang from under the hood
assert.deepEqual(ADEPT_AT, { feet: { x: 6, y: 14 }, 'glyph down': { x: 3, y: 7 }, 'glyph up': { x: 3.5, y: 7 } });
assert.deepEqual(WATCH_AT, { feet: { x: 8, y: 18 }, light: { x: 14, y: 14 } });
assert.ok(sheets.watch.frames.ring, 'watch ring');
assert.deepEqual(WATCH.left[0], WATCH.right[0].map(r => [...r].reverse().join('')));
assert.deepEqual(MAGOS_AT, { arm: { x: 0, y: 0 }, chest: { x: 13, y: 15 }, eyeL: { x: 13, y: 9.5 }, eyeR: { x: 14.5, y: 9.5 }, claw: { x: 20.5, y: 17.5 } });
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
  for (const m of t.mix ?? []) assert.deepEqual([ROOM.frames[m].length, ROOM.frames[m][0].length], [f.length, f[0].length], `${n}: mix '${m}' size`);
  if (t.mix) assert.ok(t.fill === 'repeat' && !t.top, `${n}: mix only on a plain repeat`);
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
// The shell cog's turn (scene.js spinCog) is one set: a world that redraws one SHELL_COG frame redraws them all, so its
// turn never mixes in the 40k cog's frames.
const cogTurn = Object.keys(ART.base.workstations.frames).filter(n => n.startsWith('SHELL_COG_'));
assert.ok(cogTurn.length, 'the base art has the cog turn');
for (const [id, fams] of Object.entries(ART.themed)) {
  const own = Object.keys(fams.workstations?.frames ?? {}).filter(n => n.startsWith('SHELL_COG_'));
  if (own.length) assert.deepEqual(own.sort(), [...cogTurn].sort(), `${id}/workstations: the cog's whole turn or none`);
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
// the shut claw goes with the body it was drawn for: a world that redraws its Magos never wears the 40k claw
setTheme('tower');
assert.equal(MAGOS.claw, undefined, 'tower: no base claw over its own Magos');
assert.equal(MAGOS39.claw, undefined, 'tower: no base claw over its own 39° Magos');
// A scribe's arms (actors.js drawCarried): a world's own body has them, so no separate arms (never the 40k's lent over
// it), in both views; the 40k robe has none, so its art draws mechadendrites; a finished turn's scroll rises (liftOf),
// eased up over 0.3 s
const desk = status => ({ s: { status, context: null }, pose: 'desk', x: 50, y: 50, dir: 'up', wait: 0, fx: [] });
for (const id of ['cyber', 'orbital', 'tower', 'vault', 'darwin']) {
  setTheme(id);
  assert.deepEqual([MAPS.ARM, MAPS.ARM_L, SCRIBE39.arm, SCRIBE39.armL], [undefined, undefined, undefined, undefined], `${id}: its arms are its body's`);
  assert.equal(bodyOf(desk('busy')).map, SCRIBE.up[0], `${id}: at its desk, its back as it walks`);
}
setTheme('forge');
assert.ok(MAPS.ARM && MAPS.ARM_L && SCRIBE39.arm && SCRIBE39.armL, 'a palette-only theme keeps the base arms in both views');
setTheme('tier2');
assert.ok(MAGOS.claw && MAGOS39.claw, 'the base Magos has its claw in both views');
assert.equal(SHEET_OF.ARM, 'scribe');
assert.deepEqual([liftOf(desk('busy')).lift, liftOf({ ...desk('idle'), fx: [{ kind: 'task-done', t: 0.15 }] }).lift, liftOf({ ...desk('idle'), fx: [{ kind: 'task-done', t: 0.3 }] }).lift],
  [0, 2, 4], 'the finished scroll eases up');
// the adept's subagent kind glyph (actors.js): the built-in kinds by exact name in any case, any other the generic one
assert.deepEqual(['Explore', 'explore', 'PLAN', 'general-purpose', 'code-explorer', 'my-agent', 'agent', undefined, null].map(markOf),
  ['explore', 'explore', 'plan', 'general', 'custom', 'custom', 'custom', 'custom', 'custom']);
const KINDS = ['explore', 'plan', 'general', 'custom'];
const kindsDrawn = tag => { for (const [F, A, faces] of [[ADEPT, ADEPT_AT, ['down', 'up']], [ADEPT39, ADEPT39_AT, ['S', 'E', 'N', 'W']]]) for (const f of faces) {
  const by = KINDS.map(k => marked(F[f][0], F, A, f, k)), at = A[`glyph ${f}`], g = F.marks['glyph plan'];
  assert.equal(new Set([F[f][0], ...by].map(m => m.join('|'))).size, 5, `${tag} ${f}: each kind its own glyph, none the plain frame`);
  assert.equal(marked(F[f][0], F, A, f, 'explore'), by[0], `${tag} ${f}: one map per frame and kind (the sprite cache's identity)`);
  g.forEach((row, j) => [...row].forEach((c, i) => c === '.' || assert.equal(by[1][at.y * RES + j][at.x * RES + i], c, `${tag} ${f}: the plan glyph at its anchor`))); // '.' leaves the body
} };
kindsDrawn('tier2');
const basePlan = [ADEPT.marks['glyph plan'], ADEPT39.marks['glyph plan']];
assert.equal(marked(ADEPT.right[0], ADEPT, ADEPT_AT, 'right', 'explore'), ADEPT.right[0], 'the side view: no glyph');
const adept = kind => ({ h: { kind }, x: 50, y: 50, pose: 'console', target: { dir: 'up' } }); // at its console, its back to us
assert.equal(bodyOf(adept('Plan')).map, marked(ADEPT.up[0], ADEPT, ADEPT_AT, 'up', 'plan'), 'a Plan adept wears the plan glyph');
assert.equal(bodyOf39(adept('reviewer')).map, marked(ADEPT39.N[0], ADEPT39, ADEPT39_AT, 'N', 'custom'), 'a custom agent the generic one (39°)');
setTheme('forge');
assert.equal(Object.keys(ADEPT.marks).length, 4, 'forge: a palette-only theme wears the base glyphs');
for (const id of ['cyber', 'orbital', 'tower', 'vault', 'darwin']) { // a world's own adept wears its own glyphs, never the 40k ones
  setTheme(id);
  assert.notDeepEqual([ADEPT.marks['glyph plan'], ADEPT39.marks['glyph plan']], basePlan, `${id}: its own glyphs`);
  kindsDrawn(id);
}
setTheme('tier2');
// the floor's grate variants likewise: mixed in where the floor is the base one, dropped where a world redraws its floor
assert.deepEqual(ROOM.tiles.floor.mix, ['floor vent', 'floor bolts']);
setTheme('forge');
assert.equal(ROOM.tiles.floor.mix.length, 2, 'forge: a palette-only theme mixes the base grates');
setTheme('cyber');
assert.equal(ROOM.tiles.floor.mix?.length ?? 0, 0, 'cyber: its own floor, not the base grates');
setTheme('tier2');
{ // the mix, seeded by the cell: every variant shows, the plain grate stays the bulk, the same cell always the same frame
  const { cellFrame } = await import('./room.js'), seen = {};
  for (let y = 0; y < 10; y++) for (let x = 0; x < 40; x++) { const n = cellFrame('floor', x, y); seen[n] = (seen[n] ?? 0) + 1; assert.equal(cellFrame('floor', x, y), n); }
  for (const m of ROOM.tiles.floor.mix) assert.ok(seen[m] > 0, `floor: '${m}' never laid`);
  assert.ok(seen.floor > 300, 'floor: the plain grate is most cells');
}
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

// the sprite catalogue (viewer, galleries) lists only what the hall draws: the default art's second designs and door
// halves in the default world, never in a world whose own walls and doors lack them
const LENT = ['HANGING_B', 'SHELF_B', 'ROOM.door_sanctum_half', 'ROOM.door_refectory_half'];
const listed = id => { setTheme(id); return new Set(catalog().map(e => e.id)); };
for (const n of LENT) assert.ok(listed('tier2').has(n), `tier2 lists ${n}`);
for (const id of ['cyber', 'corpo', 'orbital', 'tower', 'vault']) { const s = listed(id); for (const n of LENT) assert.ok(!s.has(n), `${id} omits ${n}`); }
setTheme('tier2');
console.log('art ok');
