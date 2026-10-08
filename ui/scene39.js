// The 39° view's dynamic layer: everything drawScene (scene.js) draws each frame in the flat view, drawn over the cached
// 39° hall (isohall.js) by projecting floor positions. Furniture (desks, lecterns, consoles) is built in 3D once per
// theme from its face sheet (faces.js build39) into sprite canvases; actors are their 39° frames (actors.js bodyOf39)
// or, while a theme has no 39° art, today's flat frames standing upright; everything standing is depth sorted by its
// floor footprint (iso.js order). Flat drawing helpers are reused through canvas transforms: what lies on the floor
// (rugs, fallen sheets, shadows) through the floor plane's affine map, what sits on a face (seals, lamps, screens,
// the cogitator's animation) through that face's plane, what stands upright (actors, flames, skulls) translated onto
// its projected foot. Positions stay in the hall's logical px (x, y); world art px: u = 2x, v = 2(y - WALL), z up.
import { P39, IsoBuf, VS39, order } from './iso.js';
import { WALL, WALL_DY } from './layout.js';
import { toFloor } from './view.js';
import { bounds, placeProps, gateOf } from './isohall.js';
import { build39, sheetOf } from './faces.js';
import { MAPS, PROP_AT, ROOM, RES, MAGOS, MAGOS_AT, MAGOS39, MAGOS39_AT, SKULL39, SKULL39_AT, SCRIBE39, SCRIBE39_AT, blit, sprite } from './sprites.js';
import { T, onTheme, hexA } from './theme.js';
import { drawActor, bodyOf, bodyOf39, bobOf, dozing, isStale, isQuestion, BURN_S, PUFF_S, FX_S, PICK_S } from './actors.js';
import { shadowOf, contactShadow, castShadow, casterOf, FLY_H } from './depth.js';
import * as S from './scene.js';

const K = Math.sqrt(2 / 3), fl = Math.floor;
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
const PILE_FADE_MS = 4000;
const lastFill = new Map(); // desk key -> its occupant's last paper fill (scene.js: the empty desk's pile fades)
const rugInk = new Map();
const rugOf = c => rugInk.get(c) ?? rugInk.set(c, [hexA(c, 0.07), hexA(c, 0.3)]).get(c);
const gate = { open: 0, to: 0 };
const skull = { x: null, y: null, last: 0, flying: false };
// Something mid-move (the gate's leaves, the servo-skull's flight): the app keeps its full frame rate (scene.js sceneBusy).
export const busy39 = () => gate.open !== gate.to || skull.flying;

// One frame over the 39° background: layout (app.js glide(): blocks, desks, consoles; hall, level, anchors: the
// background's isohall anchors), actors: Cast.actors, fillOf: context -> paper fill. Returns the frame's lights (flat
// floor coords, as drawScene's: lighting.js projects them).
export function drawScene39(g, layout, actors, fillOf, now) {
  const dt = S.beginFrame(layout, now), t = now / 1000;
  use(layout.hall);
  const all = [...actors.values()], items = [], over = [], floor = [], lights = [];
  const dark = layout.level?.dark ?? 0.18, shade = 0.5 - 0.33 * (dark - 0.18);
  const blockOf = dept => layout.blocks.find(b => b.name === dept);
  floor.push(g2 => { for (const b of layout.blocks) { const [fill, line] = rugOf(b.color); rect(g2, b.x, b.y, b.w, b.h, fill); g2.strokeStyle = line; g2.lineWidth = 1; g2.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1); } });

  const furniture = (kind, at, pile, lit, fill, a, bgShell, block) => {
    const p = placeOf(kind, at), AT = S.KIND[kind].at, front = g2 => onFace(g2, p.v0 + p.k.d - 1, p.yb), slate = g2 => onFace(g2, p.v0 + 4, p.yb);
    // the desk's top: flat rows from 9 px under the frame's top spread back to front over it; a console's pile lies beside it
    const top = kind === 'console' ? onFloor : g2 => plane(g2, [0, p.v0 - 2.6 * (at.y + 9), p.k.top], [2, 0, 0], [0, 2.6, 0]);
    floor.push(g2 => S.paperFloor(g2, pile, kind, fill, at, block, now));
    floor.push(g2 => { const e = shadowOf(MAPS[p.k.name], at.x, at.y); if (e) e.cy -= p.k.d / 4; contactShadow(g2, e, shade); });
    items.push({ foot: p.foot, draw(g2) {
      const k = art(p.k);
      drawBuf(g2, k.buf, lit ? k.lit : k.dim, p.u0, p.v0);
      save(g2, top, g3 => S.paperTop(g3, pile, kind, fill, at));
      if (bgShell) save(g2, front, g3 => S.spinCog(g3, at.x + AT.cog[0], at.y + AT.cog[1], t));
      if (!a) return;
      if (!a.h) save(g2, front, g3 => { const n = (a.seals ?? 0) - (S.stamping(a) ? 1 : 0); for (let i = 0; i < n; i++) S.seal(g3, at.x + AT.seals[i][0], at.y + AT.seals[i][1], 1); });
      if (a.lamp) save(g2, slate, g3 => {
        const [body, shine] = T.ink.lamp[S.lampColor(a.lamp)], x = at.x + AT.lamp[0], y = at.y + AT.lamp[1];
        rect(g3, x - 0.5, y - 0.5, 3.5, 3.5, T.ink.outline); rect(g3, x, y, 2.5, 2.5, body); rect(g3, x + 0.5, y + 0.5, 0.5, 0.5, shine);
        rect(g3, x - 0.5, y + 2.5, 3.5, 0.5, T.ink.brass);
      });
    } });
    if (a) reactions(a, at, AT, front, slate, over, lights, floor, now);
    return p;
  };
  for (const d of layout.desks) {
    const a = actors.get(d.id), pile = d.id ?? d.was ?? d.key, kind = S.kindOf(d);
    const fill = !d.id ? (lastFill.get(d.key) ?? 0) * Math.max(0, 1 - (Date.now() - d.freeSince) / PILE_FADE_MS) : a?.burn ? 0 : fillOf(a?.s.context);
    if (d.id) lastFill.set(d.key, fill);
    const busy = !!a && a.pose === 'desk' && a.s.status === 'busy';
    const p = furniture(kind, d, pile, busy, fill, d.id && a, !!a?.s.background, blockOf(d.dept));
    if (d.id) lights.push(S.deskLight(d, busy));
    if (a?.puff > 0) {
      const k = 1 - a.puff / PUFF_S, [px, py] = S.KIND[kind].at.puff;
      items.push({ foot: { ...p.foot, v0: p.foot.v1, v1: p.foot.v1 + 1 }, draw: g2 => save(g2, g3 => onFace(g3, p.v0 + p.k.d - 1, p.yb), g3 => S.puff(g3, d.x + px, d.y + py, k)) });
      lights.push({ x: d.x + px, y: d.y + py - 1, r: 18 * (1 - k), color: T.light.amber });
    }
  }
  if (lastFill.size > layout.desks.length + 32) for (const k of lastFill.keys()) if (!layout.desks.some(d => d.key === k)) lastFill.delete(k);
  for (const c of layout.consoles) {
    const a = actors.get(c.id), lit = !!a && a.pose === 'console';
    furniture('console', c, c.id, lit, fillOf(a?.h?.context), a, false, blockOf(c.dept));
    lights.push(S.consoleLight(c, lit));
  }

  // actors, their contact and cast shadows
  const known = S.staticLights(H).concat(lights);
  for (const a of all) {
    const r = spriteOf(a), x = Math.round(a.x), y = Math.round(a.y);
    items.push({ foot: actorFoot(a), draw: g2 => drawActor39(g2, a, r, fillOf) });
    const fx0 = x + r.dx, fy0 = y + r.dy, e = shadowOf(r.map, fx0, fy0);
    if (e && r.step > 0) e.rx -= 0.5;
    const c = casterOf(a.x, a.y, known, dark);
    if (c) { const cv = sprite(r.map, r.over); floor.push(g2 => castShadow(g2, cv, { x: fx0, y: fy0, w: cv.width / RES, h: cv.height / RES }, c.from, c.alpha)); }
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
  items.push(gateItem(all, dt), magos(t, dt));

  save(g, onFloor, g2 => floor.forEach(f => f(g2)));
  cogitator(g, t, all.filter(a => a.pose === 'cog').length);
  items.sort((p, q) => order(p.foot, q.foot)).forEach(it => it.draw(g));
  over.forEach(f => f(g));
  for (const a of all) if (a.burn && a.pose === 'burn') { // the brazier's fire over the burner's hem (scene.js)
    const k = 1 - a.burn.left / BURN_S, f = a.burn.fire, heat = k < 0.25 ? k / 0.25 : (1 - k) / 0.75, yb = brazierFoot(f);
    save(g, g2 => upright(g2, f.x, yb, pin(f.x, yb)), g2 => S.flare(g2, f, k, heat, t));
    lights.push({ x: f.x, y: f.y - 2, r: 26 + 44 * heat, color: T.light.burn, flicker: true });
  }
  const sk = PROP_AT.SKULL.centre, sy = Math.round(2 * Math.sin(t * 4)) / 2; // the refectorium's skull (scene.js drawDecorFrame)
  skullAt(g, 244 + H.ox + sk[0], 50 + WALL_DY + sk[1], sy);
  return S.staticLights(H).concat(lights, alarm(g, all, t, dt));
}

// The frame an actor shows (39° art, else the flat frame upright), its top-left relative to its feet.
function spriteOf(a) {
  const b = bodyOf39(a);
  if (b) return b;
  const f = bodyOf(a);
  return { map: f.map, over: f.over, dx: f.x - Math.round(a.x), dy: f.y - Math.round(a.y), step: f.step, flat: true };
}
function drawActor39(g, a, r, fillOf) {
  const x = Math.round(a.x), y = Math.round(a.y);
  g.save();
  upright(g, x, y, pin(x, y));
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
  if (a.lamp) {
    const c = S.lampColor(a.lamp), x = at.x + AT.lamp[0] + 1.25, y = at.y + AT.lamp[1] + 1.25;
    if (c === 'on') lights.push({ x, y, r: 16, color: T.light.lampOn });
    if (c === 'red') lights.push({ x, y, r: 18, color: T.light.lampRed });
    if (c === 'dim') lights.push({ x, y, r: 6, color: T.light.lampDim });
  }
  for (const f of a.fx ?? []) {
    const k = f.t / FX_S[f.kind];
    if (f.kind === 'commit') {
      const [sx, sy] = AT.seals[a.h ? 0 : S.newest(a)], x = at.x + sx, y = at.y + sy;
      over.push(g => save(g, front, g2 => S.stamp(g2, x, y, f.t, a.h)));
      if (f.t > S.STAMP_HIT && f.t < S.STAMP_HIT + 0.6) lights.push({ x: x + 1.5, y: y + 1.5, r: 18 * (1 - (f.t - S.STAMP_HIT) / 0.6), color: T.light.stamp });
    }
    if (f.kind === 'push') {
      const [sx, sy] = AT.seals[a.h ? 0 : f.slot], p = S.courier(f.t, at.x + sx + 1.5, at.y + sy - 6, t);
      over.push(g => skullAt(g, p.x, p.y, 0, undefined, f.t >= PICK_S));
      lights.push({ x: p.x, y: p.y, r: 10, color: T.light.green });
    }
    if (f.kind === 'tool-error') {
      const [sx, sy, sw, sh] = AT.screen, x = at.x + sx, y = at.y + sy;
      over.push(g => save(g, slate, g2 => S.spark(g2, x, y, sw, sh, k, AT.scale, t)));
      lights.push({ x: x + sw / 2, y: y + sh / 2, r: 34 * AT.scale * (1 - k), color: T.light.spark });
    }
    if (f.kind === 'task-done') {
      const x = a.h || a.pose !== 'desk' ? a.x : a.x + 6, y = a.h ? a.y - 17 : a.pose === 'desk' ? a.y - 25 : a.y - 20, fx = Math.round(a.x), fy = Math.round(a.y);
      over.push(g => save(g, g2 => upright(g2, fx, fy, pin(fx, fy)), g2 => S.glint(g2, x, y, k)));
      lights.push({ x, y, r: 16 * Math.sin(Math.PI * k), color: T.light.glint });
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

// The grand gate (isohall gateOf): the void in its opening, the iron leaves sliding apart in front of it while anyone
// is near (scene.js drawGate), clipped to the opening, then its frame (built once per theme) over them.
let gateKit = null;
function gateItem(all, dt) {
  const A = PROP_AT.GATE, GX = H.entry.x - A.entry[0], GY = H.entry.y - A.entry[1], [ow, oh] = A.opening.slice(2), ox = GX + A.opening[0], oy = GY + A.opening[1];
  gate.to = S.near(all, ox, oy, ox + ow, oy + oh) ? 1 : 0;
  gate.open += (gate.to - gate.open) * (1 - 0.82 ** (dt * 30));
  if (Math.abs(gate.to - gate.open) < 0.01) gate.open = gate.to;
  if (gateKit?.key !== key) {
    const G = gateOf(H), sh = G.sheet, buf = bake(box(0, sh.fw, 0, 2 * (H.h - WALL) - G.v0, 0, sh.fh + 4), b => build39(b, sh, 0, 0, 1));
    gateKit = { key, G, buf, cv: paint(buf) };
  }
  const { G } = gateKit, sh = G.sheet, s = half(gate.open * A.slide[0]), yb = GY + sh.fh / RES, vl = G.v0 + G.leaves.v;
  return { foot: { u0: G.u0, u1: G.u0 + sh.fw, v0: G.v0, v1: 2 * (H.h - WALL) }, draw(g) {
    save(g, g2 => onFace(g2, vl, yb), g2 => blit(g2, MAPS.GATE_VOID, ox, oy));
    save(g, g2 => onFace(g2, vl + G.leaves.d - 1, yb), g2 => {
      g2.beginPath(); g2.rect(ox, oy, ow, oh); g2.clip();
      blit(g2, MAPS.GATE_L, GX + A.leafL[0] - s, GY + A.leafL[1]); blit(g2, MAPS.GATE_R, GX + A.leafR[0] + s, GY + A.leafR[1]);
    });
    drawBuf(g, gateKit.buf, gateKit.cv, G.u0, G.v0);
  } };
}

// The Magos on the throne (scene.js drawMagos), its 39° art if the theme has one: the drill arm swings, the chest
// screen scans, the optics pulse. Upright, its bottom centre where the hall's throne seats it.
function magos(t, dt) {
  const own = MAGOS39.body, body = own ?? MAGOS.body, arm = own ? MAGOS39.arm : MAGOS.arm, A = own ? MAGOS39_AT : MAGOS_AT;
  const MX = 264 + H.ox, MY = 120 + H.sd, fw = MAGOS.body[0].length, u = Math.round(2 * MX) + (fw >> 1), v = Math.round(2 * (MY + 24 - WALL)) - 18;
  const bx = MX + (fw - body[0].length) / (2 * RES), by = MY + (MAGOS.body.length - body.length) / RES; // the frame, bottom centre kept
  return { foot: { u0: u - 8, u1: u + 8, v0: v - 4, v1: v + 2 }, draw: g => save(g, g2 => upright(g2, MX + fw / (2 * RES), MY + MAGOS.body.length / RES, cont(u, v, 0).map(half)), g2 => {
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

// Escalation (scene.js drawAlarm): the beacon on the sanctum's back wall turns; the servo-skull leaves its perch to
// hover by the oldest stale petitioner, a red searchlight onto it. Returns its lights.
function alarm(g, all, t, dt) {
  const lights = [], stale = all.filter(a => !a.h && !a.leaving && a.pose === 'queue' && isStale(a.s)).sort((p, q) => p.s.sinceMs - q.s.sinceMs);
  const on = stale.length > 0, BEACON = S.beaconOf(H), PERCH = S.perchOf(H);
  save(g, g2 => onFace(g2, 2 * (H.split - WALL) - 1, H.split + 30), g2 => S.drawBeacon(g2, t, on, BEACON));
  if (on) {
    const sweep = Math.sin(t * 5);
    lights.push({ x: BEACON.x, y: BEACON.y, r: 14, color: T.light.beacon },
      { x: BEACON.x + 20 * sweep, y: BEACON.y + 16, r: 30 + 8 * Math.abs(Math.cos(t * 5)), color: T.light.beaconSweep });
  }
  if (skull.x == null) Object.assign(skull, PERCH);
  const who = stale[0], tgt = on ? { x: who.x + 34, y: who.y - 20 } : PERCH;
  const dx = tgt.x - skull.x, dy = tgt.y - skull.y, d = Math.hypot(dx, dy), step = S.SKULL_SPEED * dt;
  skull.flying = d > step;
  if (d <= step) { skull.x = tgt.x; skull.y = tgt.y; } else { skull.x += (dx / d) * step; skull.y += (dy / d) * step; }
  const bob = Math.round(2 * Math.sin(t * 4)) / 2;
  if (on && d <= step) { // hovering: the searchlight from its eye down onto the petitioner's feet
    const own = SKULL39.skull, c = own ? [SKULL39_AT.centre.x, SKULL39_AT.centre.y] : PROP_AT.SKULL.centre, b = own ? [SKULL39_AT.beam.x, SKULL39_AT.beam.y] : PROP_AT.SKULL.beam;
    const [hx, hy] = pin(skull.x, skull.y + FLY_H), bx = hx - c[0] + b[0], by = hy - FLY_H + bob - c[1] + b[1], [fx, fy] = pin(who.x, who.y);
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = hexA(T.ink.searchlight, 0.1 + 0.04 * Math.sin(t * 8));
    g.beginPath(); g.moveTo(bx - 1.5, by); g.lineTo(bx + 1.5, by); g.lineTo(fx + 8, fy + 1); g.lineTo(fx - 8, fy + 1); g.closePath(); g.fill();
    g.restore();
  }
  skullAt(g, skull.x, skull.y, bob, on ? S.skullRed() : undefined);
  lights.push({ x: skull.x, y: skull.y + bob, r: on ? 14 : 7, color: on ? T.light.skullAlarm : T.light.green });
  return lights;
}

// ---- hit testing ----------------------------------------------------------------------------------------------------
// The actor under the screen point (px, py) (canvas logical px): its drawn frame's opaque pixels, grown by pad logical
// px, the frontmost (largest y) winning; else the actor whose feet are by the floor point under it (view.js toFloor).
// use(hall) must have run (drawScene39 does); toFloor needs view.js's sceneSize for the hall (app.js scene()).
export function actorAt39(px, py, actors, pad = 1) {
  let best = null;
  const P = Math.round(pad * RES);
  for (const a of actors) {
    if (a.leaving) continue;
    const r = spriteOf(a), [sx, sy] = pin(Math.round(a.x), Math.round(a.y));
    const c = fl((px - sx - r.dx) * RES), row = fl((py - sy - r.dy) * RES);
    let hit = false;
    for (let j = -P; j <= P && !hit; j++) for (let i = -P; i <= P && !hit; i++) { const ch = r.map[row + j]?.[c + i]; hit = ch !== undefined && ch !== '.'; }
    if (hit && (!best || a.y >= best.y)) best = a;
  }
  if (best) return best;
  // nothing drawn there: the feet nearest the floor point under it, within pad + 2 px (a click on the shadow)
  const [fx, fy] = toFloor(px, py);
  let bd = pad + 2;
  for (const a of actors) { const d = Math.hypot(a.x - fx, a.y - fy); if (!a.leaving && d <= bd) { best = a; bd = d; } }
  return best;
}
