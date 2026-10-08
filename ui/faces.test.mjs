// Face sheets (faces.js): for every theme, each prop's faces rebuild today's flat frame pixel for pixel, the 39° frames
// in faces.png fit their boxes, and the reference 39° builder draws every kind. Run: node ui/faces.test.mjs
import assert from 'node:assert/strict';
import { MAPS } from './sprites.js';
import { THEMES, setTheme } from './theme.js';
import './themes.js';
import { sheetOf, composeFlat, build39, cols, VS, inEllipse, FACES, FACE_OBJECTS } from './faces.js';

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

// every frame of faces.png belongs to a box, cylinder, disc or recess and has its face's size ([w, h])
const sizes = {};
const recessSizes = (pre, list = []) => { for (const r of list) if (r.depth > 1) { sizes[`${pre} ${r.name} wall`] = [r.depth - 1, r.rect[3]]; sizes[`${pre} ${r.name} floor`] = [r.rect[2], r.depth - 1]; } };
for (const [name, o] of Object.entries(FACES.base.objects)) {
  if (o.front) { sizes[`${name} side`] = [cols(o.d), o.front[3]]; sizes[`${name} top`] = [o.front[2], cols(o.d)]; recessSizes(name, o.recess); }
  const parts = (o.details ?? []).flatMap(d => (d.parts ? d.parts.map(p => [`${d.name}/${p.name}`, p]) : [[d.name, d]]));
  for (const [key, p] of parts) {
    const [, , w, h] = p.rect;
    if (p.kind === 'box') { sizes[`${name} ${key} side`] = [cols(p.d), h]; sizes[`${name} ${key} top`] = [w, cols(p.d)]; recessSizes(`${name} ${key}`, p.recess); }
    if (p.kind === 'cyl') sizes[`${name} ${key} top`] = [w, cols(w)];
    if (p.kind === 'disc') sizes[`${name} ${key} rim`] = [w, h];
    sizes[`${name} ${key} front`] = [w, h]; // a drawn front for a detail its frame shows only top-down (under a flat-only retouch)
  }
}
for (const [k, f] of Object.entries(FACES.base.frames)) {
  assert.ok(sizes[k], `faces.png: frame '${k}' belongs to no box, cylinder, disc or recess`);
  assert.deepEqual([f[0].length, f.length], sizes[k], `faces.png: '${k}' size`);
}
// a drawn front replaces the crop (the TABLE's mugs: top-down in the flat frame, seen from the side in 39°)
setTheme('tier2');
assert.deepEqual(sheetOf('TABLE').details.find(d => d.name === 'mug 1').map, FACES.base.frames['TABLE mug 1 front'], 'detail front frame used');
for (const n of ['DESK', 'LECTERN', 'CONSOLE', 'SHELF', 'COGITATOR', 'CRATE', 'TABLE', 'BENCH', 'RECAFF', 'LORD_DESK', 'THRONE'])
  for (const f of ['side', 'top']) assert.ok(FACES.base.frames[`${n} ${f}`], `faces.png: no base '${n} ${f}'`);

// the builder, one real check per kind (each detail built alone, u0 = v0 = 0)
{
  const alone = (s, d) => { const b = recorder(); build39(b, { ...s, front: null, details: [d] }); return b.puts; };
  const at = (puts, f) => puts.filter(f);
  const cog = sheetOf('COGITATOR'), D = n => cog.details.find(d => d.name === n);
  // disc: its art on its face at v = v + t - 1 (face 1, pixel for pixel), its rim frame in the layers behind (face 2)
  {
    const g = D('gauge 1'), puts = alone(cog, g), [, , w, h] = g.rect;
    assert.equal(g.v, cog.d, 'gauge: on the cogitator front by default');
    const face = at(puts, p => p.face === 1 && p.v === g.v + g.t - 1);
    assert.ok(g.round, 'gauge: a round disc');
    const inside = g.map.flatMap((row, r) => [...row].filter((c, i) => c !== '.' && inEllipse(i, r, w, h)));
    assert.ok(inside.length < g.map.join('').replace(/\./g, '').length, 'disc: the rect corners are cut away');
    assert.equal(face.length, inside.length, 'disc: every art pixel of the ellipse on its face');
    for (const p of face) assert.equal(p.c, g.map[g.z + h - 1 - p.z][p.u - g.u], 'disc: face pixel from the art');
    const rim = at(puts, p => p.face === 2 && p.v === g.v);
    assert.ok(rim.length && rim.every(p => p.c === g.rimFrame[g.z + h - 1 - p.z][p.u - g.u]), 'disc: rim from its frame, behind the face');
    assert.ok(new Set(rim.map(p => p.c)).size === 2, 'disc rim: lit and dark');
  }
  // recess: glass back by its depth, the bezel floor (face 0) inside the hole at the hole's bottom row, its left side
  {
    const b = recorder(); build39(b, cog);
    const r = cog.recess.find(x => x.name === 'screen'), [rx, ry, rw, rh] = r.rect, ui = cog.x0 + rx - cog.x0;
    const zt = cog.h - 1 - (ry - cog.above), zb = zt - rh + 1, vg = cog.d - 1 - r.depth, vf = cog.d - 1;
    assert.ok(at(b.puts, p => p.face === 1 && p.v === vg && p.u === ui && p.z === zt).length, 'recess: glass set back');
    assert.equal(at(b.puts, p => p.face === 1 && p.v === vf && p.u >= ui && p.u < ui + rw && p.z >= zb && p.z <= zt).length, 0, 'recess: the front is open over the glass');
    const floor = at(b.puts, p => p.face === 0 && p.z === zb && p.u >= ui && p.u < ui + rw && p.v > vg && p.v < vf);
    assert.equal(floor.length, rw * (r.depth - 1), 'recess: floor fills the hole');
    assert.ok(floor.every(p => p.c === r.floorFrame[p.v - vg - 1][p.u - ui]), 'recess: floor from its frame');
    const wall = at(b.puts, p => p.face === 2 && p.u === ui - 1 && p.v > vg && p.v < vf && p.z >= zb && p.z <= zt);
    assert.ok(wall.length === rh * (r.depth - 1) && wall.every(p => p.c === r.wallFrame[zt - p.z][vf - 1 - p.v]), 'recess: left side from its frame');
  }
  // cyl: a front, a shaded far half, and an elliptical top (wider through the middle than at the edges) on its top
  {
    const s = sheetOf('DESK'), d = s.details.find(x => x.name === 'dish'), puts = alone(s, d), [, , w, h] = d.rect;
    for (const f of [1, 2]) assert.ok(puts.some(p => p.face === f), `cyl: face ${f}`);
    const top = at(puts, p => p.face === 0 && p.z === d.z + h), span = u => top.filter(p => p.u === u).length;
    const u0 = d.u - (w >> 1);
    assert.ok(top.length > 0 && top.length < w * w, 'cyl: the top is an ellipse, not a square');
    assert.ok(span(u0 + (w >> 1)) > span(u0), 'cyl: the top is widest through the middle');
    assert.ok(top.some(p => p.c === 'k') && top.some(p => p.c !== 'k'), 'cyl: top rimmed, filled from its frame');
    // its frame indexed across the whole ellipse (row = (v - axis + R) / VS), so every column shares the frame's rows
    const J = d.top.length, row = p => Math.min(J - 1, Math.floor((p.v - d.v + w / 2) / VS));
    assert.ok(top.filter(p => p.c !== 'k').every(p => p.c === d.top[row(p)][p.u - u0]), 'cyl: top frame indexed across the whole ellipse');
    assert.ok(new Set(top.filter(p => p.c !== 'k').map(p => p.c)).size > 1, 'cyl: top shows more than one frame row');
  }
  // spire: stacked volumes, the cog disc on its plane and the knob cylinder's top above it
  {
    const sp = D('spire'), [cogP, knob] = sp.parts, puts = alone(cog, sp);
    assert.ok(at(puts, p => p.face === 1 && p.v === cogP.v + cogP.t - 1).length > 50, 'spire: its cog disc');
    assert.ok(at(puts, p => p.face === 0 && p.z === knob.z + knob.rect[3]).length > 0, 'spire: its knob top');
    assert.ok(knob.z > cogP.z, 'spire: the knob stands on the cog');
  }
  // bill: upright at its bottom centre; top: laid on its plane
  {
    const s = sheetOf('DESK'), f = s.details.find(x => x.name === 'flame'), puts = alone(s, f);
    assert.ok(puts.length && puts.every(p => p.face === 3 && p.u === f.u && p.v === f.v && p.z >= f.z && p.z < f.z + f.rect[3]), 'bill: upright on its anchor');
    setTheme('tier2');
    const t = sheetOf('TABLE'), plate = t.details.find(x => x.name === 'plate 1'), tp = alone(t, plate);
    assert.ok(tp.length && tp.every(p => p.face === 0 && p.z === t.h && p.u >= plate.u && p.u < plate.u + plate.rect[2] && p.v >= plate.v), 'top: laid on the table top');
    for (const n of ['mug 1', 'mug 2', 'cup']) assert.equal(t.details.find(x => x.name === n).kind, 'cyl', `TABLE ${n} stands up`);
  }
  // box: the slate's side face (face 2, at its right end) from its side frame, its screen glass back by its depth
  {
    const s = sheetOf('DESK'), sl = s.details.find(x => x.name === 'slate'), puts = alone(s, sl);
    const side = at(puts, p => p.face === 2 && p.u === sl.u + sl.rect[2] - 1);
    assert.ok(side.length && side.every(p => sl.side.some(r => r.includes(p.c))), 'box: side from its frame');
    assert.ok(puts.some(p => p.v === sl.v + sl.d - 1 - sl.recess[0].depth && p.face === 1 && /[cC]/.test(p.c)), 'box: screen glass set back');
  }
  // a world without its own side/top art still builds (faces derived from the front's edge colours)
  setTheme('cyber');
  const w = sheetOf('DESK');
  assert.equal(w.side, null);
  const r = recorder();
  build39(r, w);
  assert.ok(r.puts.some(p => p.face === 2) && r.puts.some(p => p.face === 0), 'world desk: side and top derived');
}
console.log('faces ok');
