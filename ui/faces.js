// Face sheets: one source of art for the flat 3/4 hall and the 39° view. Every box prop and small prop is split into
// faces and parts, cut out of today's frame (MAPS, the family sheets): the flat view draws them as they are, the 39°
// view builds them in 3D. What is new art for the 39° view only (side and top faces, book and candle tops) lives in
// ui/art/faces.png; the rects, kinds and 3D sizes in ui/art/faces.json (meta.objects). A world may override both in
// ui/art/<world>/faces.* (an object it lists replaces the base one, with only the world's own side/top frames).
//
// faces.json meta.objects[NAME] (frame px, [x, y, w, h] rects in today's frame; 3D: u along the frame's columns,
// v from the object's back toward the viewer, z up from the floor, all art px):
//   front    rect of the main box's front face; the box is front.w x d x front.h, its column 0 at u = front.x
//   d        the main box's depth
//   recess   [{ name, rect, depth, wall }]: screens set into the front (glass set back by depth; the bezel's inner
//            left side and floor from frames '<NAME> <recess> wall' (h rows x depth-1) and '... floor' (depth-1 rows
//            x w), else the colour `wall`)
//   details  [{ name, rect, kind, u?, v, z?, ... }], the parts on or around it, each a volume in the 39° view:
//              box   d (+ recess): a small box (books, slates, paper stacks), front = rect
//              cyl   an upright cylinder, diameter rect.w (candles, drums, censers, pots); u, v its axis
//              disc  t, rim, round: a thin disc on the plane v, standing proud by t (cog emblems, gauges, seals,
//                    dials; round: only the ellipse inscribed in the rect);
//                    its thickness from frame '<NAME> <detail> rim' (the art's size), else the colour `rim`
//              top   laid flat on the plane z: only what lies flat (papers, plates, a slate lying on a desk);
//                    anything standing up is a volume (mugs and inkwells are cylinders)
//              bill  upright, never sheared (flames); u, v its bottom centre
//              spire parts: [detail...] stacked shapes (boxes, cylinders, discs) sharing the spire's v
//            u defaults to rect.x (the centre for cyl and bill), z to where the flat frame puts it (its bottom row's
//            height above the main box's bottom; for top, the main box's top), v of a disc to the main front (d).
//   flatOnly [{ name, rect }]: what only the flat frame paints (shadows painted into the art, top faces drawn
//            top-down), pasted last
// faces.png frames, named '<NAME> side' / '<NAME> top' (main box), '<NAME> <detail> side|top' (a box or cylinder
// detail), '<NAME> <spire>/<part> side|top': a side frame is h rows x cols(d) columns (column 0 at the front corner),
// a top frame cols(d) rows x w columns (row 0 at the back). Missing frames are allowed (a world without its 39° art
// yet): the builder then derives the face from the front's edge colours. '<NAME> <detail> front' (the rect's size)
// replaces a detail's crop when its frame shows it only top-down (a mug on a table): keep it under a flat-only rect so
// the flat frame is unchanged. A box detail's recess frames are
// '<NAME> <detail> <recess> wall|floor'. faces.png and faces.json are hand-edited source (no generator).
import { T, THEMES } from './theme.js';
import { VS39 } from './iso.js';
import { MAPS, ART } from './sprites.js';
import { loadSheet } from './art.js';

export const VS = VS39; // v units per texel of a top face's rows and a side face's columns (39°)
export const cols = d => Math.ceil(d / VS); // texels across a depth d

const missing = e => e.code === 'ENOENT' || /HTTP 404/.test(e.message);
async function load(dir) {
  try {
    const { frames, meta } = await loadSheet(`${dir}faces`);
    return { objects: meta.objects, frames };
  } catch (e) {
    if (dir && missing(e)) return null; // a world without face sheets draws with the base ones; anything else throws
    throw e;
  }
}
const base = await load('');
const worlds = {};
await Promise.all(Object.values(THEMES).filter(t => t.art).map(async t => { worlds[t.id] = await load(`${t.id}/`); }));
// For the tests and the art tools: each folder's data, and the names of the objects with face sheets.
export const FACES = { base, worlds };
export const FACE_OBJECTS = Object.keys(base.objects);

const crop = (map, [x, y, w, h]) => map.slice(y, y + h).map(r => r.slice(x, x + w));

// The face sheet of a sprite as the active theme (or theme id) draws it, cut from map (default: today's MAPS frame;
// pass an animated copy, e.g. the cogitator's lit screens). null for a sprite without one.
export function sheetOf(name, map = MAPS[name], id = T.id) {
  const w = worlds[ART.dirOf(id)], own = w?.objects[name];
  const o = own ?? base.objects[name], F = own ? w.frames : base.frames;
  if (!o) return null;
  const [x0, above, bw, bh] = o.front ?? [0, 0, 0, 0];
  const B = o.front ? above + bh : map.length; // the flat row of z = 0
  const frame = n => F[`${name} ${n}`] ?? null;
  const recess = (list = [], pre) => list.map(r => ({ ...r, wallFrame: frame(`${pre}${r.name} wall`), floorFrame: frame(`${pre}${r.name} floor`) }));
  const part = (p, key) => {
    const [x, y, pw, ph] = p.rect, mid = p.kind === 'cyl' || p.kind === 'bill';
    return { ...p, map: frame(`${key} front`) ?? crop(map, p.rect), at: [x, y], u: p.u ?? x + (mid ? pw >> 1 : 0), v: p.v ?? (p.kind === 'disc' ? o.d ?? 0 : 0),
      z: p.z ?? (p.kind === 'top' ? bh : B - (y + ph)), side: frame(`${key} side`), top: frame(`${key} top`), rimFrame: frame(`${key} rim`),
      ...(p.recess && { recess: recess(p.recess, `${key} `) }),
      ...(p.parts && { parts: p.parts.map(q => part({ v: p.v, ...q }, `${key}/${q.name}`)) }) };
  };
  return {
    name, fw: map[0].length, fh: map.length, x0, above, w: bw, d: o.d ?? 0, h: bh, rect: o.front ?? null,
    front: o.front ? crop(map, o.front) : null, side: frame('side'), top: frame('top'), recess: recess(o.recess, ''),
    details: (o.details ?? []).map(p => part(p, p.name)),
    flatOnly: (o.flatOnly ?? []).map(p => ({ ...p, map: crop(map, p.rect), at: p.rect.slice(0, 2) })),
  };
}

// Today's flat frame, rebuilt: the front at its place, the details over it, then the flat-only retouch.
export function composeFlat(s, { retouch = true } = {}) {
  const g = Array.from({ length: s.fh }, () => Array(s.fw).fill('.'));
  const paste = ({ map, at: [x, y] }) => map.forEach((row, r) => { for (let i = 0; i < row.length; i++) if (row[i] !== '.') g[y + r][x + i] = row[i]; });
  if (s.front) paste({ map: s.front, at: [s.x0, s.above] });
  for (const d of s.details) for (const p of d.parts ?? [d]) paste(p);
  if (retouch) s.flatOnly.forEach(paste);
  return g.map(r => r.join(''));
}

// ---- the 39° builder (reference; the static hall renderer calls it) ---------------------------------------------------
// buf is a z-buffer with the trial's Buf API (tools/iso.mjs): put(u, v, z, c, id, face, dz), face 0 top, 1 front
// (faces +v), 2 side (faces +u), 3 billboard; box({ u0, u1, v0, v1, z0, z1, front(i, r), side(j, r), top(i, j), id,
// own }); bill(map, u, v, z, id, dz). Builds sheet s with its frame's column 0 at u = u0 and its back at v = v0.
const solid = c => c !== '.' && c !== 'k';
const edge = row => [...row].reverse().find(solid) ?? (row.includes('k') ? 'k' : '.'); // a side from the front's right edge
const lid = (map, i) => map.map(r => r[i]).find(solid) ?? (map.some(r => r[i] === 'k') ? 'k' : '.'); // a top from the front's first colour

function box(buf, { map, side, top, recess = [] }, [x, y, w, h], U, V, Z, d, id) {
  const hole = (i, r) => recess.some(({ rect: [rx, ry, rw, rh] }) => x + i >= rx && x + i < rx + rw && y + r >= ry && y + r < ry + rh);
  buf.box({ u0: U, u1: U + w, v0: V, v1: V + d, z0: Z, z1: Z + h, id, own: { top: 1, side: 1 },
    front: (i, r) => (hole(i, r) ? '.' : map[r][i]),
    side: (j, r) => (side ? side[r]?.[j] ?? '.' : edge(map[r])),
    top: (i, j) => (top ? top[j]?.[i] ?? '.' : lid(map, i)) });
  // a screen set into the front: the glass pushed back by depth; between it and the front, the bezel's floor (the top
  // face of the row under the hole, at z = zb as a box's top sits at z1) and its left inner side (the +u face of the
  // column left of the hole, at u = ui - 1 as a box's side sits at u1 - 1), from their frames or the wall colour
  for (const { rect: [rx, ry, rw, rh], depth = 1, wall = 'k', wallFrame, floorFrame } of recess) {
    const ui = U + rx - x, vg = V + d - 1 - depth, zt = Z + h - 1 - (ry - y), zb = zt - rh + 1, vf = V + d - 1;
    for (let i = 0; i < rw; i++) for (let r = 0; r < rh; r++) buf.put(ui + i, vg, zt - r, map[ry - y + r][rx - x + i], id, 1);
    for (let v = vg + 1; v < vf; v++) {
      for (let i = 0; i < rw; i++) buf.put(ui + i, v, zb, floorFrame?.[v - vg - 1]?.[i] ?? wall, id, 0);
      for (let z = zb; z <= zt; z++) buf.put(ui - 1, v, z, wallFrame?.[zt - z]?.[vf - 1 - v] ?? wall, id, 2);
    }
  }
}
// An upright cylinder, axis (U, V), from Z: each column of the front wrapped round it (the lit half faces front, the far
// half is a side face, shaded), the top an ellipse from its top frame (or the front's first colour), rimmed in outline.
function cyl(buf, { map, top }, U, V, Z, id) {
  const w = map[0].length, h = map.length, R = w / 2, J = cols(w);
  for (let c = 0; c < w; c++) {
    const du = c + 0.5 - R, half = Math.floor(Math.sqrt(Math.max(0, R * R - du * du)) + 0.5), u = U - (w >> 1) + c;
    for (let dv = -half; dv < half; dv++) {
      for (let r = 0; r < h; r++) buf.put(u, V + dv, Z + h - 1 - r, map[r][c], id, du < 0 ? 1 : 2);
      const rim = du * du + (dv + 0.5) ** 2 > (R - 1) ** 2;
      buf.put(u, V + dv, Z + h, rim ? 'k' : top ? top[Math.min(J - 1, Math.floor((dv + R) / VS))]?.[c] ?? '.' : lid(map, c), id, 0);
    }
  }
}
// A thin disc on the plane v = V (facing +v), standing proud by t: the art on its face (v = V + t - 1), the rim behind it
// from its rim frame (same size as the art: the thickness colour behind each pixel) or the rim colour. A round disc
// keeps only the ellipse inscribed in its rect (the rect's corners are the surface it stands on).
export const inEllipse = (c, r, w, h) => ((c + 0.5) / w * 2 - 1) ** 2 + ((r + 0.5) / h * 2 - 1) ** 2 <= 1;
function disc(buf, { map, t = 2, rim = 'k', rimFrame, round }, U, V, Z, id) {
  const h = map.length, w = map[0].length;
  map.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] !== '.' && (!round || inEllipse(c, r, w, h))) for (let k = 0; k < t; k++) {
    buf.put(U + c, V + k, Z + h - 1 - r, k === t - 1 ? row[c] : rimFrame?.[r]?.[c] ?? rim, id, k === t - 1 ? 1 : 2);
  } });
}
function part(buf, p, u0, v0, id) {
  const U = u0 + p.u, V = v0 + p.v, Z = p.z;
  if (p.kind === 'box') box(buf, p, p.rect, U, V, Z, p.d, id);
  else if (p.kind === 'cyl') cyl(buf, p, U, V, Z, id);
  else if (p.kind === 'disc') disc(buf, p, U, V, Z, id);
  else if (p.kind === 'top') p.map.forEach((row, r) => { for (let c = 0; c < row.length; c++) for (let k = 0; k < VS; k++) buf.put(U + c, V + r * VS + k, Z, row[c], id, 0, 1); });
  else if (p.kind === 'bill') buf.bill(p.map, U, V, Z, id, 100);
  else if (p.kind === 'spire') p.parts.forEach(q => part(buf, q, u0, v0, id));
  else throw new Error(`faces: ${p.name}: unknown kind '${p.kind}'`);
}
export function build39(buf, s, u0 = 0, v0 = 0, id = 1) {
  if (s.front) box(buf, { ...s, map: s.front }, s.rect, u0 + s.x0, v0, 0, s.d, id);
  for (const p of s.details) part(buf, p, u0, v0, id + 1);
}
