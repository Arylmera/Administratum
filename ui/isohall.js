// The 39° hall's static part: room shell (floors, the north and west walls, cutaway inner walls, channels, pipes) and
// every static prop, rendered once per size/theme/day by the z-buffer (iso.js) into a canvas (app.js background()).
// World (art px, iso.js): a floor point (x, y >= WALL) is u = 2x, v = 2(y - WALL), z = 0; the back wall band (y < WALL)
// is the plane v = 0, z = 2(WALL - y). Everything stays inside the hall's world box u 0..2w, v 0..2(h - WALL),
// z 0..2 WALL, so the projected scene fits view.js sceneSize(hall).
import { IsoBuf, P39, VS39 } from './iso.js';
import { WALL, WALL_DY } from './layout.js';
import { propsOf, wallArt, WIN_Y } from './scene.js';
import { MAPS, MAGOS, MAGOS_AT, PROP_AT, ROOM, RES } from './sprites.js';
import { sheetOf, build39 } from './faces.js';
import { aoBands, FLY_H } from './depth.js';
import { T } from './theme.js';

const SLAB_Z = 32; // a cutaway inner wall: 16 logical px high
const FOOT = 8; // the wall foot, art rows (flat: 4 logical px)
const STRIP = Math.ceil(4 * VS39); // a 4-row floor strip (channel, sill) across v: 4 screen rows
const WALL_V0 = 4; // props against the back wall stand in front of the pipe run (v 1..4)
const CAP = '7'; // the top of a full-height wall
const cut = (i, j, U, J) => (i === 0 || j === 0 || i === U - 1 || j === J - 1 ? 'l' : 'm'); // a cutaway wall's lit top, its rim lighter
const fx = x => Math.round(2 * x), fy = y => Math.round(2 * (y - WALL));

// Every surface of the hall in world coords. kind: floor (a top at z = 0), strip (a floor band over it: channels,
// sills), wall (full height, 1 unit thick, inside the hall's box: north at v 0, west at u 0), slab (a cutaway inner
// wall, SLAB_Z high, lit cap), box (pipes and fittings on the north wall). tex: the room tile (ROOM.frames) it shows;
// foot: the wall foot band under it. Doors (the flat doors' y) are gaps between an east wall's slabs.
export function roomPlan(hall) {
  const { w, h, sw, rx, ox, dx, sd, split, baseH, rows, bays, dy } = hall, D = WALL_DY;
  const U = 2 * w, V = fy(h), Z = 2 * WALL, S = [];
  const add = (kind, name, tex, u0, u1, v0, v1, z0, z1, more) => S.push({ kind, name, tex, u0, u1, v0, v1, z0, z1, ...more });
  const floor = (name, tex, x0, x1, y0, y1) => add('floor', name, tex, fx(x0), fx(x1), fy(y0), fy(y1), 0, 0);
  floor('scriptorium', 'floor', 0, sw, WALL, h);
  floor('passage', 'sanctum passage', sw, rx, WALL, h); // under the east wall: shows in its doorways
  floor('refectorium', 'floor', rx, w, WALL, split - 10);
  floor('sanctum', 'sanctum floor', rx, w, split, baseH);
  // the north wall, as the flat band draws it: scriptorium plates, the east wall's dark column, the right column's
  add('wall', 'north', 'wall', 0, fx(sw), 0, 1, 0, Z, { foot: true });
  add('wall', 'north east wall', 'wall dark', fx(sw), fx(rx), 0, 1, 0, Z);
  add('wall', 'north right', 'wall east', fx(rx), U, 0, 1, 0, Z, { foot: true });
  add('wall', 'west', 'wall', 0, 1, 0, V, 0, Z, { foot: true });
  // cutaway inner walls; the doors as in scene.js doorsOf (refectory 78..98 + D, sanctum 150..186 + sd)
  const slab = (name, x0, x1, y0, y1, tex = 'wall') => { if (y1 > y0) add('slab', name, tex, fx(x0), fx(x1), fy(y0), fy(y1), 0, SLAB_Z); };
  const r0 = 78 + D, r1 = 98 + D, d0 = 150 + sd, d1 = 186 + sd;
  slab('east wall', sw, rx, WALL, r0); slab('east wall', sw, rx, r1, d0); slab('east wall', sw, rx, d1, h);
  // each doorway: a post at either end and a lintel across (brass-capped iron, standing proud of the wall); the door
  // leaves' place (kind door: not drawn here, the dynamic layer slides them; tex: their room tile, the flat frame)
  for (const [name, y0, y1] of [['refectory', r0, r1], ['sanctum', d0, d1]]) {
    const u0 = fx(sw) - 2, u1 = fx(rx) + 2, v0 = fy(y0), v1 = fy(y1);
    add('box', 'jamb', 'pillar', u0, u1, v0 - 4, v0, 0, SLAB_Z + 8);
    add('box', 'jamb', 'pillar', u0, u1, v1, v1 + 4, 0, SLAB_Z + 8);
    add('box', 'lintel', 'pillar', u0, u1, v0, v1, SLAB_Z, SLAB_Z + 8);
    add('door', name, `door ${name} closed`, fx(sw) + 6, fx(sw) + 10, v0, v1, 0, SLAB_Z);
  }
  // the sanctum's back wall carries its hangings (placeProps): as tall as the flat hall's sanctum wall band (30 px)
  add('slab', 'refectorium/sanctum', 'wall', fx(rx), U, fy(split - 10), fy(split), 0, 2 * 30);
  slab('sanctum west', rx + 2, rx + 12, split - 2, d0); slab('sanctum west', rx + 2, rx + 12, d1, baseH); // the pillars
  slab('sanctum east', rx + 126, rx + 136, split - 2, baseH);
  if (dy) slab('bays', rx, w, baseH, h, 'wall');
  // floor strips: a coolant channel under each slot row, the vertical channels, each bay's sill
  const strip = (name, tex, u0, u1, v0, v1) => add('strip', name, tex, u0, u1, v0, v1, 0, 0);
  for (let j = 0; j < rows; j++) { const v = fy(D + (j ? 118 + 64 * j : 116)); strip('channel', 'channel h', 0, fx(sw), v, v + STRIP); }
  for (const x of propsOf(hall).channels) strip('channel', 'channel v', fx(x), fx(x) + 4, 0, V);
  for (let k = 1; k <= bays; k++) { const v = fy(56 + D + 64 * (rows - bays + k - 1)); strip('sill', 'sill', 0, fx(sw), v, v + STRIP); }
  // the pipe run along the north wall (y 4..7), its fittings (y 3..8), the two pipes down behind the cogitator
  const pz = 2 * (WALL - 7);
  add('box', 'pipe', 'pipe h', 0, fx(sw), 1, 4, pz, pz + 6);
  add('box', 'pipe', 'pipe h', fx(rx), U, 1, 4, pz, pz + 6);
  const fits = [20, 64, 110, 150, 190, ...Array.from({ length: Math.max(0, Math.ceil((sw - 236) / 40)) }, (_, i) => 230 + 40 * i), 230 + ox, 280 + ox, 330 + ox];
  for (const x of fits) add('box', 'fitting', 'fitting h', fx(x), fx(x) + 6, 1, 5, pz - 2, pz + 8);
  for (const x of [144 + dx, 194 + dx]) add('box', 'pipe', 'pipe v', fx(x), fx(x) + 6, 1, 4, 2 * 4, pz);
  return { U, V, Z, surfaces: S };
}

// The projected bounding box of the hall's world box (the same 6 points as view.js sceneSize): logical w, h, and the
// art-px offset that puts it at (0, 0).
export function bounds(hall) {
  const U = 2 * hall.w, V = fy(hall.h), Z = 2 * WALL;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [u, v, z] of [[0, 0, Z], [U, 0, Z], [0, 0, 0], [U, 0, 0], [0, V, 0], [U, V, 0]]) {
    const [X, Y] = P39(u, v, z);
    minX = Math.min(minX, X); maxX = Math.max(maxX, X); minY = Math.min(minY, Y); maxY = Math.max(maxY, Y);
  }
  return { w: Math.ceil((maxX - minX) / 2), h: Math.ceil((maxY - minY) / 2), ox: -minX, oy: -minY };
}

// A room tile's texel at (i, r) of a W x H rect, by the tile's fill rule (room.js tile()).
const NO_RULE = {};
function texel(name, i, r, W = 0, H = 0) {
  const t = ROOM.tiles[name] ?? NO_RULE, f = ROOM.frames[name], th = f.length, tw = f[0].length;
  if (t.fill === 'repeat') return (t.top && r < th ? ROOM.frames[t.top] : f)[r % th][i % tw];
  if (t.fill === 'repeat-x' || t.fill === 'repeat-y') return f[r % th][i % tw];
  if (t.fill === 'nine') {
    const E = t.edge, m = (k, K, n) => (k < E ? k : k >= K - E ? n - (K - k) : E + ((k - E) % (n - 2 * E)));
    return f[m(r, H, th)]?.[m(i, W, tw)] ?? '.';
  }
  return f[r]?.[i] ?? '.';
}
const wallTex = (tex, foot, Z) => (i, r) => (foot && r >= Z - FOOT ? texel('wall foot', i, r - Z + FOOT) : texel(tex, i, r));

// Props that stand on the floor and get a contact shadow (scene.js STANDING, not exported there).
const STANDING = new Set(['SHELF', 'CRATE', 'BRAZIER', 'THRONE', 'COGITATOR', 'RECAFF', 'TABLE', 'BENCH', 'LORD_DESK', 'PAPER_STACK', 'BOOKS', 'COG_MECH']);
const onWall = (name, y) => name === 'HANGING' || ((name === 'BANNER' || name === 'CENSER') && y < WALL - WALL_DY); // scene.js hung()
const paste = (g, map, x, y) => map.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] !== '.' && g[y + r]?.[x + c] !== undefined) g[y + r][x + c] = row[c]; });
const grid = (w, h) => Array.from({ length: h }, () => Array(w).fill('.'));
// How far a details-only face sheet reaches toward the viewer from its back (v).
const depthOf = s => s.d || Math.max(1, ...s.details.map(p => p.v + (p.kind === 'box' ? p.d : p.kind === 'cyl' ? p.map[0].length >> 1 : p.kind === 'disc' ? p.t ?? 2 : 1)));

// The sanctum's back wall band in the flat hall (scene.js drawStatic: 'wall sanctum' split..split + 30, its foot the
// last 4 px): in the 39° view the wall between refectorium and sanctum, tall enough to carry what hangs there.
const sanctumBand = ({ split }) => ({ y0: split, y1: split + 30 });
// A z-buffer seen SHIFTED up by Z (a face sheet resting on something, or hung on a wall): build39 builds from z = 0.
const lift = (buf, Z) => ({
  put: (u, v, z, c, id, face, dz) => buf.put(u, v, z + Z, c, id, face, dz),
  box: o => buf.box({ ...o, z0: o.z0 + Z, z1: o.z1 + Z }),
  bill: (m, u, v, z, id, dz) => buf.bill(m, u, v, z + Z, id, dz),
});

// Where each prop of propsOf(hall) goes, from its flat frame's bottom row yb = y + height (its floor contact):
//   on 'wall'  hung in the flat hall: the north wall's hung() set (plane v 0), or inside the sanctum's wall band
//              (plane: that wall's face); z from how far above the wall's foot it sits in the flat frame
//   on 'floor' everything else, its frame's bottom row on the floor line yb; when yb is above the wall foot (books
//              and stacks on a shelf's top), resting at that height (z0) against the north wall
// -> [{ name, map, sheet (face sheet or null: an upright frame), on, u0 (frame column 0), v0 (its back), z0, z1,
//      foot: its floor footprint { u0, u1, v0, v1 } }]
export function placeProps(hall) {
  const art = wallArt(), band = sanctumBand(hall), out = [];
  for (let [name, x, y] of propsOf(hall).props) {
    if (name === 'HANGING' && !art.tallHang) { name = 'BANNER'; x += 0.5; y = 10; } // the short banner, where it hung
    const map = MAPS[name], fw = map[0].length, fh = map.length, yb = y + fh / RES, u0 = fx(x);
    const s = sheetOf(name), sheet = s && (s.front || s.details.length) ? s : null, d = sheet ? depthOf(sheet) : 1;
    const foot = (v0, dd = d) => (sheet?.front ? { u0: u0 + sheet.x0, u1: u0 + sheet.x0 + sheet.w, v0, v1: v0 + dd } : { u0, u1: u0 + fw, v0, v1: v0 + dd });
    const hang = (v0, top) => out.push({ name, x, y, yb, map, sheet, on: 'wall', u0, v0, z0: top - fh, z1: top, foot: foot(v0) });
    if (onWall(name, y)) hang(sheet ? WALL_V0 : 0, 2 * (WALL - y));
    else if (x >= hall.rx && y >= band.y0 && yb <= band.y1) hang(fy(band.y0) - (sheet ? 0 : 1), 2 * (band.y1 - y));
    else {
      const z0 = yb < WALL ? 2 * (WALL - yb) : 0, v0 = z0 ? WALL_V0 : Math.max(WALL_V0, fy(yb) - d);
      out.push({ name, x, y, yb, map, sheet, on: 'floor', u0, v0, z0, z1: z0 + fh, foot: foot(v0) });
    }
  }
  // what rests on a shelf (the flat art overlaps its top by a few px) stands exactly on that shelf's top
  for (const p of out) if (p.on === 'floor' && p.z0) {
    const q = out.find(s => s.name === 'SHELF' && !s.z0 && s.foot.u0 <= (p.foot.u0 + p.foot.u1) / 2 && (p.foot.u0 + p.foot.u1) / 2 < s.foot.u1);
    if (q) { p.z1 += q.z1 - p.z0; p.z0 = q.z1; }
  }
  return out;
}

const ID = { floor: 1, strip: 2, wall: 3, slab: 4, box: 5, window: 6, decal: 7, prop: 10 };

// The z-buffer of the hall (pure: no DOM) and its shading per pixel (0..0.8, the shadow colour's alpha).
export function renderHall39(hall, day = true) {
  const { w, h, ox: bx, oy: by } = bounds(hall);
  const buf = new IsoBuf(2 * w, 2 * h, bx, by, P39, { VS: VS39, asym: true }), plan = roomPlan(hall), Z = plan.Z;
  for (const s of plan.surfaces) {
    const box = { u0: s.u0, u1: s.u1, v0: s.v0, v1: s.v1, z0: s.z0, z1: s.z1, id: ID[s.kind] };
    if (s.kind === 'floor' || s.kind === 'strip') buf.box({ ...box, z0: -1, top: (i, j, W, J) => texel(s.tex, i, j, W, J), tdz: s.kind === 'floor' ? -3 : -2.5 });
    else if (s.kind === 'wall') buf.box({ ...box, top: () => CAP, // one face each: a 1-unit wall's other face would overdraw its edge
      ...(s.name === 'west' ? { side: ((tex) => (j, r, J) => tex(J - 1 - j, r))(wallTex(s.tex, s.foot, Z)) } : { front: wallTex(s.tex, s.foot, Z) }) });
    else if (s.kind === 'slab') buf.box({ ...box, top: cut, front: (i, r) => texel(s.tex, i, r + 20), side: (j, r) => texel(s.tex, j, r + 20) }); // plates below their seam row
    else if (s.kind === 'door') continue; // the dynamic layer's
    else if (s.name === 'jamb' || s.name === 'lintel') buf.box({ ...box, top: cut, front: (i, r) => texel(s.tex, i, r), side: (j, r) => texel(s.tex, j, r) });
    else buf.box({ ...box, front: (i, r) => texel(s.tex, i, r), top: i => texel(s.tex, i, 0), side: (j, r) => texel(s.tex, s.u1 - s.u0 - 1, r) });
  }
  // what hangs on the north wall: the windows (glass recoloured by day/night when painted); then every prop where
  // placeProps puts it: decals or face sheets on a wall plane, face sheets built in 3D or upright frames on the floor
  const art = wallArt();
  for (const x of propsOf(hall).windows) buf.decal(art.win, 'v', 0, fx(x + art.winDx), 2 * (WALL - WIN_Y) - 1, ID.window);
  let id = ID.prop;
  const ids = new Set(), feet = [];
  for (const p of placeProps(hall)) {
    if (p.on === 'wall' && !p.sheet) { buf.decal(p.map, 'v', p.v0, p.u0, p.z1 - 1, ID.decal); continue; }
    const b = p.z0 ? lift(buf, p.z0) : buf;
    if (p.sheet) { build39(b, p.sheet, p.u0, p.v0, id); ids.add(id).add(id + 1); id += 2; }
    else { b.bill(p.map, p.u0 + (p.map[0].length >> 1), p.v0, 0, id); ids.add(id++); }
    if (p.on === 'floor' && !p.z0 && STANDING.has(p.name)) feet.push(p.foot);
  }
  const bill = (map, x, yb, z = 0, dz = 0) => { // a flat frame upright, its bottom centre on the floor line yb
    const u = fx(x) + (map[0].length >> 1), v = Math.max(WALL_V0, fy(yb) - 1);
    buf.bill(map, u, v, z, id, dz); ids.add(id++);
    return { u0: u - (map[0].length >> 1), u1: u + (map[0].length >> 1), v0: v - 6, v1: v + 1 };
  };
  // the grand gate at the scriptorium's bottom edge, from its face sheet (piers, spires, arch, keystone, emblem): the
  // iron leaves closed (GATE_L / GATE_R, over the void) set back in the opening as its 'leaves' part, cut from the frame
  // with them pasted in; the dynamic layer slides them at anchors.gate (the leaves' plane and the opening)
  const A = PROP_AT.GATE, gate = grid(MAPS.GATE[0].length, MAPS.GATE.length), [ow, oh] = A.opening.slice(2).map(n => n * RES);
  paste(gate, MAPS.GATE_VOID, A.opening[0] * RES, A.opening[1] * RES);
  paste(gate, MAPS.GATE_L, A.leafL[0] * RES, A.leafL[1] * RES); paste(gate, MAPS.GATE_R, A.leafR[0] * RES, A.leafR[1] * RES); // closed
  paste(gate, MAPS.GATE, 0, 0);
  const gs = sheetOf('GATE', gate.map(r => r.join(''))), gu = fx(hall.entry.x - A.entry[0]), gv = fy(hall.h) - depthOf(gs);
  build39(buf, gs, gu, gv, id); ids.add(id).add(id + 1); id += 2;
  const back = gs.details.find(p => p.name === 'leaves');
  const anchors = {
    gate: { u0: gu + A.opening[0] * RES, u1: gu + A.opening[0] * RES + ow, v: gv + back.v + back.d, z0: gs.fh - A.opening[1] * RES - oh, z1: gs.fh - A.opening[1] * RES },
    doors: plan.surfaces.filter(s => s.kind === 'door'),
  };
  // ponytail: the Magos and the servo-skulls from today's flat frames, upright; their 39° art (magos39, skull39) comes later
  const mag = grid(MAGOS.body[0].length, MAGOS.body.length), MX = 264 + hall.ox, MY = 120 + hall.sd;
  paste(mag, MAGOS.body, 0, 0); paste(mag, MAGOS.arm, MAGOS_AT.arm.x * RES, MAGOS_AT.arm.y * RES);
  // seated in the throne (scene.js PROPS.s: 268, 124 + sd, its face sheet 24 deep): in front of its back, drawn over the
  // seat and arms as the flat frame is drawn over the throne
  buf.bill(mag.map(r => r.join('')), fx(MX) + (MAGOS.body[0].length >> 1), fy(MY + 24) - 24 + 6, 0, id, 30); ids.add(id++);
  const SK = PROP_AT.SKULL, skullAt = (cx, cy) => bill(MAPS.SKULL, cx - SK.centre[0], cy + FLY_H, 2 * (FLY_H - MAPS.SKULL.length / RES + SK.centre[1]));
  skullAt(244 + hall.ox + SK.centre[0], 50 + WALL_DY + SK.centre[1]); // the refectorium's (scene.js drawDecorFrame)
  skullAt(297 + hall.ox, 128 + hall.sd); // on its perch by the Magos (scene.js perchOf)

  buf.outline(ids);
  buf.outline(new Set([ID.floor, ID.wall, ID.slab, ID.box]));

  // shading: side faces darker; floor AO along every wall foot (depth.js aoBands, plus the west wall; no south wall:
  // cutaway); walls darker toward the floor; prop contact shadows baked from their footprints
  const shade = new Float32Array(buf.ch.length);
  const bands = aoBands(hall).filter(b => !(b.side === 's' && b.x === 0)).concat({ x: 0, y: WALL, w: 8, h: hall.h - WALL, side: 'w' });
  const N = buf.ch.length, W3 = buf.world;
  for (let i = 0; i < N; i++) {
    if (buf.ch[i] === '.') continue;
    const k = buf.id[i], f = buf.face[i];
    let a = f === 2 ? 0.2 : 0;
    if ((k === ID.floor || k === ID.strip) && f === 0) {
      const x = W3[3 * i] / 2, y = W3[3 * i + 1] / 2 + WALL;
      for (const b of bands) {
        if (x < b.x || x >= b.x + b.w || y < b.y || y >= b.y + b.h) continue;
        const t = b.side === 'n' ? 1 - (y - b.y) / b.h : b.side === 's' ? (y - b.y) / b.h : b.side === 'w' ? 1 - (x - b.x) / b.w : (x - b.x) / b.w;
        a = Math.max(a, 0.45 * t);
      }
    } else if ((k === ID.wall || k === ID.slab) && f > 0 && W3[3 * i + 2] < 16) a += 0.3 * (1 - W3[3 * i + 2] / 16);
    shade[i] = Math.min(0.8, a);
  }
  const alpha = day ? 0.35 : 0.21; // flat: contact shadows 0.5 by day, 0.3 at night, soft edged
  for (const { u0, u1, v0, v1 } of feet) for (let u = u0 - 2; u < u1 + 2; u++) for (let v = v0 - 2; v < v1 + 3; v++) {
    const [sx, sy] = P39(u, v, 0), X = sx + bx, Y = sy + by;
    if (X < 0 || Y < 0 || X >= buf.w || Y >= buf.h) continue;
    const i = Y * buf.w + X;
    if ((buf.id[i] !== ID.floor && buf.id[i] !== ID.strip) || buf.face[i] !== 0) continue;
    const edge = Math.min(1, (Math.min(u - u0 + 2, u1 + 2 - u, v - v0 + 2, v1 + 3 - v) + 1) / 3);
    shade[i] = Math.min(0.8, 1 - (1 - shade[i]) * (1 - alpha * edge));
  }
  return { buf, shade, w, h, ox: bx, oy: by, anchors };
}

// The 39° hall as a canvas (art px, RES per logical px), the art-px offset of the world origin on it, and the anchors
// of what the dynamic layer draws into it (world coords): gate { u0, u1, v (the leaves' plane), z0, z1 } (the opening),
// doors [{ name, tex, u0, u1, v0, v1, z0, z1 }] (each doorway's leaves). Painted in
// the theme's px colours, the shading blended in; the windows' glass in the day or night colours (T.ink.window*).
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
export function buildHall39(hall, day = true) {
  const { buf, shade, ox, oy, anchors } = renderHall39(hall, day);
  const pal = { ...T.px }, win = { ...T.px, ...(day ? T.ink.windowDay : T.ink.windowNight) }, cache = new Map();
  const colour = (c, glass) => { const k = glass ? c + '!' : c; let v = cache.get(k); if (!v) cache.set(k, v = rgb((glass ? win : pal)[c] ?? '#000000')); return v; };
  const [sr, sg, sb] = T.light.shadow.split(',').map(Number);
  const cv = document.createElement('canvas');
  cv.width = buf.w; cv.height = buf.h;
  const g = cv.getContext('2d'), img = g.createImageData(buf.w, buf.h), D = img.data;
  for (let i = 0; i < buf.ch.length; i++) {
    const c = buf.ch[i];
    if (c === '.' || !pal[c]) continue;
    const [r, gg, b] = colour(c, buf.id[i] === ID.window), a = shade[i];
    D[4 * i] = r + (sr - r) * a; D[4 * i + 1] = gg + (sg - gg) * a; D[4 * i + 2] = b + (sb - b) * a; D[4 * i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { canvas: cv, ox, oy, anchors };
}
