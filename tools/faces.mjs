// Face sheets: one source of art for both the flat 3/4 hall and the 39 deg view (tools/iso.html).
// Each object is split into its faces, in the key palette:
//   front    the face toward the viewer, cut out of today's frame (shared: flat draws it as is, 39 deg shears it 3:1)
//   details  the small things on or around it (slate, paper, candle, vents, drums), cut out of today's frame and
//            drawn unchanged in both views; each has its place in the flat frame (at) and on the object in 3D (iso)
//   side     the end face (faces +u), and top, the face seen from above: new art, only the 39 deg view shows them
//   flatOnly a per-view retouch layer for the flat frame (what today's frame paints that is not a face)
// composeFlat(sheet) rebuilds today's flat frame from the faces; tools/faces.test.mjs checks it pixel for pixel.
import { MAPS } from '../ui/sprites.js';

export const crop = (map, x0, y0, x1, y1) => map.slice(y0, y1 + 1).map(r => r.slice(x0, x1 + 1)); // inclusive

// ---- new art: side and top faces (rules in the key palette; only the 39 deg view shows them) ------------------------
// The desk's end: a lit rail, a brass trim line, a framed wooden panel, iron legs. j from the front corner, r from top.
const deskLegs = (j, J) => { const L = J >= 20 ? 'kmMMMk' : J >= 9 ? 'kmMk' : 'kmk'; return j < L.length ? L[j] : j >= J - L.length ? L[j - J + L.length] : '.'; };
const deskSide = (j, r, J) => (r >= 19 ? deskLegs(j, J) : r === 0 || r === 18 ? 'k' : r === 1 ? 'L' : r === 2 ? 'g' : r === 17 ? 'G'
  : j === 0 || j === J - 1 || r === 3 || r === 16 || r === 10 ? 'W' : j === 1 || r === 4 || r === 11 ? 'L' : 'w');
// The desk's top: wood with a little grain, the front edge lit.
const deskTop = (i, j, U, J) => (j === J - 1 ? 'L' : j % 6 === 2 && (i * 7 + j * 3) % 11 > 3 ? 'W' : 'w');
const shelfSide = (j, r, J) => (r === 0 ? 'k' : j === 0 || j === J - 1 ? 'W' : 'w');
const shelfTop = (i, j, U, J) => (j === J - 1 ? 'L' : 'w');
const slateSide = (j, r) => (r >= 15 || j === 0 ? 'G' : 'U');
// The cogitator's end repeats one column of its right panel; its top is iron with vent slots and a lit front edge.
const cogSide = front => (j, r, J) => (j === 0 ? front[r][front[0].length - 1] : j === J - 1 ? 'k' : front[r][front[0].length - 7]);
const cogTop = (i, j, U, J) => (j === J - 1 ? 'l' : j % 4 === 1 && i % 16 > 2 && i % 16 < 13 ? 'k' : 'M');

// ---- the sheets ------------------------------------------------------------------------------------------------------
// fw x fh: today's frame size; x0, above: where the front sits in it. 3D: u = frame column, the box is w x d x h.
export function deskSheet(D = MAPS.DESK) {
  return {
    name: 'DESK', fw: 64, fh: 42, x0: 0, above: 18, w: 64, d: 24, h: 24,
    front: crop(D, 0, 18, 63, 41), side: deskSide, top: deskTop,
    details: [
      { name: 'slate', map: crop(D, 12, 0, 35, 17), at: [12, 0], iso: { kind: 'box', u: 14, v: 2, d: 3, side: slateSide, top: () => 'h' } },
      { name: 'paper', map: crop(D, 2, 8, 11, 17), at: [2, 8], iso: { kind: 'top', u: 4, v: 9 } },
      { name: 'candle', map: crop(D, 46, 0, 59, 17), at: [46, 0], iso: { kind: 'bill', u: 52, v: 12 } },
    ],
  };
}
export function shelfSheet(S = MAPS.SHELF) {
  return { name: 'SHELF', fw: 64, fh: 42, x0: 0, above: 0, w: 64, d: 10, h: 42, front: S, side: shelfSide, top: shelfTop, details: [] };
}
// The cogitator: its body is the front; the vents and the spire on top and the drums at the ends are details (the drums
// and the spire are round, so the 39 deg view stands them upright instead of shearing them). The frame's bottom rows
// are a shadow painted into the art: flat only.
export function cogSheet(C = MAPS.COGITATOR) {
  const front = crop(C, 9, 15, 154, 96);
  return {
    name: 'COGITATOR', fw: 164, fh: 100, x0: 9, above: 15, w: 146, d: 22, h: 82,
    front, side: cogSide(front), top: cogTop,
    details: [
      { name: 'vents L', map: crop(C, 34, 6, 54, 14), at: [34, 6], iso: { kind: 'decal', u: 34, v: 10 } },
      { name: 'vents R', map: crop(C, 108, 6, 129, 14), at: [108, 6], iso: { kind: 'decal', u: 108, v: 10 } },
      { name: 'spire', map: crop(C, 70, 0, 93, 14), at: [70, 0], iso: { kind: 'bill', u: 82, v: 10 } },
      { name: 'drum L', map: crop(C, 0, 29, 10, 96), at: [0, 29], iso: { kind: 'drum', u: 5, v: 20 } },
      { name: 'drum R', map: crop(C, 153, 29, 163, 96), at: [153, 29], iso: { kind: 'drum', u: 158, v: 20 } },
    ],
    flatOnly: [{ name: 'painted shadow', map: crop(C, 0, 97, 163, 99), at: [0, 97] }],
  };
}

// Today's flat frame, rebuilt: the front at its place, the details over it, then the flat-only retouch.
export function composeFlat(s, { retouch = true } = {}) {
  const g = Array.from({ length: s.fh }, () => Array(s.fw).fill('.'));
  const paste = (map, x, y) => map.forEach((row, r) => { for (let i = 0; i < row.length; i++) if (row[i] !== '.') g[y + r][x + i] = row[i]; });
  paste(s.front, s.x0, s.above);
  for (const d of s.details) paste(d.map, ...d.at);
  if (retouch) for (const d of s.flatOnly ?? []) paste(d.map, ...d.at);
  return g.map(r => r.join(''));
}
