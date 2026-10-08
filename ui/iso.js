// Iso engine: a pure (no DOM) z-buffer renderer for the 39 deg view, ported from the projection trial
// (tools/iso.mjs). World: u along the back wall (screen right), v toward the viewer, z up; 1 unit = 1 art px
// along an axis. Hidden surfaces: a z-buffer per pixel, depth u + v + z (larger = nearer the camera).
// IsoBuf does not own the projection: callers pass it in, so other views (or a future unification) can share
// the buffer without sharing P39.
const fl = Math.floor;

// 39 deg projection (exact, from the trial): the back wall recedes 3:1, the side wall 2:1.
const TAN39 = Math.sqrt(2 / 3);
export const P39 = (u, v, z = 0) => { const w = fl(v * TAN39); return [u - w, fl(u / 3) + fl(w / 2) - z]; };
// v units per screen row along v (VS); VX = VS / 2 is the per-column step for a decal on the 'u' plane, needed
// because u and v are foreshortened by different amounts (asymmetric: the back wall is 1:1, the side wall is not).
export const VS39 = 2 / TAN39;

// A floor point (x, y) in the hall's logical px maps into this world: on the floor (y >= WALL) u = 2x,
// v = 2(y - WALL), z = 0; on the back wall band (y < WALL) u = 2x, v = 0, z = 2(WALL - y).
export function floorToWorld(x, y, WALL) {
  return y >= WALL ? { u: 2 * x, v: 2 * (y - WALL), z: 0 } : { u: 2 * x, v: 0, z: 2 * (WALL - y) };
}

// Footprint order of two items: a before b when a is wholly behind b along u or v; otherwise by the centre's u + v.
// Right for one pair, but not transitive over many (two footprints apart on both axes, one left and one behind, are
// each 'behind' the other), so a plain sort with it scrambles a crowded scene: sort a whole frame with depthSort.
const behind = (a, b) => a.u1 <= b.u0 || a.v1 <= b.v0;
export const order = (a, b) => (behind(a, b) ? -1 : behind(b, a) ? 1 : (a.u0 + a.u1 + a.v0 + a.v1) - (b.u0 + b.u1 + b.v0 + b.v1));

// Items with a floor footprint (foot { u0, u1, v0, v1 }) in drawing order, back to front: each is drawn after every
// item behind it along an axis where the two overlap on the other (or behind it on both axes); otherwise, and to
// break a cycle, the footprint whose centre's u + v is smaller (further back) goes first.
// ponytail: O(n^2) in the items (~150 in a full hall: well under a millisecond); bucket by screen column if it grows.
const across = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;
export function depthSort(items) {
  const n = items.length, F = items.map(i => i.foot), indeg = new Int32Array(n), next = items.map(() => []);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = F[i], b = F[j];
    let d = 0;
    if (across(a.u0, a.u1, b.u0, b.u1)) d = a.v1 <= b.v0 ? -1 : b.v1 <= a.v0 ? 1 : 0;
    else if (across(a.v0, a.v1, b.v0, b.v1)) d = a.u1 <= b.u0 ? -1 : b.u1 <= a.u0 ? 1 : 0;
    else if ((a.u1 <= b.u0) === (a.v1 <= b.v0)) d = a.u1 <= b.u0 ? -1 : 1;
    if (d < 0) { next[i].push(j); indeg[j]++; } else if (d > 0) { next[j].push(i); indeg[i]++; }
  }
  const key = F.map(f => f.u0 + f.u1 + f.v0 + f.v1), done = new Uint8Array(n), out = [];
  for (let k = 0; k < n; k++) {
    let best = -1;
    for (let i = 0; i < n; i++) if (!done[i] && !indeg[i] && (best < 0 || key[i] < key[best])) best = i;
    if (best < 0) for (let i = 0; i < n; i++) if (!done[i] && (best < 0 || key[i] < key[best])) best = i;
    done[best] = 1; out.push(items[best]);
    for (const j of next[best]) indeg[j]--;
  }
  return out;
}

export class IsoBuf {
  // w, h, ox, oy: the canvas size and world-to-screen offset, in screen px. P: the projection (u, v, z) -> [x, y].
  // opts.VS: v units per screen row (as P39's VS39); opts.asym: true when u and v are foreshortened unevenly, so
  // a decal on the 'u' plane needs the half-step VX = VS / 2 instead of VS.
  constructor(w, h, ox, oy, P, { VS = 1, asym = false } = {}) {
    this.w = w; this.h = h; this.ox = ox; this.oy = oy; this.P = P;
    this.VS = VS; this.VX = asym ? VS / 2 : VS;
    const n = w * h;
    this.ch = new Array(n).fill('.');
    this.dp = new Float32Array(n).fill(-1e9);
    this.id = new Int16Array(n).fill(-1);
    this.face = new Int8Array(n).fill(-1); // 0 top, 1 front (faces +v), 2 side (faces +u), 3 billboard
    this.world = new Int16Array(3 * n); // the (u, v, z) each pixel shows
  }
  px(sx, sy, d, c, id, face, u = 0, v = 0, z = 0) {
    if (c == null || c === '.') return;
    const x = sx + this.ox, y = sy + this.oy;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (d < this.dp[i]) return;
    this.dp[i] = d; this.ch[i] = c; this.id[i] = id; this.face[i] = face;
    this.world[3 * i] = u; this.world[3 * i + 1] = v; this.world[3 * i + 2] = z;
  }
  put(u, v, z, c, id, face, dz = 0) { const [sx, sy] = this.P(u, v, z); this.px(sx, sy, u + v + z + dz, c, id, face, u, v, z); }
  // A box u0..u1, v0..v1, z0..z1 (half-open). Texture coords, pixel units (j is v / VS):
  // top(i, j, U, J) i along u, j along v from the back; front(i, r, U, Z) r down from the top;
  // side(j, r, J, Z) j from the front corner toward the back.
  box({ u0, u1, v0, v1, z0, z1, top, front, side, id = 0, tdz = 0 }) {
    const U = u1 - u0, J = Math.ceil((v1 - v0) / this.VS), Z = z1 - z0;
    if (top) {
      const mine = new Set();
      for (let u = u0; u < u1; u++) for (let v = v0; v < v1; v++) {
        const [sx, sy] = this.P(u, v, z1);
        mine.add((sy + this.oy) * this.w + sx + this.ox);
        this.put(u, v, z1, top(u - u0, fl((v - v0) / this.VS), U, J), id, 0, tdz);
      }
      // the projection misses single pixels inside a top face (where both stairs step together): take them from
      // the face's neighbour, over whatever further back showed through
      for (const i of mine) for (const s of [1, this.w]) {
        const j = i + s;
        if (!mine.has(j) && mine.has(j + s) && this.dp[j] < this.dp[i] && this.id[i] === id) {
          this.ch[j] = this.ch[i]; this.dp[j] = this.dp[i]; this.id[j] = id; this.face[j] = 0;
          for (let k = 0; k < 3; k++) this.world[3 * j + k] = this.world[3 * i + k];
        }
      }
    }
    if (front) for (let u = u0; u < u1; u++) for (let z = z0; z < z1; z++) this.put(u, v1 - 1, z, front(u - u0, z1 - 1 - z, U, Z), id, 1);
    if (side) for (let v = v0; v < v1; v++) for (let z = z0; z < z1; z++) this.put(u1 - 1, v, z, side(fl((v1 - 1 - v) / this.VS), z1 - 1 - z, J, Z), id, 2);
  }
  // A flat map on a wall plane: plane 'v' faces +v at v = at, column c at u = from + c; plane 'u' faces +u at u = at,
  // column c at v = from + (width - 1 - c) * VX (one pixel column each). Row r at z = ztop - r.
  decal(map, plane, at, from, ztop, id = 0, dz = 0.5) {
    const w = map[0].length;
    map.forEach((row, r) => { for (let c = 0; c < row.length; c++) {
      if (plane === 'v') this.put(from + c, at, ztop - r, row[c], id, 1, dz);
      else for (let k = 0; k < this.VX; k++) this.put(at, from + (w - 1 - c) * this.VX + k, ztop - r, row[c], id, 2, dz);
    } });
  }
  // A map standing upright, not sheared (round things: candles, drums, the spire), bottom centre on (u, v, z).
  bill(map, u, v, z, id = 0, dz = 0) {
    const [sx, sy] = this.P(u, v, z), w = map[0].length, h = map.length, x0 = sx - (w >> 1), d = u + v + z + dz;
    map.forEach((row, r) => { for (let c = 0; c < row.length; c++) this.px(x0 + c, sy - h + 1 + r, d, row[c], id, 3, u, v, z); });
  }
  // Outline ('k') the pixels of the given ids that touch the void or something further back.
  outline(ids, gap = 3) {
    const { w, h } = this, mark = [];
    // the projection leaves single-pixel holes inside top faces (where the 3- and 2-stairs step together); fill
    // each from its left (or upper) neighbour on the same top face. Edges are unaffected.
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (this.ch[i] !== '.') continue;
      for (let [a, b] of [[i - 1, i + 1], [i - w, i + w]]) {
        if (this.ch[a] === '.' || this.ch[b] === '.' || (this.face[a] !== 0 && this.face[b] !== 0)) continue;
        if (this.face[a] !== 0) a = b;
        this.ch[i] = this.ch[a]; this.dp[i] = this.dp[a]; this.id[i] = this.id[a]; this.face[i] = 0;
        for (let k = 0; k < 3; k++) this.world[3 * i + k] = this.world[3 * a + k];
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
  rows() { const out = []; for (let y = 0; y < this.h; y++) out.push(this.ch.slice(y * this.w, (y + 1) * this.w).join('')); return out; }
}
