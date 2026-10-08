// The 39° view's dynamic layer: everything drawScene (scene.js) draws each frame in the flat view, drawn over the cached
// 39° hall (isohall.js) by projecting floor positions. Furniture (desks, lecterns, consoles) is built in 3D once per
// theme from its face sheet (faces.js build39) into sprite canvases; actors are their 39° frames (actors.js bodyOf39)
// or, while a theme has no 39° art, today's flat frames standing upright; everything standing is depth sorted by its
// floor footprint (depthSort). Flat drawing helpers are reused through canvas transforms: what lies on the floor
// (rugs, fallen sheets, shadows) through the floor plane's affine map, what sits on a face (seals, lamps, screens,
// the cogitator's animation) through that face's plane, what stands upright (actors, flames, skulls) translated onto
// its projected foot. Positions stay in the hall's logical px (x, y); world art px: u = 2x, v = 2(y - WALL), z up.
import { P39, IsoBuf, VS39, TAN39 as K, depthSort } from './iso.js';
import { WALL, WALL_DY } from './layout.js';
import { toFloor } from './view.js';
import { bounds, placeProps, gateOf } from './isohall.js';
import { build39, sheetOf } from './faces.js';
import { MAPS, PROP_AT, ROOM, RES, MAGOS, MAGOS_AT, MAGOS39, MAGOS39_AT, SKULL39, SKULL39_AT, SCRIBE39, SCRIBE39_AT, blit, sprite } from './sprites.js';
import { T, onTheme, hexA } from './theme.js';
import { drawActor, bodyOf, bodyOf39, bobOf, dozing, isQuestion, BURN_S, PUFF_S, FX_S, PICK_S } from './actors.js';
import { shadowOf, contactShadow, castShadow, casterOf, FLY_H } from './depth.js';
import * as S from './scene.js';

const fl = Math.floor;
const half = v => Math.round(v * 2) / 2;
const rect = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };

// The hall drawn: its art-px offset on the canvas (bounds: the same as view.js toScreen's) and its placed props.
let H = null, B = { ox: 0, oy: 0 }, key = '', placed = [];
export function use(hall) {
  const k = `${T.id}:${hall.w}x${hall.h}:${hall.bays}`;
  H = hall;
  if (k === key) return;
  key = k; B = bounds(hall); placed = placeProps(hall); doors = null;
}
onTheme(() => { key = ''; kit = null; doors = null; });

// A world point (art px) to screen logical px: exact (P39's floors, as the background) or continuous (for transforms
// and smooth motion; within one art px of the exact one).
const exact = (u, v, z = 0) => { const [X, Y] = P39(u, v, z); return [(X + B.ox) / RES, (Y + B.oy) / RES]; };
const cont = (u, v, z = 0) => [(u - K * v + B.ox) / RES, (u / 3 + K * v / 2 - z + B.oy) / RES];
// A floor point (x, y, logical) on screen, snapped to the art-px grid.
export const pin = (x, y, z = 0) => cont(2 * x, 2 * (y - WALL), 2 * z).map(half);
// g's transform maps local (lx, ly) to the world point p0 + lx du + ly dv (affine: P39 without its floors).
function plane(g, p0, du, dv) {
  const [e, f] = cont(...p0), [a, b] = cont(p0[0] + du[0], p0[1] + du[1], p0[2] + du[2]), [c, d] = cont(p0[0] + dv[0], p0[1] + dv[1], p0[2] + dv[2]);
  g.transform(a - e, b - f, c - e, d - f, e, f);
}
const onFloor = g => plane(g, [0, -2 * WALL, 0], [2, 0, 0], [0, 2, 0]); // flat (x, y) on the floor
// flat (x, y) on the face v = at (facing the viewer), the flat row yb at height z0: a front, a screen, a wall
const onFace = (g, at, yb, z0 = 0) => plane(g, [0, at, z0 + 2 * yb], [2, 0, 0], [0, 0, -2]);
// flat (x, y) upright, the flat point (x, y) standing on the screen point s
const upright = (g, x, y, s) => g.translate(s[0] - x, s[1] - y);
const save = (g, set, draw) => { g.save(); set(g); draw(g); g.restore(); };

// ---- sprites built once per theme ---------------------------------------------------------------------------------
// A z-buffer holding a face sheet built from (0, 0, 0), sized to its projected box, outlined like the hall's props.
function bake(corners, build) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [u, v, z] of corners) { const [X, Y] = P39(u, v, z); x0 = Math.min(x0, X); y0 = Math.min(y0, Y); x1 = Math.max(x1, X); y1 = Math.max(y1, Y); }
  const buf = new IsoBuf(x1 - x0 + 5, y1 - y0 + 5, 2 - x0, 2 - y0, P39, { VS: VS39, asym: true });
  build(buf);
  buf.outline(new Set([1, 2]));
  return buf;
}
const box = (u0, u1, v0, v1, z0, z1) => [u0, u1].flatMap(u => [v0, v1].flatMap(v => [[u, v, z0], [u, v, z1]]));
const rgbs = new Map();
const rgb = hex => rgbs.get(hex) ?? rgbs.set(hex, [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))).get(hex);
// The buffer in the theme's colours (over: a palette override, null hides a colour), side faces shaded as the hall's.
function paint(buf, over) {
  const pal = { ...T.px, ...over }, [sr, sg, sb] = T.light.shadow.split(',').map(Number);
  const cv = document.createElement('canvas');
  cv.width = buf.w; cv.height = buf.h;
  const g = cv.getContext('2d'), img = g.createImageData(buf.w, buf.h), D = img.data;
  for (let i = 0; i < buf.ch.length; i++) {
    const c = pal[buf.ch[i]];
    if (!c) continue;
    const [r, gg, b] = rgb(c), a = buf.face[i] === 2 ? 0.2 : 0;
    D[4 * i] = r + (sr - r) * a; D[4 * i + 1] = gg + (sg - gg) * a; D[4 * i + 2] = b + (sb - b) * a; D[4 * i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return cv;
}
const drawBuf = (g, buf, cv, u, v, z = 0) => { const [X, Y] = exact(u, v, z); g.drawImage(cv, X - buf.ox / RES, Y - buf.oy / RES, cv.width / RES, cv.height / RES); };

// Desks, lecterns, consoles: their face sheet's sizes, and (art(), on first draw) the sprite lit (candle, screen) and
// dim (scene.js KIND dim palettes), anchor: world (0, 0, 0).
let kit = null;
function furnitureKit() {
  if (kit) return kit;
  kit = {};
  for (const kind of ['desk', 'lectern', 'console']) {
    const name = S.KIND[kind].map, s = sheetOf(name);
    kit[kind] = { kind, name, s, d: s.d, x0: s.x0, w: s.w, fh: s.fh, top: s.h };
  }
  return kit;
}
function art(k) {
  if (!k.buf) {
    const { s } = k;
    k.buf = bake(box(0, s.fw, 0, s.d, 0, s.fh + 4), b => build39(b, s, 0, 0, 1));
    k.lit = paint(k.buf); k.dim = paint(k.buf, S.KIND[k.kind].dim());
  }
  return k;
}
// A piece of furniture at its flat top-left (x, y): its frame's column 0 at u = 2x, its front on the flat frame's
// bottom row (the floor line yb), its back d further; foot: its floor footprint (the depth sort's).
export function placeOf(kind, at) {
  const k = furnitureKit()[kind], yb = at.y + k.fh / RES, u0 = Math.round(2 * at.x), v0 = Math.round(2 * (yb - WALL)) - k.d;
  return { k, u0, v0, yb, foot: { u0: u0 + k.x0, u1: u0 + k.x0 + k.w, v0, v1: v0 + k.d } };
}
// An actor's floor footprint: a small box at its feet.
export const actorFoot = a => { const x = Math.round(a.x), v = 2 * (Math.round(a.y) - WALL); return { u0: 2 * x - 4, u1: 2 * x + 4, v0: v - 3, v1: v + 1 }; };

// The doorways' leaves (isohall anchors.doors), closed and open: a box in the opening, its +u face (the one the view
// sees) the flat door frame turned upright (its rows along v, its columns down the height), open: the leaves gone
// into the wall, only their ends showing.
let doors = null;
function doorKit(list) {
  if (doors) return doors;
  doors = {};
  for (const s of list) for (const open of [false, true]) {
    const f = ROOM.frames[`door ${s.name} ${open ? 'open' : 'closed'}`], R = f.length - 8, C = f[0].length - 6;
    const tex = (j, J, r, Z) => f[4 + Math.min(R - 1, fl(j * R / J))][3 + Math.min(C - 1, fl(r * C / Z))];
    const buf = bake(box(s.u0, s.u1, s.v0, s.v1, s.z0, s.z1), b => b.box({ u0: s.u0, u1: s.u1, v0: s.v0, v1: s.v1, z0: s.z0, z1: s.z1, id: 1,
      side: (j, r, J, Z) => tex(J - 1 - j, J, r, Z), top: (i, j, U, J) => tex(j, J, 0, 1), front: (i, r, U, Z) => tex(R - 1, R, r, Z) }));
    doors[`${s.name}:${open}`] = { buf, cv: paint(buf) };
  }
  return doors;
}

// ---- the frame ----------------------------------------------------------------------------------------------------
// Seated 39° scribes: how far (logical floor px) each is drawn north of its seat, so its hands rest on the desk top
// (layout.js seats a scribe 9 px south of its desk's front; the 39° view shows the desk's real height). Set each frame
// by the desks, read by spriteOf (drawing, shadows, hit test); eased in over SIT_MS of the desk pose and out over
// SIT_MS once it leaves (sits: id -> its sitLevel state, its seat's full shift and the desk's front yb).
const seated = new Map(), sits = new Map(), SIT_MS = 300;
// How far down into its seat a scribe is at now (0 standing .. 1 seated), easing over SIT_MS toward down from wherever
// it was when it last turned (e: { k, t, down }, updated in place): sitting down and standing up are symmetric.
export function sitLevel(e, down, now) {
  const k = Math.max(0, Math.min(1, e.k + (e.down ? 1 : -1) * (now - e.t) / SIT_MS));
  if (down !== e.down) Object.assign(e, { k, t: now, down });
  return k;
}
const handRow = new WeakMap(); // arm frame -> its first opaque row (the hands), logical px
const handOf = m => handRow.get(m) ?? handRow.set(m, Math.max(0, m.findIndex(r => /[^.]/.test(r))) / RES).get(m);
// The shift that puts the hands on the middle of the desk top's depth: between 0 and the gap to the desk's front.
export function seatShift(p, a) {
  if (!SCRIBE39.arm) return 0;
  const A = SCRIBE39_AT, x = Math.round(a.x), y = Math.round(a.y), u = 2 * (x - A.feet.x + A.arm.x);
  const hands = cont(2 * x, 2 * (y - WALL))[1] - A.feet.y + A.arm.y + handOf(SCRIBE39.arm);
  const mid = cont(u, p.v0 + p.k.d / 2, p.k.top)[1];
  return half(Math.max(0, Math.min(y - p.yb - 1, (hands - mid) / (K / 2))));
}

// One frame over the 39° background: layout (app.js glide(): blocks, desks, consoles; hall, level, anchors: the
// background's isohall anchors), actors: Cast.actors, fillOf: context -> paper fill. Returns the frame's lights (flat
// floor coords, as drawScene's: lighting.js projects them).
export function drawScene39(g, layout, actors, fillOf, now) {
  const dt = S.beginFrame(layout, now), t = now / 1000;
  use(layout.hall);
  const all = [...actors.values()], items = [], over = [], floor = [], lights = [];
  const dark = layout.level?.dark ?? 0.18, shade = 0.5 - 0.33 * (dark - 0.18);
  const blockOf = dept => layout.blocks.find(b => b.name === dept);
  floor.push(g2 => S.drawRugs(g2, layout.blocks));

  const furniture = (kind, at, pile, lit, fill, a, bgShell, block) => {
    const p = placeOf(kind, at), AT = S.KIND[kind].at, front = g2 => onFace(g2, p.v0 + p.k.d - 1, p.yb), slate = g2 => onFace(g2, p.v0 + 4, p.yb);
    // the desk's top: flat rows from 9 px under the frame's top spread back to front over it; a console's pile lies beside it, on the floor (floor pass)
    const top = g2 => plane(g2, [0, p.v0 - 2.6 * (at.y + 9), p.k.top], [2, 0, 0], [0, 2.6, 0]);
    floor.push(g2 => S.paperFloor(g2, pile, kind, fill, at, block, now));
    if (kind === 'console') floor.push(g2 => S.paperTop(g2, pile, kind, fill, at)); // flat on the floor, under its adept
    floor.push(g2 => { const e = shadowOf(MAPS[p.k.name], at.x, at.y); if (e) e.cy -= p.k.d / 4; contactShadow(g2, e, shade); });
    items.push({ foot: p.foot, draw(g2) {
      const k = art(p.k);
      drawBuf(g2, k.buf, lit ? k.lit : k.dim, p.u0, p.v0);
      if (kind !== 'console') save(g2, top, g3 => S.paperTop(g3, pile, kind, fill, at));
      if (bgShell) save(g2, front, g3 => S.spinCog(g3, at.x + AT.cog[0], at.y + AT.cog[1], t));
      if (!a) return;
      if (!a.h) save(g2, front, g3 => { const n = (a.seals ?? 0) - (S.stamping(a) ? 1 : 0); for (let i = 0; i < n; i++) S.seal(g3, at.x + AT.seals[i][0], at.y + AT.seals[i][1], 1); });
      if (a.lamp) save(g2, slate, g3 => S.drawLamp(g3, a, at, AT));
    } });
    if (a) reactions(a, at, AT, front, slate, over, lights, floor, now);
    return p;
  };
  seated.clear();
  for (const d of layout.desks) {
    const a = actors.get(d.id), pile = d.id ?? d.was ?? d.key, kind = S.kindOf(d), fill = S.deskFill(d, a, fillOf);
    const busy = !!a && a.pose === 'desk' && a.s.status === 'busy';
    const p = furniture(kind, d, pile, busy, fill, d.id && a, !!a?.s.background, blockOf(d.dept));
    if (a?.pose === 'desk') Object.assign(sits.get(a.id) ?? sits.set(a.id, { k: 0, t: now, down: true }).get(a.id), { shift: seatShift(p, a), yb: p.yb, seen: true });
    if (d.id) lights.push(S.deskLight(d, busy));
    if (a?.puff > 0) {
      const k = 1 - a.puff / PUFF_S, [px, py] = S.KIND[kind].at.puff;
      items.push({ foot: { ...p.foot, v0: p.foot.v1, v1: p.foot.v1 + 1 }, draw: g2 => save(g2, g3 => onFace(g3, p.v0 + p.k.d - 1, p.yb), g3 => S.puff(g3, d.x + px, d.y + py, k)) });
      lights.push({ x: d.x + px, y: d.y + py - 1, r: 18 * (1 - k), color: T.light.amber });
    }
  }
  for (const [id, e] of sits) {
    const a = actors.get(id), k = a ? sitLevel(e, e.seen, now) : 0;
    if (!a || (!k && !e.seen)) { sits.delete(id); continue; }
    e.seen = false;
    // a scribe getting up walks off while it eases: never drawn into the desk it leaves (feet kept south of its front)
    seated.set(id, Math.min(e.shift * k, Math.max(0, Math.round(a.y) - e.yb - 1)));
  }
  for (const c of layout.consoles) {
    const a = actors.get(c.id), lit = !!a && a.pose === 'console';
    furniture('console', c, c.id, lit, fillOf(a?.h?.context), a, false, blockOf(c.dept));
    lights.push(S.consoleLight(c, lit));
  }

  // actors, their contact and cast shadows
  const room = S.staticLights(H), known = room.concat(lights);
  for (const a of all) {
    const r = spriteOf(a), [x, y] = feetOf(a, r);
    items.push({ foot: actorFoot(a), draw: g2 => drawActor39(g2, a, r, fillOf) });
    const e = actorShadow(a, r), c = casterOf(x, y, known, dark);
    if (c) { const cv = sprite(r.map, r.over); floor.push(g2 => castShadow(g2, cv, { x: x + r.dx, y: y + r.dy, w: cv.width / RES, h: cv.height / RES }, c.from, c.alpha)); }
    floor.push(g2 => contactShadow(g2, e, shade));
  }

  // the room's moving parts
  const an = layout.anchors;
  if (an) {
    const K2 = doorKit(an.doors);
    for (const d of S.doorsOf(H)) {
      const s = an.doors.find(q => q.name === d.name), open = S.near(all, d.x0, d.y0, d.x1, d.y1), k = K2[`${d.name}:${open}`];
      if (s && k) items.push({ foot: s, draw: g2 => drawBuf(g2, k.buf, k.cv, 0, 0) });
    }
  }
  items.push(...gateItems(all, dt), magos(t, dt));

  save(g, onFloor, g2 => floor.forEach(f => f(g2)));
  cogitator(g, t, all.filter(a => a.pose === 'cog').length);
  depthSort(items).forEach(it => it.draw(g));
  over.forEach(f => f(g));
  for (const a of all) if (a.burn && a.pose === 'burn') { // the brazier's fire over the burner's hem (scene.js)
    const k = 1 - a.burn.left / BURN_S, f = a.burn.fire, heat = k < 0.25 ? k / 0.25 : (1 - k) / 0.75, yb = brazierFoot(f);
    save(g, g2 => upright(g2, f.x, yb, pin(f.x, yb)), g2 => S.flare(g2, f, k, heat, t));
    lights.push({ x: f.x, y: f.y - 2, r: 26 + 44 * heat, color: T.light.burn, flicker: true });
  }
  const sk = PROP_AT.SKULL.centre, sy = Math.round(2 * Math.sin(t * 4)) / 2; // the refectorium's skull (scene.js drawDecorFrame)
  skullAt(g, 244 + H.ox + sk[0], 50 + WALL_DY + sk[1], sy);
  return room.concat(lights, alarm(g, all, now));
}

// The frame an actor shows (39° art, else the flat frame upright), its top-left relative to its feet, and seat: how
// far north of its seat (floor px) a seated 39° scribe is drawn (0 otherwise). seat: a test's override.
export function spriteOf(a, seat = seated.get(a.id) ?? 0) {
  const b = bodyOf39(a);
  if (b) return { ...b, seat };
  const f = bodyOf(a);
  return { map: f.map, over: f.over, dx: f.x - Math.round(a.x), dy: f.y - Math.round(a.y), step: f.step, flat: true, seat: 0 };
}
// Where the actor's feet are drawn, on the floor (logical px): its position, a seated scribe north of its seat.
export const feetOf = (a, r) => [Math.round(a.x), Math.round(a.y) - r.seat];
// Its contact shadow on the floor (depth.js), under the drawn feet.
export function actorShadow(a, r) {
  const [x, y] = feetOf(a, r), e = shadowOf(r.map, x + r.dx, y + r.dy);
  if (e && r.step > 0) e.rx -= 0.5; // a stride: the feet apart, the shadow tighter
  return e;
}
function drawActor39(g, a, r, fillOf) {
  const [fx0, fy0] = feetOf(a, r), x = Math.round(a.x), y = Math.round(a.y);
  g.save();
  upright(g, x, y, pin(fx0, fy0)); // flat coords around (x, y) stand on the drawn feet
  if (r.flat) drawActor(g, a); // the flat frames, arms, scroll and Zs, standing on the projected feet
  else {
    const fx = x + r.dx, fy = y + r.dy - bobOf(r);
    blit(g, r.map, fx, fy + (a.h && a.pose !== 'walk' && Math.sin(a.t * 11) > 0.3 ? 0.5 : 0), r.over);
    if (!a.h && a.pose !== 'burn') {
      const A = SCRIBE39_AT, scroll = isQuestion(a.s) ? MAPS.QSCROLL : SCRIBE39.scroll;
      if (a.pose === 'walk') { if (a.target?.pose === 'queue') blit(g, scroll, fx + A.scroll.x, fy + A.scroll.y); }
      else {
        const done = a.pose === 'desk' && a.fx?.find(f => f.kind === 'task-done');
        const lift = done ? Math.round(8 * Math.min(1, done.t / 0.3, (FX_S['task-done'] - done.t) / 0.3)) / 2 : 0;
        blit(g, SCRIBE39.arm, fx + A.arm.x, fy + A.arm.y - lift);
        blit(g, SCRIBE39.armL, fx + A.armL.x, fy + A.armL.y - lift);
        if (done) blit(g, MAPS.SCROLL_HELD, fx + 1.5, fy - 4 - lift);
        if (a.pose === 'queue') blit(g, scroll, fx + A.scroll.x, fy + A.scroll.y);
        if (a.pose === 'nap' || (!done && a.pose === 'desk' && a.s.status === 'idle' && !a.s.background)) dozing(g, fx + 11, fy - 2, a.t);
      }
    }
  }
  if (a.burn) S.bundle(g, a, fillOf(a.burn.old));
  g.restore();
}

// Chronicle reactions (scene.js reactions), on the furniture's faces: seals and stamps on its front, sparks on its
// screen, the courier skull flying in, the task-done glint over the scribe.
function reactions(a, at, AT, front, slate, over, lights, floor, now) {
  const t = now / 1000;
  lights.push(...S.reactionLights(a, at, AT, now));
  for (const f of a.fx ?? []) {
    const k = f.t / FX_S[f.kind];
    if (f.kind === 'commit') {
      const [sx, sy] = AT.seals[a.h ? 0 : S.newest(a)], x = at.x + sx, y = at.y + sy;
      over.push(g => save(g, front, g2 => S.stamp(g2, x, y, f.t, a.h)));
    }
    if (f.kind === 'push') {
      const p = S.courierOf(a, f, at, AT, t);
      over.push(g => skullAt(g, p.x, p.y, 0, undefined, f.t >= PICK_S));
    }
    if (f.kind === 'tool-error') {
      const [sx, sy, sw, sh] = AT.screen, x = at.x + sx, y = at.y + sy;
      over.push(g => save(g, slate, g2 => S.spark(g2, x, y, sw, sh, k, AT.scale, t)));
    }
    if (f.kind === 'task-done') {
      const [x, y] = S.glintAt(a), fx = Math.round(a.x), fy = Math.round(a.y);
      over.push(g => save(g, g2 => upright(g2, fx, fy, pin(fx, fy)), g2 => S.glint(g2, x, y, k)));
    }
  }
}

// A servo-skull centred on (x, y) (flat coords: FLY_H above the floor point (x, y + FLY_H)), bobbing by bob, its
// shadow on the floor; the 39° skull if the theme has one. carry: the pushed sheet's seal under it.
function skullAt(g, x, y, bob = 0, over, carry = false) {
  const own = SKULL39.skull, map = own ?? MAPS.SKULL, c = own ? [SKULL39_AT.centre.x, SKULL39_AT.centre.y] : PROP_AT.SKULL.centre;
  save(g, onFloor, g2 => S.flyShadow(g2, x, y));
  save(g, g2 => upright(g2, x, y + FLY_H, pin(x, y + FLY_H)), g2 => {
    const X = half(x) - c[0], Y = half(y + bob) - c[1];
    blit(g2, map, X, Y, over);
    if (carry) { const [kx, ky] = own ? [SKULL39_AT.carry.x, SKULL39_AT.carry.y] : PROP_AT.SKULL.carry; S.seal(g2, X + kx, Y + ky, 1); }
  });
}

// The grand gate (isohall gateOf) as two items: at the back, the void in its opening and the iron leaves sliding apart
// in front of it while anyone is near (scene.js stepGate: one state for both views), clipped to the opening; in front,
// its frame (built once per theme), its footprint reaching to its standing parts' front (piers, arch: not the flat
// base and step), so an actor on the step at the entry is drawn over it and one walking through behind it.
let gateKit = null;
// The two items' footprints: they meet at the leaves' face (back: up to it, frame: from it), so the back is wholly
// behind the frame along v and depthSort draws the frame after it whatever the input order (a constraint, not a tie).
export function gateFeet(hall) {
  const G = gateOf(hall), sh = G.sheet, vf = G.v0 + G.leaves.v + G.leaves.d - 1, u0 = G.u0 + 2 * PROP_AT.GATE.opening[0];
  const front = Math.max(G.leaves.v + G.leaves.d, ...sh.details.filter(p => p.rect[3] > 8).map(p => p.v + (p.d ?? p.t ?? 2)));
  return { G, back: { u0, u1: u0 + 2 * PROP_AT.GATE.opening[2], v0: G.v0, v1: vf }, frame: { u0: G.u0, u1: G.u0 + sh.fw, v0: vf, v1: G.v0 + front } };
}
function gateItems(all, dt) {
  const A = PROP_AT.GATE, GX = H.entry.x - A.entry[0], GY = H.entry.y - A.entry[1], [ow, oh] = A.opening.slice(2), ox = GX + A.opening[0], oy = GY + A.opening[1];
  const s = S.stepGate(all, dt);
  if (gateKit?.key !== key) {
    const F = gateFeet(H), sh = F.G.sheet, buf = bake(box(0, sh.fw, 0, 2 * (H.h - WALL) - F.G.v0, 0, sh.fh + 4), b => build39(b, sh, 0, 0, 1));
    gateKit = { key, ...F, buf, cv: paint(buf) };
  }
  const { G, back, frame } = gateKit, sh = G.sheet, yb = GY + sh.fh / RES, vl = G.v0 + G.leaves.v;
  return [{ foot: back, draw(g) {
    save(g, g2 => onFace(g2, vl, yb), g2 => blit(g2, MAPS.GATE_VOID, ox, oy));
    save(g, g2 => onFace(g2, vl + G.leaves.d - 1, yb), g2 => {
      g2.beginPath(); g2.rect(ox, oy, ow, oh); g2.clip();
      blit(g2, MAPS.GATE_L, GX + A.leafL[0] - s, GY + A.leafL[1]); blit(g2, MAPS.GATE_R, GX + A.leafR[0] + s, GY + A.leafR[1]);
    });
  } }, { foot: frame, draw: g => drawBuf(g, gateKit.buf, gateKit.cv, G.u0, G.v0) }];
}

// The Magos on the throne (scene.js drawMagos), its 39° art if the theme has one: the drill arm swings, the chest
// screen scans, the optics pulse. Upright, its bottom centre where the hall's throne seats it.
function magos(t, dt) {
  const own = MAGOS39.body, body = own ?? MAGOS.body, arm = own ? MAGOS39.arm : MAGOS.arm, A = own ? MAGOS39_AT : MAGOS_AT;
  const MX = 264 + H.ox, MY = 120 + H.sd, fw = MAGOS.body[0].length, u = Math.round(2 * MX) + (fw >> 1), v = Math.round(2 * (MY + 24 - WALL)) - 12, SEAT = 4; // seated mid-seat, raised SEAT art px: his lap on the seat, his shins over its front
  const bx = MX + (fw - body[0].length) / (2 * RES), by = MY + (MAGOS.body.length - body.length) / RES; // the frame, bottom centre kept
  return { foot: { u0: u - 8, u1: u + 8, v0: v - 4, v1: v + 2 }, draw: g => save(g, g2 => upright(g2, MX + fw / (2 * RES), MY + MAGOS.body.length / RES, cont(u, v, SEAT).map(half)), g2 => {
    const sway = Math.sin(t * 0.7) > 0 ? 0.5 : 0;
    blit(g2, body, bx, by); blit(g2, arm, bx + A.arm.x + sway, by + A.arm.y);
    rect(g2, bx + A.chest.x, by + A.chest.y + (fl(t * 5) % 3) / 2, 2, 0.5, Math.random() < 3 * dt ? T.ink.phosphorDark : T.ink.screenHot);
    if (Math.sin(t * 2.2) > 0.4) for (const e of [A.eyeL, A.eyeR]) rect(g2, bx + e.x, by + e.y, 0.5, 0.5, T.ink.glint);
  }) };
}

// The cogitator bank's screens, lamps, reels and steam (scene.js drawCogitator) on the plane of its screens' glass.
function cogitator(g, t, cog) {
  const p = placed.find(q => q.name === 'COGITATOR');
  if (!p?.sheet) return;
  const glass = p.v0 + p.sheet.d - 1 - (p.sheet.recess[0]?.depth ?? 1);
  save(g, g2 => { onFace(g2, glass, p.yb, p.z0); g2.translate(H.dx, WALL_DY); }, g2 => S.drawCogitator(g2, t, cog));
}

// The floor line of the brazier a fire point belongs to (its prop's frame bottom).
function brazierFoot(f) {
  let best = null;
  for (const p of placed) if (p.name === 'BRAZIER' && (!best || Math.abs(p.x - f.x) + Math.abs(p.yb - f.y) < Math.abs(best.x - f.x) + Math.abs(best.yb - f.y))) best = p;
  return best ? best.yb : f.y + 8;
}

// Escalation (scene.js stepAlarm: one state for both views): the beacon on the sanctum's back wall turns; the
// servo-skull leaves its perch to hover by the oldest stale petitioner, a red searchlight onto it. Returns its lights.
function alarm(g, all, now) {
  const t = now / 1000, { on, who, BEACON, x, y0, y, hover, lights } = S.stepAlarm(all, now), bob = y - y0;
  save(g, g2 => onFace(g2, 2 * (H.split - WALL) - 1, H.split + 30), g2 => S.drawBeacon(g2, t, on, BEACON));
  if (hover) { // hovering: the searchlight from its eye down onto the petitioner's feet
    const own = SKULL39.skull, c = own ? [SKULL39_AT.centre.x, SKULL39_AT.centre.y] : PROP_AT.SKULL.centre, b = own ? [SKULL39_AT.beam.x, SKULL39_AT.beam.y] : PROP_AT.SKULL.beam;
    const [hx, hy] = pin(x, y0 + FLY_H), bx = hx - c[0] + b[0], by = hy - FLY_H + bob - c[1] + b[1], [fx, fy] = pin(who.x, who.y);
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = hexA(T.ink.searchlight, 0.1 + 0.04 * Math.sin(t * 8));
    g.beginPath(); g.moveTo(bx - 1.5, by); g.lineTo(bx + 1.5, by); g.lineTo(fx + 8, fy + 1); g.lineTo(fx - 8, fy + 1); g.closePath(); g.fill();
    g.restore();
  }
  skullAt(g, x, y0, bob, on ? S.skullRed() : undefined);
  return lights;
}

// ---- hit testing ----------------------------------------------------------------------------------------------------
// The actor under the screen point (px, py) (canvas logical px): its drawn frame's opaque pixels, grown by pad logical
// px, the frontmost (largest y) winning; else the actor whose feet are by the floor point under it (view.js toFloor).
// use(hall) must have run (drawScene39 does); toFloor needs view.js's sceneSize for the hall (app.js scene()).
export function actorAt39(px, py, actors, pad = 1) {
  actors = [...actors]; // app.js passes a one-shot iterator (cast.actors.values()): two passes below
  let best = null;
  const P = Math.round(pad * RES);
  for (const a of actors) {
    if (a.leaving) continue;
    const r = spriteOf(a), [sx, sy] = pin(...feetOf(a, r));
    const c = fl((px - sx - r.dx) * RES), row = fl((py - sy - r.dy) * RES);
    let hit = false;
    for (let j = -P; j <= P && !hit; j++) for (let i = -P; i <= P && !hit; i++) { const ch = r.map[row + j]?.[c + i]; hit = ch !== undefined && ch !== '.'; }
    if (hit && (!best || a.y >= best.y)) best = a;
  }
  if (best) return best;
  // nothing drawn there: the feet nearest the floor point under it, within pad + 2 px (a click on the shadow)
  const [fx, fy] = toFloor(px, py);
  let bd = pad + 2;
  for (const a of actors) { const [ax, ay] = feetOf(a, spriteOf(a)), d = Math.hypot(ax - fx, ay - fy); if (!a.leaving && d <= bd) { best = a; bd = d; } }
  return best;
}
