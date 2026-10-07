// Face sheets (faces.js): for every theme, each prop's faces rebuild today's flat frame pixel for pixel, the 39° frames
// in faces.png fit their boxes, and the reference 39° builder draws every kind. Run: node ui/faces.test.mjs
import assert from 'node:assert/strict';
import { MAPS } from './sprites.js';
import { THEMES, setTheme } from './theme.js';
import './themes.js';
import { sheetOf, composeFlat, build39, cols, FACES, FACE_OBJECTS } from './faces.js';

const diff = (a, b) => { let n = 0; a.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== b[y]?.[x]) n++; }); return n; };

// A recording z-buffer with the trial Buf's API (no projection: the builder's calls are what is checked).
const recorder = () => {
  const puts = [];
  const put = (u, v, z, c, id, face) => { if (c && c !== '.') puts.push({ u, v, z, c, face }); };
  return { puts, put, bill: (map, u, v, z) => map.forEach((row, r) => [...row].forEach(c => put(u, v, z + map.length - 1 - r, c, 0, 3))),
    box({ u0, u1, v0, v1, z0, z1, front, side, top, id }) {
      const J = cols(v1 - v0);
      for (let u = u0; u < u1; u++) for (let z = z0; z < z1; z++) put(u, v1 - 1, z, front(u - u0, z1 - 1 - z), id, 1);
      for (let v = v0; v < v1; v++) for (let z = z0; z < z1; z++) put(u1 - 1, v, z, side(Math.floor((v1 - 1 - v) / (2 / Math.sqrt(2 / 3))), z1 - 1 - z, J, z1 - z0), id, 2);
      for (let u = u0; u < u1; u++) for (let v = v0; v < v1; v++) put(u, v, z1, top(u - u0, Math.floor((v - v0) / (2 / Math.sqrt(2 / 3))), u1 - u0, J), id, 0);
    } };
};

let n = 0;
for (const id of Object.keys(THEMES)) {
  setTheme(id);
  for (const name of FACE_OBJECTS) {
    const s = sheetOf(name), today = MAPS[name];
    assert.ok(s, `${id} ${name}: no face sheet`);
    const flat = composeFlat(s);
    assert.equal(flat.length, today.length, `${id} ${name}: height`);
    assert.deepEqual(flat, today, `${id} ${name}: ${diff(flat, today)} pixels differ from today's frame`);
    // a flat-only retouch is really needed: without it the frame differs
    if (s.flatOnly.length) assert.ok(diff(composeFlat(s, { retouch: false }), today) > 0, `${id} ${name}: flat-only retouch changes nothing`);
    const b = recorder();
    build39(b, s);
    assert.ok(b.puts.length > 0, `${id} ${name}: the 39° builder drew nothing`);
    n++;
  }
}
console.log(`flat frames rebuilt exactly: ${FACE_OBJECTS.length} objects x ${Object.keys(THEMES).length} themes (${n})`);

// a broken sheet must fail: drop the desk's slate and it no longer matches
setTheme('tier2');
const broken = sheetOf('DESK');
broken.details.shift();
assert.notDeepEqual(composeFlat(broken), MAPS.DESK);

// every frame of faces.png belongs to an object, box detail or cylinder and has its face's size
const sizes = {};
for (const [name, o] of Object.entries(FACES.base.objects)) {
  if (o.front) { sizes[`${name} side`] = [cols(o.d), o.front[3]]; sizes[`${name} top`] = [o.front[2], cols(o.d)]; }
  const parts = (o.details ?? []).flatMap(d => (d.parts ? d.parts.map(p => [`${d.name}/${p.name}`, p]) : [[d.name, d]]));
  for (const [key, p] of parts) {
    const [, , w, h] = p.rect;
    if (p.kind === 'box') { sizes[`${name} ${key} side`] = [cols(p.d), h]; sizes[`${name} ${key} top`] = [w, cols(p.d)]; }
    if (p.kind === 'cyl') sizes[`${name} ${key} top`] = [w, cols(w)];
  }
}
for (const [k, f] of Object.entries(FACES.base.frames)) {
  assert.ok(sizes[k], `faces.png: frame '${k}' belongs to no box or cylinder`);
  assert.deepEqual([f[0].length, f.length], sizes[k], `faces.png: '${k}' size`);
}
for (const n of ['DESK', 'LECTERN', 'CONSOLE', 'SHELF', 'COGITATOR', 'CRATE', 'TABLE', 'BENCH', 'RECAFF', 'LORD_DESK', 'THRONE'])
  for (const f of ['side', 'top']) assert.ok(FACES.base.frames[`${n} ${f}`], `faces.png: no base '${n} ${f}'`);

// the builder: a screen's glass sits back by its depth; a cylinder has a lit front, a shaded side and a top
{
  const s = sheetOf('DESK'), slate = s.details.find(d => d.name === 'slate'), b = recorder();
  build39(b, s);
  const glassV = slate.v + slate.d - 1 - slate.recess[0].depth;
  assert.ok(b.puts.some(p => p.v === glassV && p.face === 1 && /[cC]/.test(p.c)), 'slate: glass set back');
  const candle = s.details.find(d => d.name === 'candle'), c = recorder();
  build39(c, { ...s, front: null, details: [candle] });
  for (const f of [0, 1, 2]) assert.ok(c.puts.some(p => p.face === f), `candle: face ${f}`);
  assert.ok(c.puts.some(p => p.face === 0 && p.z === candle.z + candle.rect[3]), 'candle: top on its top');
  // a world without its own side/top art still builds (faces derived from the front's edge colours)
  setTheme('cyber');
  const w = sheetOf('DESK');
  assert.equal(w.side, null);
  const r = recorder();
  build39(r, w);
  assert.ok(r.puts.some(p => p.face === 2) && r.puts.some(p => p.face === 0), 'world desk: side and top derived');
}
console.log('faces ok');
