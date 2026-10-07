// Projection trial (tools/iso.html): one corner of the scriptorium drawn in three pixel projections next to today's flat
// 3/4 hall, at the hall's art-px scale, built from the key-palette art. Not used by the app (nothing under ui/ changes).
//
// World: u along the back wall (screen right), v toward the viewer, z up; 1 unit = 1 art px along an axis.
// Each projection maps (u, v, z) to a pixel with integer steps, so every edge is a clean stair:
//   iso       2:1 isometric   sx = u - v,          sy = floor((u + v) / 2) - z    both walls sheared 2-1
//   oblique   front-facing    sx = u - floor(v/2), sy = floor(v / 2) - z          back wall flat (today's art as is),
//                                                                                  depth recedes 1-1 at half length
//   dimetric  rotated ~14 deg sx = u - floor(v/4), sy = floor((u + 2v) / 4) - z   back wall slopes 1 down per 4,
//                                                                                  side wall steep (2 down per 1)
// A flat map laid on a wall plane is a column shear under that projection. Hidden surfaces: a z-buffer per layer, depth
// u + v + z (the view direction has positive u, v and z in all three). Layers (desks, the cogitator, the scribe) are
// painted back to front by their floor boxes. VS: v units per pixel row along v (textures across v sample every VS).
import { MAPS, ROOM, PROP_AT, SCRIBE, RES } from '../ui/sprites.js';
import { T } from '../ui/theme.js';
import { contactShadow } from '../ui/depth.js';
import { SCRIBE_ISO, SCRIBE_ISO_FEET } from './iso_art.mjs';

const fl = Math.floor;
export const PROJ = {
  iso: { name: '2:1 isometric', VS: 1, P: (u, v, z) => [u - v, fl((u + v) / 2) - z] },
  oblique: { name: 'oblique, front-facing', VS: 2, P: (u, v, z) => [u - fl(v / 2), fl(v / 2) - z] },
  // Asymmetric rotations: the back wall (u) recedes 3:1, the side wall (v) 2:1 (39 deg) or 1:1 (30 deg). With vertical
  // squash s and rotation t, s tan t = 1/3 and s cot t = 1/2 (39: s^2 = 1/6, tan t = 0.816) or 1 (30: tan t = 0.577).
  // u keeps 1 px across per unit (the art's width); v is foreshortened to w = floor(v tan t) px across, so both slopes
  // stay clean repeating stairs (3-3-3 and 2-2-2 / 1-1-1) with the room's proportions true.
  a39: { name: '39° rotation (3:1 / 2:1)', VS: 2 / Math.sqrt(2 / 3), asym: true,
    P: (u, v, z) => { const w = fl(v * Math.sqrt(2 / 3)); return [u - w, fl(u / 3) + fl(w / 2) - z]; } },
  a30: { name: '30° rotation (3:1 / 1:1)', VS: Math.sqrt(3), asym: true,
    P: (u, v, z) => { const w = fl(v / Math.sqrt(3)); return [u - w, fl(u / 3) + w - z]; } },
  oblique2: { name: 'oblique, 2:1 steps', VS: 2, wideU: true, P: (u, v, z) => [u - v, fl(v / 2) - z] },
  // Light one-point perspective: the cabinet oblique scaled about (PX, 0) by s = 1 + A v, so the back wall (v = 0) stays
  // at scale 1 (today's art untouched), the side wall and the floor edges converge toward the back, floor rows get
  // shorter toward the back. Only the room shell is drawn through it (supersampled, ss, so a stretch leaves no holes);
  // furniture keeps the crisp cabinet shape (local) and is placed at its perspective position; layers further back are
  // darker (dov).
  persp: { name: 'oblique, light one-point perspective', VS: 2, ss: 2, local: 'oblique', dov: 0.16,
    P: (u, v, z) => { const s = 1 + (0.16 / 160) * v; return [fl(150 + s * (u - v / 2 - 150)), fl(s * (v / 2 - z))]; } },
  dimetric: { name: 'dimetric, rotated ~14°', VS: 2, P: (u, v, z) => [u - fl(v / 4), fl((u + 2 * v) / 4) - z] },
};
let PR = PROJ.iso, VS = 1, SIZE = null;
const P = (u, v, z = 0) => PR.P(u, v, z);

// The scene: floor u 0..ROOM_U, v 0..ROOM_V; walls on v < 0 (back) and u < 0 (left side), WALL_H tall.
const ROOM_U = 320, ROOM_V = 160, WALL_H = 128, WALL_T = 8, SLAB = 6;

class Buf {
  constructor() {
    const n = SIZE.w * SIZE.h;
    this.ch = new Array(n).fill('.');
    this.dp = new Float32Array(n).fill(-1e9);
    this.id = new Int16Array(n).fill(-1);
    this.face = new Int8Array(n).fill(-1); // 0 top, 1 front (faces +v), 2 side (faces +u), 3 billboard
    this.w = new Int16Array(3 * n); // the world (u, v, z) each pixel shows
  }
  px(sx, sy, d, c, id, face, u = 0, v = 0, z = 0) {
    if (c == null || c === '.') return;
    const x = sx + SIZE.ox, y = sy + SIZE.oy;
    if (x < 0 || y < 0 || x >= SIZE.w || y >= SIZE.h) return;
    const i = y * SIZE.w + x;
    if (d < this.dp[i]) return;
    this.dp[i] = d; this.ch[i] = c; this.id[i] = id; this.face[i] = face;
    this.w[3 * i] = u; this.w[3 * i + 1] = v; this.w[3 * i + 2] = z;
  }
  put(u, v, z, c, id, face, dz = 0) { const [sx, sy] = P(u, v, z); this.px(sx, sy, u + v + z + dz, c, id, face, u, v, z); }
  // A box u0..u1, v0..v1, z0..z1 (half-open). Texture coords, pixel units (j is v / VS):
  // top(i, j, U, J) i along u, j along v from the back; front(i, r, U, Z) r down from the top;
  // side(j, r, J, Z) j from the front corner toward the back.
  box({ u0, u1, v0, v1, z0, z1, top, front, side, id = 0 }) {
    const U = u1 - u0, J = Math.ceil((v1 - v0) / VS), Z = z1 - z0, d = 1 / (PR.ss ?? 1); // d: sample step
    if (top) for (let u = u0; u < u1; u += d) for (let v = v0; v < v1; v += d) this.put(u, v, z1, top(fl(u - u0), fl((v - v0) / VS), U, J), id, 0);
    if (front) for (let u = u0; u < u1; u += d) for (let z = z0; z < z1; z += d) this.put(u, v1 - 1, z, front(fl(u - u0), fl(z1 - z - d), U, Z), id, 1);
    if (side) for (let v = v0; v < v1; v += d) for (let z = z0; z < z1; z += d) this.put(u1 - 1, v, z, side(fl((v1 - d - v) / VS), fl(z1 - z - d), J, Z), id, 2);
  }
  // A flat map on a wall plane: plane 'v' faces +v at v = at, column c at u = from + c; plane 'u' faces +u at u = at,
  // column c at v = from + (width - 1 - c) * VS (one pixel column each). Row r at z = ztop - r.
  decal(map, plane, at, from, ztop, id = 0, dz = 0.5) {
    const w = map[0].length, d = 1 / (PR.ss ?? 1);
    map.forEach((row, r) => { for (let c = 0; c < row.length; c++) for (let a = 0; a < 1; a += d) for (let b = 0; b < 1; b += d) {
      if (plane === 'v') this.put(from + c + a, at, ztop - r - b, row[c], id, 1, dz);
      else for (let k = 0; k < VS; k++) this.put(at, from + (w - 1 - c) * VS + k + a, ztop - r - b, row[c], id, 2, dz);
    } });
  }
  // A map standing upright, not sheared (round things: candles, drums, the spire), bottom centre on (u, v, z).
  bill(map, u, v, z, id = 0, dz = 0) {
    const [sx, sy] = P(u, v, z), w = map[0].length, h = map.length, x0 = sx - (w >> 1), d = u + v + z + dz;
    map.forEach((row, r) => { for (let c = 0; c < row.length; c++) this.px(x0 + c, sy - h + 1 + r, d, row[c], id, 3, u, v, z); });
  }
  // Outline ('k') the pixels of the given ids that touch the void or something further back.
  outline(ids, gap = 3) {
    const { w, h } = SIZE, mark = [];
    // ponytail: the 39/30 deg projections leave single-pixel holes inside top faces (where the 3- and 2-stairs step
    // together); fill each from its left (or upper) neighbour on the same top face. Edges are unaffected.
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (this.ch[i] !== '.') continue;
      for (let [a, b] of [[i - 1, i + 1], [i - w, i + w]]) {
        if (this.ch[a] === '.' || this.ch[b] === '.' || (this.face[a] !== 0 && this.face[b] !== 0)) continue;
        if (this.face[a] !== 0) a = b;
        this.ch[i] = this.ch[a]; this.dp[i] = this.dp[a]; this.id[i] = this.id[a]; this.face[i] = 0;
        for (let k = 0; k < 3; k++) this.w[3 * i + k] = this.w[3 * a + k];
        break;
      }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!ids.has(this.id[i])) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy, j = Y * w + X;
        const out = X < 0 || Y < 0 || X >= w || Y >= h || this.ch[j] === '.';
        if (out || (this.id[j] !== this.id[i] && this.dp[j] < this.dp[i] - gap)) { mark.push(i); break; }
      }
    }
    for (const i of mark) this.ch[i] = 'k';
  }
  rows() { const out = []; for (let y = 0; y < SIZE.h; y++) out.push(this.ch.slice(y * SIZE.w, (y + 1) * SIZE.w).join('')); return out; }
}

// Paint a char map with the theme's px colours (plus overrides) into a canvas; '.' and unknown chars stay clear.
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
export function paint(rows, over = {}) {
  const pal = { ...T.px, ...over }, cache = {};
  const cv = document.createElement('canvas');
  cv.width = rows[0].length; cv.height = rows.length;
  const g = cv.getContext('2d'), img = g.createImageData(cv.width, cv.height);
  rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) {
    const c = row[x];
    if (c === '.' || !pal[c]) continue;
    const [r, gg, b] = cache[c] ??= rgb(pal[c]);
    const i = (y * cv.width + x) * 4;
    img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
  } });
  g.putImageData(img, 0, 0);
  return cv;
}
// Shading drawn in code, like the hall's depth pass: side faces (away from the top-left light) darker, plus a
// per-pixel darkness (ambient occlusion).
function shadeLayer(buf, ao, side = 0.2) {
  const cv = document.createElement('canvas');
  cv.width = SIZE.w; cv.height = SIZE.h;
  const g = cv.getContext('2d'), img = g.createImageData(SIZE.w, SIZE.h), [r, gg, b] = T.light.shadow.split(',').map(Number);
  for (let i = 0; i < buf.ch.length; i++) {
    if (buf.ch[i] === '.') continue;
    const a = Math.min(0.8, (buf.face[i] === 2 ? side : 0) + (ao ? ao[i] : 0));
    if (a <= 0) continue;
    img.data[4 * i] = r; img.data[4 * i + 1] = gg; img.data[4 * i + 2] = b; img.data[4 * i + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  return cv;
}

// ---- the room ------------------------------------------------------------------------------------------------------
const FLOOR = 1, WALL_L = 2, WALL_B = 3, PIPE = 4, SHELF = 5, WINDOW = 6, BANNER = 7, CHANNEL_V = 120;
const CHANNEL = ['!', '+', '+', '!']; // the coolant channel across v (ROOM 'channel h' rows)
const SHELF_U = 8, WINDOW_U = 84, COG_U = 116, BANNER_U = 286, PIPE_Z = 104;

function wallTex(tile) {
  return (i, r) => {
    const z = WALL_H - 1 - r;
    if (z < 0) return 'S';      // the cut through the floor slab
    if (z < 4) return '0';      // wall foot
    if (z === 4) return '6';
    return tile[r % tile.length][i % tile[0].length];
  };
}
function buildRoom() {
  const b = new Buf(), floor = ROOM.frames.floor, wall = ROOM.frames.wall, wallE = ROOM.frames['wall east'];
  const cut = (i, r) => (r === 0 ? 'm' : 'M'), ch = fl(CHANNEL_V / VS);
  // floor slab: the grate tile laid along u and v, the coolant channel along u
  b.box({ u0: 0, u1: ROOM_U, v0: 0, v1: ROOM_V, z0: -SLAB, z1: 0, id: FLOOR, front: cut, side: cut,
    top: (i, j) => (j >= ch && j < ch + 4 ? CHANNEL[j - ch] : j === ch - 1 || j === ch + 4 ? '2' : floor[j % 8][PR.wideU ? [0, 0, 1, 2, 2, 2, 2, 2][i % 8] : i % 8]) });
  // the left side wall (faces +u): east plates, darker as a side face; the back wall (faces +v): west plates
  const cap = () => '7', end = (i, r) => (r < WALL_H ? 'S' : 'M');
  b.box({ u0: -WALL_T, u1: 0, v0: -WALL_T, v1: ROOM_V, z0: -SLAB, z1: WALL_H, id: WALL_L, top: cap, front: end,
    side: (j, r, J) => wallTex(wallE)(J - 1 - j, r) });
  b.box({ u0: -WALL_T, u1: ROOM_U, v0: -WALL_T, v1: 0, z0: -SLAB, z1: WALL_H, id: WALL_B, top: cap, front: wallTex(wall), side: end });
  // copper pipe run along both walls, brass fittings
  const pipeRows = ['X', 'X', 'Z', 'Z', 'Z', 'i'], pz = PIPE_Z;
  b.box({ u0: -WALL_T, u1: ROOM_U, v0: 0, v1: 3, z0: pz, z1: pz + 6, id: PIPE, top: () => 'Y', front: (i, r) => pipeRows[r], side: () => 'Z' });
  b.box({ u0: 0, u1: 3, v0: -WALL_T, v1: ROOM_V, z0: pz, z1: pz + 6, id: PIPE, top: () => 'Y', side: (j, r) => pipeRows[r], front: () => 'Z' });
  const fit = (i, r, U) => (r === 9 ? 'U' : i === 0 ? 'g' : i === U - 1 ? 'U' : (r === 4 || r === 5) && i > 0 ? 'h' : 'G');
  for (let u = 24; u < ROOM_U; u += 48) b.box({ u0: u, u1: u + 4, v0: 0, v1: 5, z0: pz - 2, z1: pz + 8, id: PIPE, top: () => 'g', front: fit, side: () => 'U' });
  for (let v = 20; v < ROOM_V; v += 48) b.box({ u0: 0, u1: 5, v0: v, v1: v + 4, z0: pz - 2, z1: pz + 8, id: PIPE, top: () => 'g', side: fit, front: () => 'U' });
  // the shelf against the back wall: SHELF on its front, a wooden top and side
  const sh = MAPS.SHELF, su1 = SHELF_U + sh[0].length, sz = sh.length;
  b.box({ u0: SHELF_U, u1: su1, v0: 0, v1: 10, z0: 0, z1: sz, id: SHELF,
    top: (i, j, U, J) => (j === J - 1 ? 'L' : 'w'), front: (i, r) => sh[r][i], side: (j, r, J) => (r === 0 ? 'k' : j === 0 || j === J - 1 ? 'W' : 'w') });
  // banners: on the back wall right of the cogitator, on the side wall
  b.decal(MAPS.BANNER, 'v', 0, BANNER_U, 98, BANNER);
  b.decal(MAPS.BANNER, 'u', 0, 60, 98, BANNER);
  b.outline(new Set([WALL_L, WALL_B, SHELF, FLOOR]));
  // ambient occlusion: the floor darkens toward the walls and the shelf, the walls toward the floor
  const ao = new Float32Array(b.ch.length);
  for (let i = 0; i < b.ch.length; i++) {
    const u = b.w[3 * i], v = b.w[3 * i + 1], z = b.w[3 * i + 2];
    if (b.id[i] === FLOOR && b.face[i] === 0) {
      const shelf = u >= SHELF_U - 2 && u < su1 + 2 ? Math.max(0, 1 - Math.max(0, v - 10) / 10) * 0.35 : 0;
      ao[i] = Math.max(0.45 * Math.max(0, 1 - Math.min(u, v) / 14), shelf);
    } else if ((b.id[i] === WALL_L || b.id[i] === WALL_B) && b.face[i] > 0 && z >= 0 && z < 16) ao[i] = 0.3 * (1 - z / 16);
    if (PR.dov && b.ch[i] !== '.') ao[i] += PR.dov * (1 - Math.min(ROOM_V, Math.max(0, v)) / ROOM_V);
  }
  // the window: its own layer, to recolour by day and by night
  const w = new Buf();
  w.decal(MAPS.WINDOW, 'v', 0, WINDOW_U, 100, WINDOW);
  return { map: b.rows(), shade: shadeLayer(b, ao), window: w.rows() };
}

// ---- the cogitator bank ---------------------------------------------------------------------------------------------
const COG_V = 22, COG_TOP = 15, COG_BOT = 96; // its body: COGITATOR rows 15..96, cols 9..154 on the front
const rect = a => a.map(n => Math.round(n * RES));
function cogFrame(f) {
  const src = MAPS.COGITATOR.map(r => r.split('')), at = PROP_AT.COGITATOR;
  const hash = (a, b) => ((a * 73856093) ^ (b * 19349663) ^ (f * 83492791)) >>> 0;
  const on = (x, y) => { if (src[y]?.[x] === 'C') src[y][x] = 'c'; };
  const [sx, sy, sw, sh] = rect(at.screen);
  for (let y = sy + 2; y < sy + sh - 2; y += 3) { const n = 4 + (hash(y, 1) % (sw - 8)); for (let x = sx + 2; x < sx + 2 + n; x++) if ((x + y) % 7) on(x, y); }
  const [wx, wy, ww, wh] = rect(at.wave);
  for (let x = wx; x < wx + ww; x++) on(x, Math.round(wy + wh / 2 + (wh / 2 - 2) * Math.sin((x + f * 4) / 2.5)));
  const [bx, by, bw, bh] = rect(at.bars);
  for (let x = bx + 2; x < bx + bw - 2; x += 3) { const n = 3 + (hash(x, 2) % (bh - 4)); for (let y = by + bh - 2; y > by + bh - 2 - n; y--) { on(x, y); on(x + 1, y); } }
  const cog = src.map(r => r.join(''));
  const b = new Buf(), Z = COG_BOT - COG_TOP + 1;
  b.box({ u0: COG_U + 9, u1: COG_U + 155, v0: 0, v1: COG_V, z0: 0, z1: Z, id: 1,
    front: (i, r) => cog[COG_TOP + r][9 + i],
    side: (j, r, J) => (j === 0 ? cog[COG_TOP + r][154] : j === J - 1 ? 'k' : cog[COG_TOP + r][148]),
    top: (i, j, U, J) => (j === J - 1 ? 'l' : j % 4 === 1 && i % 16 > 2 && i % 16 < 13 ? 'k' : 'M') });
  // the vents on top, on a plane halfway back; the spire upright (round, so not sheared)
  const crop = (x0, x1, y0, y1) => cog.slice(y0, y1 + 1).map(r => r.slice(x0, x1 + 1));
  b.decal(crop(34, 54, 6, 14), 'v', 10, COG_U + 34, Z + 8, 1, 100);
  b.decal(crop(108, 128, 6, 14), 'v', 10, COG_U + 108, Z + 8, 1, 100);
  b.bill(crop(70, 93, 0, 14), COG_U + 82, 10, Z, 1, 100);
  // the drums at both ends, upright
  b.bill(crop(0, 10, 29, COG_BOT), COG_U + 5, COG_V - 2, 0, 1, 200);
  b.bill(crop(153, 163, 29, COG_BOT), COG_U + 158, COG_V - 2, 0, 1, 200);
  b.outline(new Set([1]));
  return { map: b.rows(), shade: shadeLayer(b, null) };
}
// The cogitator's screens on screen (for their glow): each one's rect on the front plane, as 4 points.
function cogScreens() {
  const at = PROP_AT.COGITATOR, Z = COG_BOT - COG_TOP + 1;
  return ['screen', 'wave', 'bars'].map(k => {
    const [x, y, w, h] = rect(at[k]), u0 = COG_U + x, z0 = Z - 1 - (y - COG_TOP);
    return [P(u0, COG_V - 1, z0), P(u0 + w, COG_V - 1, z0), P(u0 + w, COG_V - 1, z0 - h), P(u0, COG_V - 1, z0 - h)];
  });
}

// ---- desks ----------------------------------------------------------------------------------------------------------
const DESK_V = 24, DESK_H = 24; // the body: DESK rows 18..41 on the front, 64 long
function buildDesk(u0, v0, { slate = true, pile = false } = {}) {
  const D = MAPS.DESK, b = new Buf(), top = DESK_H;
  const legs = (j, J) => { const L = J >= 20 ? 'kmMMMk' : 'kmk'; return j < L.length ? L[j] : j >= J - L.length ? L[j - J + L.length] : '.'; };
  b.box({ u0, u1: u0 + 64, v0, v1: v0 + DESK_V, z0: 0, z1: DESK_H, id: 1,
    front: (i, r) => D[18 + r][i],
    side: (j, r, J) => (r >= 19 ? legs(j, J) : j === 0 ? D[18 + r][63] : r === 0 || r === 10 || r === 18 ? 'k' : r === 1 ? 'w' : 'W'),
    top: (i, j, U, J) => {
      const p0 = fl(9 / VS), p1 = fl(21 / VS);
      if (i >= 3 && i < 19 && j >= p0 && j < p1) return j === p0 || j === p1 - 1 || i === 3 || i === 18 ? 'P' : j % 2 ? 'p' : i > 5 && i < 5 + ((i * 7 + j * 5) % 11) ? 'P' : 'p';
      if (j === J - 1) return 'L';
      return j % 6 === 2 && (i * 7 + j * 3) % 11 > 3 ? 'W' : 'w';
    } });
  if (slate) b.box({ u0: u0 + 14, u1: u0 + 38, v0: v0 + 2, v1: v0 + 5, z0: top, z1: top + 18, id: 2,
    front: (i, r) => D[r][12 + i], top: () => 'h', side: (j, r) => (r >= 15 || j === 0 ? 'G' : 'U') });
  if (pile) b.box({ u0: u0 + 6, u1: u0 + 22, v0: v0 + 6, v1: v0 + 18, z0: top, z1: top + 11, id: 3,
    front: (i, r) => (i === 8 ? 'x' : i === 9 ? 'r' : r % 2 ? 'P' : 'p'), side: (j, r) => (r % 2 ? 'B' : 'P'),
    top: (i, j) => (i === 8 ? 'x' : i === 9 ? 'r' : j % 3 === 0 ? 'P' : 'p') });
  // the candle on its brass tray: upright
  b.bill(D.slice(0, 18).map(r => r.slice(46, 60)), u0 + 52, v0 + 12, top, 4, 2);
  b.outline(new Set([1, 2, 3, 4]));
  const [fx, fy] = P(u0 + 52, v0 + 12, top + 15);
  return { map: b.rows(), shade: shadeLayer(b, null), box: { u0, u1: u0 + 64, v0, v1: v0 + DESK_V }, flame: { x: fx, y: fy } };
}

// ---- the scene ------------------------------------------------------------------------------------------------------
// The scribe's loop around desk A: corners in (u, v), walked in order.
const DESK_A = 128, DESK_B = 224, DESK_Y = 56;
const LOOP = [[114, 44], [206, 44], [206, 96], [114, 96]];
const LOOP_LEN = LOOP.reduce((s, p, i) => { const q = LOOP[(i + 1) % 4]; return s + Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]); }, 0);
export const PERIOD = LOOP_LEN;
export function scribeAt(t) { // t: units walked; dir: +u east, -u west, +v south (toward the viewer), -v north
  let d = ((t % LOOP_LEN) + LOOP_LEN) % LOOP_LEN;
  for (let i = 0; i < 4; i++) {
    const p = LOOP[i], q = LOOP[(i + 1) % 4], len = Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]);
    if (d <= len) { const du = Math.sign(q[0] - p[0]), dv = Math.sign(q[1] - p[1]); return { u: p[0] + du * d, v: p[1] + dv * d, dir: du > 0 ? 'e' : du < 0 ? 'w' : dv > 0 ? 's' : 'n' }; }
    d -= len;
  }
}
// a drawn before b: a is wholly behind b along u or v; otherwise by the centre's u + v.
const behind = (a, b) => a.u1 <= b.u0 || a.v1 <= b.v0;
export const order = (a, b) => (behind(a, b) ? -1 : behind(b, a) ? 1 : (a.u0 + a.u1 + a.v0 + a.v1) - (b.u0 + b.u1 + b.v0 + b.v1));

// Scribe frames per direction. Iso: the hand-drawn iso frames (in iso, +u walks down-right = SE). Oblique and
// dimetric: today's frames, reused (east = right, south = down toward the viewer).
// 39 and 30 deg: along the side wall (+v / -v) the less-turned S39 / N39, along the back wall (+u / -u) SE / NW.
function scribeFrames(proj) {
  const iso = { e: 'se', w: 'nw', s: 'sw', n: 'ne' }, asym = { e: 'se', w: 'nw', s: 's39', n: 'n39' }, flat = { e: 'right', w: 'left', s: 'down', n: 'up' };
  const set = proj === 'iso' ? iso : PROJ[proj].asym ? asym : null;
  return Object.fromEntries(['e', 'w', 's', 'n'].map(d => [d, (set ? SCRIBE_ISO[set[d]] : SCRIBE[flat[d]]).map(f => paint(f))]));
}

export function build(proj = 'iso') {
  PR = PROJ[proj]; VS = PR.VS;
  // the canvas: the room's corners projected, plus a margin
  const xs = [], ys = [];
  for (const u of [-WALL_T, ROOM_U]) for (const v of [-WALL_T, ROOM_V]) for (const z of [-SLAB, WALL_H + 2]) { const [x, y] = PR.P(u, v, z); xs.push(x); ys.push(y); }
  const m = 6, x0 = Math.min(...xs) - m, y0 = Math.min(...ys) - m;
  SIZE = { w: Math.max(...xs) + m - x0, h: Math.max(...ys) + m - y0, ox: -x0, oy: -y0 };
  const room = buildRoom(), main = PR;
  // furniture: built in the local projection (crisp, unscaled), moved so its front-bottom-left corner lands where the
  // main projection puts it (the same place when there is no local projection)
  if (main.local) { PR = PROJ[main.local]; VS = PR.VS; }
  const off = (u, v) => { const a = main.P(u, v, 0), b = PR.P(u, v, 0); return [a[0] - b[0], a[1] - b[1]]; };
  const deskA = buildDesk(DESK_A, DESK_Y), deskB = buildDesk(DESK_B, DESK_Y, { pile: true });
  for (const d of [deskA, deskB]) d.off = off(d.box.u0, d.box.v1 - 1);
  const cogOff = off(COG_U + 9, COG_V - 1);
  const canv = o => ({ ...o, cv: paint(o.map) });
  const S = {
    proj, P: main.P, PL: PR.P, dov: main.dov ?? 0, size: SIZE, cogOff,
    room: { ...canv(room), windowDay: paint(room.window, T.ink.windowDay), windowNight: paint(room.window, T.ink.windowNight) },
    desks: [canv(deskA), canv(deskB)], cog: [0, 1, 2, 3].map(cogFrame).map(canv), screens: cogScreens(),
    scribe: scribeFrames(proj), feet: proj === 'iso' || main.asym ? SCRIBE_ISO_FEET : { x: 16, y: 33 },
  };
  PR = main; VS = PR.VS;
  return S;
}

// Glow: a radial light added at (x, y).
function glow(g, x, y, r, col) {
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, col); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(x - r, y - r, 2 * r, 2 * r);
}
const poly = (g, pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };

// Draw scene S at tick t (walked units) into g (S.size canvas, art px).
export function drawScene(g, S, t, night) {
  const { w, h, ox, oy } = S.size, at = ([x, y]) => [x + ox, y + oy], Q = (u, v, z = 0) => at(S.P(u, v, z));
  // a point of a piece of furniture: its local projection, moved by its offset
  const L = (o, u, v, z = 0) => { const [x, y] = at(S.PL(u, v, z)); return [x + o[0], y + o[1]]; };
  // depth of view: a layer further back drawn darker (in the perspective variant)
  const dim = v => (S.dov ? `brightness(${(1 - S.dov * (1 - Math.max(0, Math.min(ROOM_V, v)) / ROOM_V)).toFixed(3)})` : 'none');
  g.clearRect(0, 0, w, h);
  g.drawImage(S.room.cv, 0, 0);
  g.drawImage(night ? S.room.windowNight : S.room.windowDay, 0, 0);
  g.drawImage(S.room.shade, 0, 0);
  // daylight through the window: a pale patch on the floor in front of it
  if (!night) {
    g.save(); g.globalCompositeOperation = 'lighter';
    poly(g, [[WINDOW_U, 0], [WINDOW_U + 32, 0], [WINDOW_U + 44, 70], [WINDOW_U + 8, 70]].map(([u, v]) => Q(u, v)));
    const [ax, ay] = Q(WINDOW_U + 16, 0), [bx, by] = Q(WINDOW_U + 26, 70), grad = g.createLinearGradient(ax, ay, bx, by);
    grad.addColorStop(0, `rgba(${T.light.beam},.14)`); grad.addColorStop(1, `rgba(${T.light.beam},0)`);
    g.fillStyle = grad; g.fill(); g.restore();
  }
  // contact shadows: furniture (its footprint, a little wider), the cogitator, the scribe
  const s = scribeAt(t), [px, py] = Q(s.u, s.v);
  g.save(); g.fillStyle = `rgba(${T.light.shadow},.35)`; g.filter = 'blur(1.5px)';
  for (const d of S.desks) { const { u0, u1, v0, v1 } = d.box; poly(g, [[u0 - 2, v0 - 2], [u1 + 2, v0 - 2], [u1 + 3, v1 + 3], [u0 - 2, v1 + 3]].map(([u, v]) => L(d.off, u, v))); g.fill(); }
  poly(g, [[COG_U + 4, 0], [COG_U + 160, 0], [COG_U + 160, COG_V + 4], [COG_U + 4, COG_V + 4]].map(([u, v]) => L(S.cogOff, u, v))); g.fill();
  g.restore();
  contactShadow(g, { cx: px, cy: py, rx: 11, ry: S.proj === 'iso' ? 5.5 : S.proj === 'a30' ? 6 : S.proj === 'a39' ? 5 : 4 }, 0.55);
  // layers back to front
  const frame = [1, 0, 2, 0][fl(t / 6) % 4], cog = S.cog[fl(t / 10) % S.cog.length];
  const layers = [
    { u0: COG_U, u1: COG_U + 164, v0: 0, v1: COG_V, draw: () => { const [x, y] = S.cogOff; g.drawImage(cog.cv, x, y); g.drawImage(cog.shade, x, y); } },
    ...S.desks.map(d => ({ ...d.box, draw: () => { const [x, y] = d.off; g.drawImage(d.cv, x, y); g.drawImage(d.shade, x, y); } })),
    { u0: s.u - 6, u1: s.u + 6, v0: s.v - 6, v1: s.v + 6, draw: () => g.drawImage(S.scribe[s.dir][frame], px - S.feet.x, py - S.feet.y) },
  ].sort(order);
  for (const o of layers) { g.filter = dim((o.v0 + o.v1) / 2); o.draw(); }
  g.filter = 'none';
  // light: at night the dark, then the candles, screens and coolant burn through it
  if (night) { g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(${T.light.night},.6)`; g.fillRect(0, 0, w, h); g.restore(); }
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const q of S.screens) { poly(g, q.map(([x, y]) => [x + ox + S.cogOff[0], y + oy + S.cogOff[1]])); g.fillStyle = 'rgba(124,255,158,.10)'; g.fill(); }
  const [cx, cy] = L(S.cogOff, COG_U + 82, COG_V + 10, 40);
  glow(g, cx, cy, night ? 90 : 50, night ? 'rgba(124,255,158,.16)' : 'rgba(124,255,158,.06)');
  for (const d of S.desks) { const [fx, fy] = at([d.flame.x + d.off[0], d.flame.y + d.off[1]]); glow(g, fx, fy, night ? 46 : 18, T.light.amber); }
  for (let u = 8; u < ROOM_U; u += 24) { const [x, y] = Q(u, CHANNEL_V + 2); glow(g, x, y, night ? 16 : 10, 'rgba(58,168,100,.18)'); }
  g.restore();
}

// ---- the flat 3/4 reference: the same objects, blitted as the hall draws them ---------------------------------------
export const FLAT = { w: 400, h: 260 };
export function drawFlat(g, t, night) {
  g.clearRect(0, 0, FLAT.w, FLAT.h);
  const C = (drawFlat.cache ??= {}), P2 = (k, map, over) => (C[k] ??= paint(map, over));
  const tile = (k, map, x0, y0, x1, y1) => { const cv = P2(k, map); for (let y = y0; y < y1; y += cv.height) for (let x = x0; x < x1; x += cv.width) g.drawImage(cv, x, y); };
  tile('wall', ROOM.frames.wall, 0, 0, FLAT.w, 120);
  tile('foot', ROOM.frames['wall foot'], 0, 116, FLAT.w, 120);
  tile('floor', ROOM.frames.floor, 0, 120, FLAT.w, FLAT.h);
  tile('chan', ROOM.frames['channel h'], 0, 240, FLAT.w, 244);
  tile('pipe', ROOM.frames['pipe h'], 0, 8, FLAT.w, 14);
  g.drawImage(P2('shelf', MAPS.SHELF), 8, 78);
  g.drawImage(P2(night ? 'wn' : 'wd', MAPS.WINDOW, night ? T.ink.windowNight : T.ink.windowDay), 82, 30);
  g.drawImage(P2('cog', MAPS.COGITATOR), 116, 20);
  g.drawImage(P2('banner', MAPS.BANNER), 290, 40);
  const desk = P2('desk', MAPS.DESK), pile = P2('pile', MAPS.PAPER_STACK);
  // the scribe walks left and right behind the desks
  const span = 300, d = (t * 2) % (2 * span), right = d < span, x = 30 + (right ? d : 2 * span - d) * 0.95;
  const sc = P2(`s${right}${[1, 0, 2, 0][fl(t / 6) % 4]}`, SCRIBE[right ? 'right' : 'left'][[1, 0, 2, 0][fl(t / 6) % 4]]);
  contactShadow(g, { cx: x + 16, cy: 178, rx: 11, ry: 4 }, 0.55);
  g.drawImage(sc, x, 178 - sc.height);
  for (const dx of [120, 230]) { contactShadow(g, { cx: dx + 32, cy: 228, rx: 34, ry: 6 }, 0.5); g.drawImage(desk, dx, 186); }
  g.drawImage(pile, 238, 166);
  if (night) { g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(${T.light.night},.6)`; g.fillRect(0, 0, FLAT.w, FLAT.h); g.restore(); }
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const dx of [120, 230]) glow(g, dx + 50, 188, night ? 46 : 18, T.light.amber);
  glow(g, 198, 60, night ? 90 : 50, night ? 'rgba(124,255,158,.16)' : 'rgba(124,255,158,.06)');
  g.restore();
}
