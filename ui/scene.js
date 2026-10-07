import { blit, MAPS, MAGOS, MAGOS_AT, PROP_AT, RES } from './sprites.js';
import { T, onTheme, themed, hexA } from './theme.js';
import { tile, roomAt } from './room.js';

const I = T.ink; // every colour drawn here, by name (theme.js)
// Anchors of the active theme's art (sprites.js PROP_AT), rebuilt on a theme change: fromArt() at the end.
let DESK_AT, LECTERN_AT, CONSOLE_AT, SK, PAPER;
import { SCENE, hallOf } from './layout.js';
import { drawActor, bodyOf, isStale, BURN_S, PUFF_S, FX_S, PICK_S, LAMP_S } from './actors.js';
import { on, on as depthOn, shadowOf, contactShadow, drawAO, FLY_H } from './depth.js';

const BIN = '0100000101110110011001010010000001001111011011010110111001101001';

// Half-pixel detail: 0.5 logical = 1 art px (the background canvas is drawn at RES). The room's structure is tiles
// (room.js, ui/art/room-*.png); what stays drawn here is weathering and effects, in theme colours.
function rect(g, x, y, w, h, color) { g.fillStyle = color; g.fillRect(x, y, w, h); }
const half = v => Math.round(v * 2) / 2; // snap to the art-pixel grid

// Static props [map, x, y] on the minimum scene, by what they move with as the scene grows (hallOf):
// w the scriptorium's west end, c its centre (gate, cogitator bank: + dx), e its east wall (+ sw - 200),
// *b also its bottom wall (+ h - 226), f the floor between the desks (repeated across and down the hall),
// r the right column (+ ox), s the sanctum by its top wall (+ ox, + sd), sb by its bottom wall (+ ox, + sb).
// None may sit under a queue slot (layout.test.mjs, propsOf).
const PROPS = {
  w: [['SHELF', 6, 19], ['PAPER_STACK', 10, 8], ['PAPER_STACK', 18, 10], ['SCROLL_PILE', 22, 13],
    ['SHELF', 40, 19], ['BOOKS', 44, 11], ['PAPER_STACK', 58, 8], ['LOOSE_A', 66, 15]],
  c: [['BANNER', 98, 10], ['COGITATOR', 116, 2], ['CANDLES', 100, 44], ['CENSER', 94, 7]],
  e: [['CENSER', 196, 60], ['LOOSE_A', 190, 92], ['LOOSE_B', 196, 172]],
  wb: [['CRATE', 12, 190], ['SCROLL_PILE', 30, 188], ['PAPER_STACK', 19, 204], ['BOOKS', 8, 206]],
  cb: [['BRAZIER', 72, 211], ['BRAZIER', 118, 211], ['LOOSE_A', 120, 190], ['SCROLL_PILE', 78, 187]], // the gate's braziers (actors.js braziers)
  eb: [['LOOSE_B', 150, 212], ['LOOSE_A', 186, 186]],
  f: [['SCROLL_PILE', 58, 98], ['PAPER_STACK', 92, 92], ['PAPER_STACK', 99, 95], ['LOOSE_A', 46, 104], ['LOOSE_B', 140, 104],
    ['SCROLL_PILE', 160, 98], ['PAPER_STACK', 54, 132], ['PAPER_STACK', 61, 136], ['BOOKS', 76, 140],
    ['LOOSE_B', 8, 160], ['SCROLL_PILE', 150, 140], ['PAPER_STACK', 176, 128], ['LOOSE_A', 104, 160]],
  r: [['RECAFF', 214, 22], ['SHELF', 236, 19], ['PAPER_STACK', 240, 8], ['BOOKS', 250, 11], ['PAPER_STACK', 260, 9],
    ['BANNER', 274, 10], ['CRATE', 318, 28], ['CRATE', 320, 80], ['PAPER_STACK', 322, 44], ['PAPER_STACK', 329, 48],
    ['SCROLL_PILE', 238, 78], ['LOOSE_B', 236, 64], ['LOOSE_A', 244, 94]],
  s: [['COG_MECH', 267, 110], ['BANNER', 236, 112], ['BANNER', 306, 112], ['THRONE', 268, 124],
    ['CANDLES', 250, 136], ['CANDLES', 292, 136], ['PAPER_STACK', 246, 140], ['PAPER_STACK', 300, 142],
    ['LORD_DESK', 254, 150], ['SEAL', 260, 162], ['SEAL', 286, 162], ['BOOKS', 316, 164], ['PAPER_STACK', 326, 178]],
  sb: [['SCROLL_PILE', 306, 200], ['LOOSE_A', 244, 206], ['LOOSE_B', 300, 214], ['BRAZIER', 224, 196], ['BRAZIER', 320, 196]],
};
// The scriptorium's back wall west and east of its centre group (window, banner, cogitator: 78..198 + dx) gets
// alcoves as the hall widens, 40 px each, windows and shelves by turns, centred in each stretch.
function alcoves(from, to) {
  const n = Math.floor((to - from) / 40), x0 = from + Math.floor((to - from - 40 * n) / 2);
  return Array.from({ length: n }, (_, i) => ({ x: x0 + 40 * i, win: i % 2 === 0 }));
}
// Everything static that depends on the scene's size, once per size: props (placed), windows (x of each 16 px
// window, top at y 10, lighting.js casts their beams), vertical coolant channels.
const furnished = new Map();
export function propsOf(hall) {
  const key = `${hall.w}x${hall.baseH}:${hall.bays}`;
  let F = furnished.get(key);
  if (F) return F;
  if (furnished.size > 8) furnished.clear();
  const { sw, dx, ox, sd, sb, h } = hall, ex = sw - 200, hy = h - SCENE.h;
  const move = (list, mx, my) => list.map(([name, x, y]) => [name, x + mx, y + my]);
  const props = [...move(PROPS.w, 0, 0), ...move(PROPS.c, dx, 0), ...move(PROPS.e, ex, 0),
    ...move(PROPS.wb, 0, hy), ...move(PROPS.cb, dx, hy), ...move(PROPS.eb, ex, hy),
    ...move(PROPS.r, ox, 0), ...move(PROPS.s, ox, sd), ...move(PROPS.sb, ox, sb)];
  // Floor clutter: again every 200 px across (clear of the corridor), its second slot row's again on every further row.
  for (let i = 0; 200 * i < sw - 30; i++) for (let j = 0; j < hall.rows - 1; j++) {
    for (const [name, x, y] of PROPS.f) if ((j === 0 || y >= 120) && (i === 0 || x + 200 * i < sw - 24)) props.push([name, x + 200 * i, y + 64 * j]);
  }
  // Refectory tables, a bench south of each (hallOf().refectory sits on the benches, three a bench).
  for (let k = 0; k < hall.refectory.length / 3; k++) props.push(['TABLE', 262 + ox, 46 + 24 * k], ['BENCH', 262 + ox, 58 + 24 * k]);
  const windows = [78 + dx, 292 + ox];
  for (const a of [...alcoves(76, 76 + dx), ...alcoves(200 + dx, sw - 2)]) {
    if (a.win) { windows.push(a.x + 6); props.push(['BANNER', a.x + 26, 10]); }
    else props.push(['SHELF', a.x + 4, 19], ['PAPER_STACK', a.x + 8, 8], ['BOOKS', a.x + 18, 11], ['PAPER_STACK', a.x + 28, 9]);
  }
  const channels = [];
  for (let x = 98 + dx - 200 * Math.floor((88 + dx) / 200); x < sw - 20; x += 200) channels.push(x);
  F = { props, windows, channels };
  furnished.set(key, F);
  return F;
}

// Props that stand on the floor and get a contact shadow (depth.js); the rest hangs on a wall or lies flat.
const STANDING = new Set(['SHELF', 'CRATE', 'BRAZIER', 'THRONE', 'COGITATOR', 'RECAFF', 'TABLE', 'BENCH', 'LORD_DESK', 'PAPER_STACK', 'BOOKS', 'COG_MECH']);
// The scriptorium is 0..sw, its east wall sw..rx, the right column rx..w (refectorium 0..split - 10, a wall, the
// sanctum split..baseH); bays (dy) extend the scriptorium below baseH, the right column then gets a plain wall.
export function drawStatic(g, daylight, hall = hallOf(0)) {
  const { w, h, sw, rx, ox, dx, sd, sb, split, baseH } = hall, hy = h - SCENE.h, ex = sw - 200;
  const { props, windows, channels } = propsOf(hall);
  const d0 = 150 + sd, d1 = 186 + sd; // the sanctum's door in the east wall
  tile(g, 'wall', 0, 0, sw, 40); tile(g, 'wall foot', 0, 36, sw, 4);
  tile(g, 'floor', 0, 40, sw, h - 40);
  tile(g, 'wall east', rx, 0, 138, 40); tile(g, 'wall foot', rx, 36, 138, 4);
  tile(g, 'floor', rx, 40, 138, split - 50);
  tile(g, 'wall dark', rx, split - 10, 138, 10);
  tile(g, 'wall sanctum', rx, split, 138, 30); tile(g, 'wall dark', rx, split + 26, 138, 4);
  tile(g, 'sanctum floor', rx, split + 30, 138, baseH - split - 30);
  tile(g, 'wall dark', sw, 0, 8, d0); tile(g, 'wall dark', sw, d1, 8, h - d1); tile(g, 'sanctum passage', sw, d0, 8, 36);
  if (hall.dy) bayWall(g, hall);

  for (let j = 0; j < hall.rows; j++) tile(g, 'channel h', 0, j ? 118 + 64 * j : 116, sw, 2); // under each slot row
  for (const x of channels) tile(g, 'channel v', x, 40, 2, h - 40);
  for (let k = 1; k <= hall.bays; k++) bayArch(g, 56 + 64 * (hall.rows - hall.bays + k - 1), sw);

  tile(g, 'pipe h', 0, 4, sw); tile(g, 'pipe h', rx, 4, 138);
  [20, 64, 110, 150, 190].forEach(x => tile(g, 'fitting h', x, 3));
  for (let x = 230; x < sw - 6; x += 40) tile(g, 'fitting h', x, 3);
  [230, 280, 330].forEach(x => tile(g, 'fitting h', x + ox, 3));
  tile(g, 'pipe v', sw + 3, 0, 3, d0); tile(g, 'pipe v', sw + 3, d1, 3, h - d1);
  [36, 74, 112].forEach(y => tile(g, 'fitting v', sw + 2, y));
  for (let y = 150; y < d0 - 4; y += 38) tile(g, 'fitting v', sw + 2, y);
  tile(g, 'pipe v', 144 + dx, 7, 3, 29); tile(g, 'pipe v', 194 + dx, 7, 3, 29);
  const scratch = (x, i) => {
    const sh = 10 + (i * 7) % 18;
    rect(g, x, 7, 0.5, sh, I.scratch); rect(g, x + 0.5, 7, 0.5, sh, I.scratchSheen); rect(g, x, 7 + sh - 1, 2, 1, I.scratch);
  };
  [8, 26, 50, 74, 96, 128, 150, 172, 196].forEach((x, i) => { for (let k = 0; x + 200 * k < sw - 2; k++) scratch(x + 200 * k, i + k); });
  scratch(220 + ox, 9);
  // Binary cant: 1-art-px glyphs (ones tall, zeros a dot), one per logical px.
  g.fillStyle = I.cant;
  [[2, 32, sw - 2], [74, 38, sw - 2], [rx + 2, 32, w - 2], [rx + 2, split - 5, w - 2]].forEach(([x, y, end]) => {
    for (let i = 0; x + i < end; i++) g.fillRect(x + i, y, 0.5, BIN[(i + x) % BIN.length] === '1' ? 1 : 0.5);
  });
  [[60, 104, 14, 1], [73, 104, 1, 6], [120 + dx, 204 + hy, 1, 12]].forEach(([x, y, cw, ch]) => rect(g, x, y, cw, ch, I.scratch)); // cracks
  [[30, 120, 18, 8], [146 + ex, 186 + hy, 8, 6], [270 + ox, 196 + sb, 14, 6]].forEach(([x, y, cw, ch]) => rect(g, x, y, cw, ch, I.grime));

  const win = daylight ? I.windowDay : I.windowNight;
  windows.forEach(x => blit(g, MAPS.WINDOW, x, 10, win));
  [210 + ox, 334 + ox].forEach(x => { // the sanctum's pillars
    tile(g, 'pillar', x, split - 2, 10, baseH - split + 2);
    tile(g, 'pipe v', x + 3, split - 2, 3, baseH - split + 2);
    for (let y = split + 14; y < baseH - 24; y += 36) blit(g, MAPS.GAUGE, x + 2, y);
  });
  tile(g, 'sanctum passage', 210 + ox, d0, 10, 36); tile(g, 'fitting wide', 210 + ox, d0 - 2); tile(g, 'fitting wide', 210 + ox, d1); // pillar opens onto the passage door
  rect(g, 254 + ox, 163 + sd, 44, 3, I.shadowDeep);
  if (on('ao')) drawAO(g, hall);
  if (on('contact')) for (const [name, x, y] of props) if (STANDING.has(name)) contactShadow(g, shadowOf(MAPS[name], x, y), daylight ? 0.5 : 0.3);
  for (const [name, x, y] of props) blit(g, MAPS[name], x, y);
  tile(g, 'wall base', 0, h - 3, sw, 3); // scriptorium's bottom wall, the gate sits in it
}

// A bay's seam (y: its first slot row's top, minus 2): a brass-edged iron sill across the floor between two
// pilasters standing out of the side walls, the arch the new floor opens behind.
function bayArch(g, y, sw) {
  tile(g, 'sill', 0, y, sw, 2);
  const [, top] = roomAt('pilaster').sill;
  for (const x of [0, sw - 4]) tile(g, 'pilaster', x, y - top); // capital and base on a pillar out of the side walls
}
// East of the scriptorium, below the sanctum: plated wall the length of the bays, a pipe run, cant and banners per bay.
function bayWall(g, { rx, ox, baseH, dy }) {
  const x = v => v + ox;
  tile(g, 'wall', rx, baseH, 138, dy);
  tile(g, 'sanctum base', rx, baseH, 138, 3); // the sanctum's bottom wall
  for (let y = baseH; y < baseH + dy; y += 64) {
    tile(g, 'pipe h', x(220), y + 10, 114);
    [232, 272, 312].forEach(fx => tile(g, 'fitting h', x(fx), y + 9));
    g.fillStyle = I.cant;
    for (let i = 0; 222 + i < 332; i++) g.fillRect(x(222) + i, y + 20, 0.5, BIN[(i + y) % BIN.length] === '1' ? 1 : 0.5);
    blit(g, MAPS.BANNER, x(240), y + 30); blit(g, MAPS.BANNER, x(294), y + 30); blit(g, MAPS.WINDOW, x(263), y + 28, I.windowNight);
  }
  for (const px of [x(210), x(334)]) { // the sanctum's pillars carry on down
    tile(g, 'pillar', px, baseH + 3, 10, dy - 3);
    tile(g, 'pipe v', px + 3, baseH + 3, 3, dy - 3);
    for (let y = baseH + 40; y < baseH + dy; y += 64) blit(g, MAPS.GAUGE, px + 2, y);
  }
}

let H = hallOf(0); // the hall drawn this frame
let lastNow = 0, frameDt = 0; // s since the previous drawScene: frame-rate independent easing and random flicker
const perFrame = p => Math.min(1, p * frameDt * 30); // a per-frame chance tuned at 30 fps, at any frame rate
const rugInk = new Map(); // block colour -> [fill, outline]
const rugOf = c => rugInk.get(c) ?? rugInk.set(c, [hexA(c, 0.07), hexA(c, 0.3)]).get(c);

const PILE_FADE_MS = 4000;
const lastFill = new Map(); // desk key -> its occupant's last paper fill, for the fade once it leaves

// One frame of everything that moves or depends on the roster, over the static background.
// actors: Cast.actors; fillOf: context -> paper fill. Returns every light of the frame for drawLighting.
// layout.hall: hallOf() of the current bays; layout.level: lightLevel() (shadows soften at night).
export function drawScene(g, layout, actors, fillOf, now) {
  H = layout.hall ?? hallOf(0);
  frameDt = lastNow ? Math.min(0.25, (now - lastNow) / 1000) : 0; // 0.25: above a 6 fps idle frame
  lastNow = now;
  prunePiles(now, layout);
  const all = [...actors.values()];
  drawRugs(g, layout.blocks);
  drawDoors(g, all);
  const items = [drawGate(g, all)], lights = [], over = [], floor = []; // floor: shadows, under everything standing
  const dark = layout.level?.dark ?? 0.18, shade = 0.5 - 0.33 * (dark - 0.18); // contact shadow alpha: 0.5 by day, 0.3 at night
  const blockOf = dept => layout.blocks.find(b => b.name === dept);
  for (const d of layout.desks) {
    const a = actors.get(d.id), pile = d.id ?? d.was ?? d.key;
    // An empty desk (its scribe gone, see planLayout) is unlit and its pile fades away over PILE_FADE_MS.
    const fill = !d.id ? (lastFill.get(d.key) ?? 0) * Math.max(0, 1 - (Date.now() - d.freeSince) / PILE_FADE_MS)
      : a?.burn ? 0 : fillOf(a?.s.context); // a burner carries its pile away
    if (d.id) lastFill.set(d.key, fill);
    const busy = !!a && a.pose === 'desk' && a.s.status === 'busy';
    paperFloor(g, pile, kindOf(d), fill, d, blockOf(d.dept), now);
    items.push(furniture(kindOf(d), d, pile, busy, fill, d.id && a, !!a?.s.background, now));
    floor.push(() => contactShadow(g, shadowOf(MAPS[KIND[kindOf(d)].map], d.x, d.y), shade));
    if (d.id) lights.push(deskLight(d, busy));
    if (d.id && a) reactions(a, d, KIND[kindOf(d)].at, over, lights, now, floor);
    if (a?.puff > 0) {
      const k = 1 - a.puff / PUFF_S, [px, py] = KIND[kindOf(d)].at.puff;
      items.push({ y: d.y + 22, draw: g2 => puff(g2, d.x + px, d.y + py, k) });
      lights.push({ x: d.x + px, y: d.y + py - 1, r: 18 * (1 - k), color: T.light.amber });
    }
  }
  for (const c of layout.consoles) {
    const a = actors.get(c.id), fill = fillOf(a?.h?.context);
    const lit = !!a && a.pose === 'console';
    paperFloor(g, c.id, 'console', fill, c, blockOf(c.dept), now);
    items.push(furniture('console', c, c.id, lit, fill, a, false, now));
    floor.push(() => contactShadow(g, shadowOf(MAPS.CONSOLE, c.x, c.y), shade));
    lights.push(consoleLight(c, lit));
    if (a) reactions(a, c, CONSOLE_AT, over, lights, now, floor);
  }
  for (const a of all) items.push({ y: a.y, draw: g2 => { drawActor(g2, a); if (a.burn) bundle(g2, a, fillOf(a.burn.old)); } });
  if (on('contact')) {
    for (const a of all) {
      const b = bodyOf(a), e = shadowOf(b.map, b.x, b.y);
      if (e && b.step > 0 && on('motion')) e.rx -= 0.5; // a stride: the feet apart, the body low, the shadow tighter
      floor.push(() => contactShadow(g, e, shade));
    }
    floor.forEach(f => f(g));
  }
  items.sort((p, q) => p.y - q.y).forEach(it => it.draw(g));
  over.forEach(f => f(g));
  for (const a of all) if (a.burn && a.pose === 'burn') { // the brazier sits south of the burner: its fire draws over the robe hem
    const k = 1 - a.burn.left / BURN_S, f = a.burn.fire, heat = k < 0.25 ? k / 0.25 : (1 - k) / 0.75;
    flare(g, f, k, heat, now / 1000);
    lights.push({ x: f.x, y: f.y - 2, r: 26 + 44 * heat, color: T.light.burn, flicker: true });
  }
  drawDecorFrame(g, now / 1000, all.filter(a => a.pose === 'cog').length);
  return staticLights(H).concat(lights, drawAlarm(g, all, now));
}

function drawRugs(g, blocks) {
  for (const b of blocks) {
    const [fill, line] = rugOf(b.color);
    g.fillStyle = fill; g.fillRect(b.x, b.y, b.w, b.h);
    g.strokeStyle = line; g.lineWidth = 1; g.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  }
}

// A full desk or, in a crowded hall, a compact lectern (layout.js GRID.compact): sprite, width, and where its
// centre, slate and candle are, from its top-left.
// Desks, lecterns and the adepts' consoles. lit: candle/screen on (else the dimmed palette); pile: its paper's id.
const kindOf = d => (d.compact ? 'lectern' : 'desk');
function furniture(kind, at, pile, lit, fill, a, bgShell, now) {
  const K = KIND[kind], [sx, sy, sw, sh] = K.at.shadow;
  return {
    y: at.y + sy,
    draw(g) {
      rect(g, at.x + sx, at.y + sy, sw, sh, I.shadow);
      blit(g, MAPS[K.map], at.x, at.y, lit ? undefined : K.dim());
      paperTop(g, pile, kind, fill, at);
      if (bgShell) spinCog(g, at.x + K.at.cog[0], at.y + K.at.cog[1], now / 1000);
      if (a) furnitureFx(g, a, at, K.at);
    },
  };
}

// A background shell still runs after the turn: a tiny brass cog turning on the desk corner (art px = 0.5).
function spinCog(g, cx, cy, t) {
  rect(g, cx - 2, cy - 1, 4, 3, I.outline); rect(g, cx - 1.5, cy - 1.5, 3, 4, I.outline); // outline
  for (let i = 0; i < 8; i++) { // 8 teeth, turning ~1 rev / 3 s
    const ang = t * 2 + i * Math.PI / 4;
    rect(g, half(cx - 0.25 + Math.cos(ang) * 2.25), half(cy - 0.25 + Math.sin(ang) * 2.25), 1, 1, i ? I.copperShade : I.brassLit);
  }
  rect(g, cx - 1.5, cy - 1, 3, 2, I.brass); rect(g, cx - 1, cy - 1.5, 2, 3, I.brass);
  rect(g, cx - 1.5, cy - 1, 0.5, 1, I.brassLit); rect(g, cx - 1, cy - 1.5, 1, 0.5, I.brassLit); // lit upper-left
  rect(g, cx - 0.5, cy - 0.5, 1, 1, I.ironDark); // axle
}


// Context paper. fill = context tokens / model window: 0..0.5 covers the desk (or a small pile beside a
// console), above 0.5 sheets fall and spread over the department floor, dense at 1. Red sheets from 0.9.
// Every desk/console has one deterministic sheet list (seeded by its id); fill only picks how many show.
// x0, y0: the pile's origin on the surface; cx, cy: where fallen sheets spread from (the sprite's paper / pile anchors).
const paperAt = (name, k) => ({ ...k, x0: PROP_AT[name].paper[0], y0: PROP_AT[name].paper[1], cx: PROP_AT[name].pile[0], cy: PROP_AT[name].pile[1] });
const papers = () => ({
  desk: paperAt('DESK', { cols: 6, rows: 3, dx: 4.8, dy: 2.6, layers: 4, floor: 56, r0: 14, reach: 30 }),
  lectern: paperAt('LECTERN', { cols: 4, rows: 3, dx: 4.4, dy: 2.6, layers: 4, floor: 40, r0: 11, reach: 22 }),
  console: paperAt('CONSOLE', { cols: 1, rows: 3, dx: 0, dy: 0.5, layers: 2, floor: 5, r0: 9, reach: 6 }),
});
// Paper is cached: each pile's desk-top sheets, and its settled floor sheets, are rasterised once into a small canvas
// (redrawn only when the sheet count, the red warning or the place changes) and blitted; fluttering sheets draw live.
const piles = new Map(); // `${kind}:${id}` -> sheet lists and caches; dropped a minute after the pile was last drawn
let pruned = 0;
function prunePiles(now, layout) {
  if (Math.abs(now - pruned) < 5000) return;
  pruned = now;
  for (const [k, p] of piles) if (now - p.seen > 60_000) piles.delete(k);
  const keys = new Set(layout.desks.map(d => d.key));
  for (const k of lastFill.keys()) if (!keys.has(k)) lastFill.delete(k);
}
function pileOf(id, kind, now) {
  let p = piles.get(`${kind}:${id}`);
  if (p) { if (now) p.seen = now; return p; }
  let seed = [...id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);
  const rnd = () => { // mulberry32
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const k = PAPER[kind];
  const top = [];
  for (let r = 0; r < k.rows; r++) for (let c = 0; c < k.cols; c++) {
    top.push({ x: half(k.x0 + c * k.dx + rnd() * 1.5), y: half(k.y0 + r * k.dy + rnd()), w: rnd() < 0.5 ? 4 : 5 });
  }
  for (let i = top.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [top[i], top[j]] = [top[j], top[i]]; }
  top.forEach((t, i) => { t.layers = 1 + Math.floor(rnd() * (1 + k.layers * i / top.length)); t.red = i % 6 === 5; });
  const floor = Array.from({ length: k.floor }, (_, i) => {
    const a = rnd() * Math.PI * 2, r = k.r0 + k.reach * ((i + 1) / k.floor) ** 0.8 * (0.5 + 0.5 * rnd());
    const flat = rnd() < 0.6;
    return { x: half(k.cx + Math.cos(a) * r * 1.2), y: half(k.cy + Math.sin(a) * r * 0.8), w: flat ? 4 : 3, h: flat ? 3 : 4, red: i % 5 === 2 };
  });
  // the top pile's bounds (sheet outlines included), pile-local: every sheet edge sits on the art-px grid
  const tb = { x0: Math.min(...top.map(t => t.x)) - 0.5, y0: Math.min(...top.map(t => t.y - t.layers + 1)) - 0.5 };
  tb.w = Math.max(...top.map(t => t.x + t.w)) + 0.5 - tb.x0; tb.h = Math.max(...top.map(t => t.y)) + 3 - tb.y0;
  p = { top, floor, tb, shown: -1, born: [], seen: now ?? 0, topKey: -1, topCv: null, fKey: [], fCv: null, fAt: null,
    fx: new Float64Array(floor.length), fy: new Float64Array(floor.length) };
  piles.set(`${kind}:${id}`, p);
  return p;
}
const topCount = (p, fill) => Math.round(Math.min(Math.max(0, fill), 0.5) / 0.5 * p.top.length);
const floorCount = (p, fill) => Math.round(Math.min(1, Math.max(0, fill - 0.5) / 0.5) * p.floor.length);
// (Re)sizes a canvas at RES over the logical rect (x0, y0, w, h) and maps its context so logical coords draw in place.
function rasterIn(cv, x0, y0, w, h) {
  cv ??= document.createElement('canvas');
  cv.width = Math.ceil(w * RES); cv.height = Math.ceil(h * RES); // also clears it
  cv.getContext('2d').setTransform(RES, 0, 0, RES, -x0 * RES, -y0 * RES);
  return cv;
}
function sheet(g, x, y, w, h, red) {
  rect(g, x - 0.5, y - 0.5, w + 1, h + 1, I.outline);
  rect(g, x, y, w, h, red ? I.parchmentWarn : I.parchment);
  g.fillStyle = red ? I.crimson : I.parchmentShade; g.fillRect(x + 0.5, y + 1, w - 1.5, 0.5);
  if (h > 3) g.fillRect(x + 0.5, y + 2.5, w - 2, 0.5);
}
// On the desk surface (or beside the console), drawn with the furniture.
function paperTop(g, id, kind, fill, at) {
  const p = pileOf(id, kind), n = topCount(p, fill), key = 2 * n + (fill >= 0.9 ? 1 : 0), { tb } = p;
  if (!n) return;
  if (p.topKey !== key) { // the count or the warning changed: redraw the pile (back to front) into its canvas
    p.topKey = key;
    p.topCv = rasterIn(p.topCv, tb.x0, tb.y0, tb.w, tb.h);
    const c = p.topCv.getContext('2d');
    for (const t of p.top.slice(0, n).sort((a, b) => a.y - b.y)) {
      for (let l = 0; l < t.layers; l++) sheet(c, t.x, t.y - l, t.w, 2.5, key % 2 && t.red && l === t.layers - 1);
    }
  }
  g.drawImage(p.topCv, at.x + tb.x0, at.y + tb.y0, p.topCv.width / RES, p.topCv.height / RES);
}
// Fallen sheets on the floor around it, kept inside the department block; new ones flutter down from the desk.
const fit = (v, lo, hi) => Math.min(hi, Math.max(lo, v < lo ? 2 * lo - v : v > hi ? 2 * hi - v : v));
const fKeySame = (key, settled, warn, at, b) => key[0] === settled && key[1] === warn && key[2] === at.x && key[3] === at.y
  && key[4] === b.x && key[5] === b.y && key[6] === b.w && key[7] === b.h;
function paperFloor(g, id, kind, fill, at, block, now) {
  const p = pileOf(id, kind, now), m = floorCount(p, fill), k = PAPER[kind];
  if (m > p.shown) for (let i = Math.max(0, p.shown); i < m; i++) p.born[i] = p.shown < 0 ? -1e9 : now;
  p.shown = m;
  if (!m) return;
  const warn = fill >= 0.9;
  let settled = 0; // born[] never decreases along the list, so the settled sheets are a prefix
  while (settled < m && now - p.born[settled] >= 700) settled++;
  for (let i = 0; i < m; i++) { // resting place, kept inside the department block
    const s = p.floor[i];
    p.fx[i] = fit(at.x + s.x, block.x + 1, block.x + block.w - s.w - 1);
    p.fy[i] = fit(at.y + s.y, block.y + 1, block.y + block.h - s.h - 1);
  }
  // The settled prefix is cached once its key holds two frames running (a gliding desk or block draws live).
  let from = 0;
  if (!fKeySame(p.fKey, settled, warn, at, block)) { p.fKey = [settled, warn, at.x, at.y, block.x, block.y, block.w, block.h]; p.fAt = null; }
  else if (settled) {
    if (!p.fAt) { // rasterise sheets 0..settled-1 into a canvas over their bounds
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < settled; i++) {
        x0 = Math.min(x0, p.fx[i] - 0.5); y0 = Math.min(y0, p.fy[i] - 0.5);
        x1 = Math.max(x1, p.fx[i] + p.floor[i].w + 0.5); y1 = Math.max(y1, p.fy[i] + p.floor[i].h + 0.5);
      }
      p.fCv = rasterIn(p.fCv, x0, y0, x1 - x0, y1 - y0);
      const c = p.fCv.getContext('2d');
      for (let i = 0; i < settled; i++) sheet(c, p.fx[i], p.fy[i], p.floor[i].w, p.floor[i].h, warn && p.floor[i].red);
      p.fAt = { x: x0, y: y0 };
    }
    g.drawImage(p.fCv, p.fAt.x, p.fAt.y, p.fCv.width / RES, p.fCv.height / RES);
    from = settled;
  }
  for (let i = from; i < m; i++) {
    const s = p.floor[i];
    let x = p.fx[i], y = p.fy[i];
    const t = (now - p.born[i]) / 700;
    if (t < 1) { // flutter down from the desk edge
      const sx = at.x + k.cx, sy = at.y + k.cy - 6;
      x = half(sx + (x - sx) * t + Math.sin(t * 9) * 2 * (1 - t));
      y = half(sy + (y - sy) * t * t);
    }
    sheet(g, x, y, s.w, s.h, warn && s.red);
  }
}

// Compaction ritual (actors.js Cast.compacted). The carried pile: old context sheets tied with a red cord, held at
// the waist; at the brazier it drops into the fire over the first 0.35 s.
function bundle(g, a, fill) {
  const n = 2 + Math.round(6 * Math.min(1, fill)); // sheet layers, 0.5 each
  let x = a.x - 3.5, y = a.y - 6, w = 7;
  if (a.pose === 'burn') {
    const k = (BURN_S - a.burn.left) / 0.35;
    if (k >= 1) return;
    y += (a.burn.fire.y - y) * k * k; w *= 1 - 0.5 * k; x = a.x - w / 2;
  }
  x = half(x); y = half(y); w = half(w);
  const top = y - n * 0.5;
  rect(g, x - 0.5, top - 0.5, w + 1, n * 0.5 + 1.5, I.outline);
  for (let i = 0; i < n; i++) rect(g, x + (i % 3 === 1 ? 0.5 : 0), top + i * 0.5, w - 0.5, 0.5, i % 2 ? I.parchmentShade : I.parchment);
  rect(g, x, y, w, 0.5, I.parchment); // the bottom sheet's lit edge
  rect(g, half(x + w / 2 - 0.5), top - 0.5, 1, n * 0.5 + 1.5, I.crimson); // cord
}
// The pile burning in the brazier: tall flame tongues, rising sparks and charred flakes. k: 0..1 of the burn, heat: 0..1..0.
function flare(g, f, k, heat, t) {
  for (let dx = -3; dx <= 3; dx += 0.5) {
    const h = heat * Math.max(0, 9 - Math.abs(dx) * 2.2) * (0.7 + 0.3 * Math.sin(t * 23 + dx * 3.1));
    if (h < 0.5) continue;
    rect(g, f.x + dx - 0.25, half(f.y - h), 0.5, half(h), I.flame);
    if (Math.abs(dx) < 2) rect(g, f.x + dx - 0.25, half(f.y - h * 0.6), 0.5, half(h * 0.6), I.flameCore);
  }
  for (let i = 0; i < 18; i++) {
    const p = (k * 1.8 + hash(i * 7919)) % 1, life = 1 - p;
    if (k > 0.85 && p > 0.5) continue; // the last sparks die out
    const x = f.x + (hash(i * 131) - 0.5) * 10 * p + Math.sin(t * 6 + i) * p, y = f.y - 3 - p * (14 + 10 * hash(i * 37));
    rect(g, half(x), half(y), 0.5, 0.5, i % 5 === 0 ? I.ash : life > 0.6 ? I.flameCore : life > 0.3 ? I.flame : I.alarm);
  }
}
// Papers vanishing off an unattended desk: a grey puff spreading and fading, a few embers at first. k: 0..1.
function puff(g, x, y, k) {
  for (let i = 0; i < 8; i++) {
    const ang = i * 0.785 + hash(i * 53) * 0.6, d = 2 + 9 * k * (0.6 + 0.4 * hash(i * 17)), r = (1 + 2.5 * k) * (on('motion') ? 1 + 0.3 * k : 1); // rising: closer to the eye
    g.fillStyle = hexA(I.smoke, 0.75 * (1 - k));
    g.fillRect(half(x + Math.cos(ang) * d - r), half(y + Math.sin(ang) * d * 0.6 - r - 4 * k), 2 * r, 2 * r);
    if (k < 0.4) rect(g, half(x + Math.cos(ang) * d * 1.3), half(y + Math.sin(ang) * d - 2 * k), 0.5, 0.5, i % 2 ? I.flameCore : I.flame);
  }
}

// Chronicle reactions (actors.js Cast.chronicle). Offsets from the desk/console's top-left: the screen that sparks, the
// test lamp on its frame, where the commit's purity seal goes (on a desk they stay: a.seals, max 3, hung on the front edge
// clear of the seated scribe).
const STAMP_HIT = 0.9; // s into a commit: the stamp comes down and the seal is set
const newest = a => Math.max(0, (a.seals ?? 1) - 1);
const stamping = a => a.fx?.some(f => f.kind === 'commit' && f.t < STAMP_HIT);
// The test lamp: green for LAMP_S after a pass, then dark; red blinking for LAMP_S after a fail, then dim red.
function lampColor(l) {
  if (l.ok) return l.t < LAMP_S ? 'on' : 'off';
  return l.t >= LAMP_S ? 'dim' : Math.floor(l.t * 3) % 3 ? 'red' : 'dark';
}
// Drawn with the furniture (under the scribe): sealed sheets and the lamp.
function furnitureFx(g, a, at, AT) {
  if (!a.h) {
    const n = (a.seals ?? 0) - (stamping(a) ? 1 : 0);
    for (let i = 0; i < n; i++) seal(g, at.x + AT.seals[i][0], at.y + AT.seals[i][1], 1);
  }
  if (a.lamp) {
    const [body, shine] = I.lamp[lampColor(a.lamp)], x = at.x + AT.lamp[0], y = at.y + AT.lamp[1];
    rect(g, x - 0.5, y - 0.5, 3.5, 3.5, I.outline); // cage outline, bulb, shine, brass collar onto the frame
    rect(g, x, y, 2.5, 2.5, body); rect(g, x + 0.5, y + 0.5, 0.5, 0.5, shine);
    rect(g, x - 0.5, y + 2.5, 3.5, 0.5, I.brass);
  }
}
// Everything else plays over the scene; lights join the frame's.
function reactions(a, at, AT, over, lights, now, floor) {
  const t = now / 1000;
  if (a.lamp) {
    const c = lampColor(a.lamp), x = at.x + AT.lamp[0] + 1.25, y = at.y + AT.lamp[1] + 1.25;
    if (c === 'on') lights.push({ x, y, r: 16, color: T.light.lampOn });
    if (c === 'red') lights.push({ x, y, r: 18, color: T.light.lampRed });
    if (c === 'dim') lights.push({ x, y, r: 6, color: T.light.lampDim });
  }
  for (const f of a.fx ?? []) {
    const k = f.t / FX_S[f.kind];
    if (f.kind === 'commit') {
      const [sx, sy] = AT.seals[a.h ? 0 : newest(a)], x = at.x + sx, y = at.y + sy;
      over.push(g => stamp(g, x, y, f.t, a.h));
      if (f.t > STAMP_HIT && f.t < STAMP_HIT + 0.6) lights.push({ x: x + 1.5, y: y + 1.5, r: 18 * (1 - (f.t - STAMP_HIT) / 0.6), color: T.light.stamp });
    }
    if (f.kind === 'push') {
      const [sx, sy] = AT.seals[a.h ? 0 : f.slot], p = courier(f.t, at.x + sx + 1.5, at.y + sy - 6, t);
      if (on('motion')) floor.push(g => flyShadow(g, p.x, p.y));
      over.push(g => { const [cx, cy] = SK.centre, [kx, ky] = SK.carry; blit(g, MAPS.SKULL, half(p.x) - cx, half(p.y) - cy); if (f.t >= PICK_S) seal(g, half(p.x) - cx + kx, half(p.y) - cy + ky, 1); });
      lights.push({ x: p.x, y: p.y, r: 10, color: T.light.green });
    }
    if (f.kind === 'tool-error') {
      const [sx, sy, sw, sh] = AT.screen, x = at.x + sx, y = at.y + sy;
      over.push(g => spark(g, x, y, sw, sh, k, AT.scale, t));
      lights.push({ x: x + sw / 2, y: y + sh / 2, r: 34 * AT.scale * (1 - k), color: T.light.spark });
    }
    if (f.kind === 'task-done') {
      const x = a.h || a.pose !== 'desk' ? a.x : a.x + 6, y = a.h ? a.y - 17 : a.pose === 'desk' ? a.y - 25 : a.y - 20;
      over.push(g => glint(g, x, y, k));
      lights.push({ x, y, r: 16 * Math.sin(Math.PI * k), color: T.light.glint });
    }
  }
}
// A purity seal (art px = 0.5): two parchment strips hanging below a red wax disc, (x, y) its top-left; wax 0 = strips only.
function seal(g, x, y, wax) {
  blit(g, wax ? MAPS.COMMIT_SEAL : MAPS.COMMIT_TAG, x - 0.5, y - 0.5); // the frames start half a px up-left of (x, y)
}
// The commit: a wax drop falls on a fresh sheet, the stamp comes down (STAMP_HIT), lifts away, the seal glints.
function stamp(g, x, y, t, small) {
  if (t < STAMP_HIT) {
    seal(g, x, y, 0);
    const d = Math.min(1, t / 0.4); // the wax drop, a blob once it lands
    if (d < 1) rect(g, x + 1, half(y + 1 - 8 * (1 - d) ** 2), 1, 1.5, I.wax);
    else { rect(g, x, y + 0.5, 3, 2, I.outline); rect(g, x + 0.5, y + 1, 2, 1, I.wax); }
  }
  const down = t < STAMP_HIT ? Math.max(0, (t - 0.35) / (STAMP_HIT - 0.35)) : t < 1.2 ? 1 : Math.max(0, 1 - (t - 1.2) / 0.5);
  if (down > 0) {
    const sy = half(y - 12 + 8.5 * down * down) + (t >= STAMP_HIT && t < 1.05 ? 0.5 : 0), sx = x;
    blit(g, MAPS.COMMIT_STAMP, sx - 0.5, sy - 0.5); // knob, brass stem, iron foot
  }
  if (!small && t > 1.5) glint(g, x + 1.5, y + 1.5, (t - 1.5) / 1.5);
}
// A servo-skull's shadow on the floor FLY_H below it (depth: motion cues), so it reads as flying, not sliding.
function flyShadow(g, x, y) {
  contactShadow(g, { cx: x, cy: y + FLY_H, rx: 3.5, ry: 1.25 }, 0.5);
}
// Servo-skull courier: in from beyond the grand gate, a dip at the desk to take the sheet (PICK_S), out by the gate.
function courier(t, x, y, now) {
  const G = { x: H.entry.x, y: H.entry.y + 16 }, out = PICK_S + 0.6, e = k => k * k * (3 - 2 * k);
  let p;
  if (t < PICK_S) { const k = e(t / PICK_S); p = { x: G.x + (x - G.x) * k, y: G.y + (y - G.y) * k }; }
  else if (t < out) p = { x, y: y + 2 * Math.sin(Math.PI * (t - PICK_S) / 0.6) };
  else { const k = e(Math.min(1, (t - out) / (FX_S.push - out))); p = { x: x + (G.x - x) * k, y: y + (G.y - y) * k }; }
  p.y += Math.round(2 * Math.sin(now * 6)) / 2;
  return p;
}
// Tool error: the screen (x, y, w, h) shorts in white flashes, sparks spray up and fall, then pale smoke rises. k: 0..1.
function spark(g, x, y, w, h, k, sc, t) {
  const cx = x + w / 2, cy = y + h / 2;
  if (k < 0.3 && Math.floor(t * 20) % 2 === 0) rect(g, x, y, w, h, k < 0.12 ? I.flash : I.flameCore);
  if (k < 0.25) for (let i = 0, px = cx - 3 * sc, py = y - 0.5; i < 6; i++) { // an arc crackling over the frame
    const nx = px + 1.5 * sc, ny = y - 1.5 - 2 * sc * hash(i * 31 + Math.floor(t * 20));
    rect(g, half(px), half(Math.min(py, ny)), half(nx - px) || 0.5, Math.max(0.5, half(Math.abs(ny - py))), I.glint);
    px = nx; py = ny;
  }
  for (let i = 0; i < 12; i++) {
    const ang = -Math.PI / 2 + (i - 5.5) * 0.36 + (hash(i * 71) - 0.5) * 0.3, sp = (8 + 10 * hash(i * 13)) * sc;
    const px = cx + Math.cos(ang) * sp * k, py = cy + Math.sin(ang) * sp * k + 22 * sc * k * k; // flung up, falling back
    if (k > 0.75 - 0.3 * hash(i * 29)) continue;
    rect(g, half(px) - 0.25, half(py) - 0.25, 1, 1, k < 0.25 ? I.flash : k < 0.5 ? I.flameCore : I.flame);
    rect(g, half(px - Math.cos(ang) * 1.2), half(py - Math.sin(ang) * 1.2 + 0.5), 0.5, 0.5, I.flame);
  }
  if (k > 0.2) for (let i = 0; i < 7; i++) {
    const p = (k - 0.2) / 0.8, r = (1 + 2 * p + hash(i * 7)) * sc * (on('motion') ? 1 + 0.3 * p : 1);
    g.fillStyle = hexA(I.sparkSmoke, 0.8 * (1 - p) ** 1.5);
    g.fillRect(half(cx + (hash(i * 97) - 0.5) * 8 * sc + Math.sin(p * 6 + i) * p - r), half(y - 1 - 14 * sc * p * (0.5 + 0.5 * hash(i * 3)) - r), 2 * r, 2 * r);
  }
}
// Gold glint: a four-point star that blooms and twinkles out. k: 0..1.
function glint(g, x, y, k) {
  const s = Math.sin(Math.PI * Math.min(1, k)), n = half(0.5 + 3 * s * (0.8 + 0.2 * Math.sin(k * 30)));
  if (s <= 0) return;
  x = half(x); y = half(y);
  rect(g, x - n, y - 0.25, 2 * n + 0.5, 0.5, I.brassLit); rect(g, x - 0.25, y - n, 0.5, 2 * n + 0.5, I.brassLit);
  rect(g, x - 0.75, y - 0.75, 1.5, 1.5, I.flameCore); rect(g, x - 0.25, y - 0.25, 0.5, 0.5, I.flash);
}

// shadow: [dx, dy, w, h] under the furniture, dy also its depth-sort line; dim: its palette while unlit.
const dimDesk = themed(t => ({ f: null, F: null, c: t.ink.screenOff })), dimConsole = themed(t => ({ c: t.ink.screenOff }));
const KIND = {
  desk: { map: 'DESK', at: null, dim: dimDesk }, // at: the sprite's anchors (fromArt)
  lectern: { map: 'LECTERN', at: null, dim: dimDesk },
  console: { map: 'CONSOLE', at: null, dim: dimConsole },
};
const consoleLight = (con, lit) => ({ x: con.x + CONSOLE_AT.light[0], y: con.y + CONSOLE_AT.light[1], r: lit ? 10 : 5, color: T.light.green });

function deskLight(desk, busy) {
  const K = KIND[kindOf(desk)];
  return busy
    ? { x: desk.x + K.at.candle[0], y: desk.y + K.at.candle[1], r: 22, color: T.light.amber, flicker: true }
    : { x: desk.x + K.at.slate[0], y: desk.y + K.at.slate[1], r: 10, color: T.light.green };
}

// cog = scribes standing at the cogitator: the bank works harder (faster scroll, blinking, steam).
// Drawn in the minimum scene's coordinates, moved with their room.
function drawDecorFrame(g, t, cog = 0) {
  const sy = 50 + Math.round(2 * Math.sin(t * 4));
  if (on('motion')) flyShadow(g, 244 + H.ox + SK.centre[0], 50 + SK.centre[1]);
  blit(g, MAPS.SKULL, 244 + H.ox, sy);
  g.save(); g.translate(H.ox, H.sd); drawMagos(g, t); g.restore();
  g.save(); g.translate(H.dx, 0); drawCogitator(g, t, cog); g.restore();
}

// The cogitator bank (MAPS.COGITATOR, placed by PROPS.c): its screens, lamps, reels and vents are its anchors
// (PROP_AT.COGITATOR); everything animated sits above y 40, clear of the scribes in front.
const hash = n => { n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d); n = Math.imul(n ^ (n >>> 12), 0x297a2d39); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; };
const [, COG_X, COG_Y] = PROPS.c.find(([name]) => name === 'COGITATOR');
const DRUM_SPIN = [1, -1, -1, 1]; // each reel's turning direction
function drawCogitator(g, t, cog) {
  const on = cog > 0, speed = on ? 6 + 2 * cog : 1.5, C = PROP_AT.COGITATOR, at = ([x, y]) => [COG_X + x, COG_Y + y];
  // centre screen: rows of green cant scrolling up, one row per 1.5 logical px, a marker then words to 1.5 px short of the edge
  const [sx, sy] = at(C.screen), [, , sw, sh] = C.screen, end = sx + sw - 1.5;
  const s = t * speed, top = Math.floor(s), off = (s - top) * 1.5;
  g.save(); g.beginPath(); g.rect(sx, sy, sw, sh); g.clip();
  for (let i = 0; i < 12; i++) {
    const row = top + i, y = half(sy + 0.5 + i * 1.5 - off);
    let x = sx + 1, h = hash(row);
    rect(g, sx, y, 0.5, 0.5, h < 0.2 ? I.glint : I.screenMark); // line marker
    while (x < end) {
      const w = Math.min(end - x, 0.5 + Math.floor((h = hash(h * 4294967296 + row)) * 6) / 2);
      rect(g, x, y, w, 0.5, h < 0.15 ? I.screenHot : h < 0.7 ? I.phosphor : I.screenDim);
      x += w + 0.5 + (h > 0.85 ? 2 : 0);
    }
  }
  if (Math.random() < perFrame(on ? 0.06 : 0.02)) rect(g, sx, sy, sw, sh, I.screenFlicker); // flicker
  g.restore();
  // side screens: left a waveform, right a bar chart
  const [wx, wy] = at(C.wave), [, , ww] = C.wave;
  for (let x = 0; x < ww; x += 0.5) {
    const y = wy + 4 + Math.round(Math.sin(x * 0.9 + t * (on ? 9 : 3)) * Math.sin(t * 0.7 + x * 0.2) * 6) / 2;
    rect(g, wx + x, y, 0.5, 0.5, I.phosphor);
  }
  const [bx, by] = at(C.bars);
  for (let i = 0; i < 7; i++) {
    const h = 1 + Math.floor(hash(i * 977 + Math.floor(t * (on ? 6 : 1.5))) * 14) / 2;
    rect(g, bx + 0.5 + i * 1.5, by + 8 - h, 1, h, i % 3 ? I.screenDim : I.phosphor);
  }
  // lamp row: idle a slow chase, busy a random chatter
  const [lx, ly] = at(C.lamps);
  for (let i = 0; i < 7; i++) {
    const lit = on ? hash(i * 31 + Math.floor(t * 8)) < 0.5 : Math.floor(t * 2) % 7 === i;
    if (!lit) rect(g, lx + 2.5 * i, ly, 1, 1, I.lampDead);
  }
  // data-drums: a light notch turning on each reel
  C.drums.forEach((d, i) => {
    const [cx, cy] = at(d), a = t * DRUM_SPIN[i] * (on ? 6 : 1.2);
    rect(g, half(cx + Math.cos(a) * 2) - 0.25, half(cy + Math.sin(a) * 2) - 0.25, 0.5, 0.5, I.brassLit);
  });
  // steam from the vent stacks: a puff every few seconds idle, a steady plume while working
  for (const v of C.vents) for (let i = 0; i < 3; i++) {
    const [vx, vy] = at(v), c = t * 0.6 + i / 3 + vx, p = c % 1;
    if (!on && Math.floor(c) % 3) continue;
    const r = 1 + p * 2.5;
    g.fillStyle = hexA(I.steam, 0.55 * (1 - p));
    g.fillRect(half(vx - r + Math.sin(c * 5) * p), half(vy - p * 9 - r), 2 * r, 2 * r);
  }
}

// The Magos on the throne: the hanging drill forearm swings 1 art px, chest screen scans, optics pulse (anchors: MAGOS_AT).
const MAG = { x: 264, y: 120 };
function drawMagos(g, t) {
  const A = MAGOS_AT, sway = Math.sin(t * 0.7) > 0 ? 0.5 : 0;
  blit(g, MAGOS.body, MAG.x, MAG.y);
  blit(g, MAGOS.arm, MAG.x + A.arm.x + sway, MAG.y + A.arm.y);
  rect(g, MAG.x + A.chest.x, MAG.y + A.chest.y + (Math.floor(t * 5) % 3) / 2, 2, 0.5, Math.random() < perFrame(0.1) ? I.phosphorDark : I.screenHot);
  if (Math.sin(t * 2.2) > 0.4) for (const e of [A.eyeL, A.eyeR]) rect(g, MAG.x + e.x, MAG.y + e.y, 0.5, 0.5, I.glint);
}

// The room's own lights, by what they move with (see PROPS), plus the floor's coolant crossings on every slot
// row, the windows and the gate's braziers and void: once per scene size.
const STATIC_LIGHTS = {
  c: [{ x: 157, y: 26, r: 36, color: 'green' }, { x: 139, y: 20, r: 16, color: 'green' }, { x: 176, y: 20, r: 16, color: 'green' }, // cogitator screens
    { x: 106, y: 48, r: 14, color: 'amber', flicker: true }, { x: 96, y: 14, r: 10, color: 'amber', flicker: true }],
  e: [{ x: 198, y: 67, r: 10, color: 'amber', flicker: true }],
  r: [{ x: 222, y: 30, r: 14, color: 'green' }, { x: 248, y: 56, r: 12, color: 'green' }], // recaff, skull
  s: [{ x: 256, y: 138, r: 20, color: 'amber', flicker: true }, { x: 298, y: 138, r: 20, color: 'amber', flicker: true },
    { x: 274, y: 153, r: 14, color: 'green' }, { x: 278, y: 132, r: 9, color: 'green' }, // lord desk, Magos optics + chest screen
    { x: 276, y: 186, r: 26, color: 'red' }],
  sb: [{ x: 228, y: 197, r: 26, color: 'amber', flicker: true }, { x: 324, y: 197, r: 26, color: 'amber', flicker: true }],
};
const lightsBySize = new Map();
onTheme(() => lightsBySize.clear());
function staticLights(hall) {
  const key = `${hall.w}x${hall.baseH}:${hall.bays}`;
  let L = lightsBySize.get(key);
  if (!L) {
    if (lightsBySize.size > 8) lightsBySize.clear();
    const { x, y } = hall.entry, { windows, channels } = propsOf(hall), at = (list, mx, my) => list.map(l => ({ ...l, x: l.x + mx, y: l.y + my, color: T.light[l.color] }));
    const S = STATIC_LIGHTS, floor = [];
    for (let j = 0; j < hall.rows; j++) for (let fx = (50 + hall.dx) % 100; fx < hall.sw - 10; fx += 100) floor.push({ x: fx, y: j ? 119 + 64 * j : 117, r: 14 });
    for (const cx of channels) for (let j = 0; j < hall.rows - 1; j++) floor.push({ x: cx + 1, y: 150 + 64 * j, r: 14 });
    L = windows.map(wx => ({ x: wx + 8, y: 22, r: 22 })).concat(
      at(S.c, hall.dx, 0), at(S.e, hall.sw - 200, 0), at(S.r, hall.ox, 0), at(S.s, hall.ox, hall.sd), at(S.sb, hall.ox, hall.sb), floor,
      { x: x - 23, y: y - 11, r: 26, color: T.light.amber, flicker: true }, { x: x + 23, y: y - 11, r: 26, color: T.light.amber, flicker: true }, // gate braziers
      { x, y: y - 12, r: 18, color: T.light.red },
    );
    lightsBySize.set(key, L);
  }
  return L;
}

// Doors, drawn each frame: open while any actor is within 12 logical px of the doorway.
// Leaves slide up/down inside the scriptorium's east wall (sw..sw + 8).
const doorsOf = ({ sw, sd }) => [
  { name: 'sanctum', x0: sw, x1: sw + 8, y0: 150 + sd, y1: 186 + sd }, // scriptorium <-> sanctum (hall.doorOut/doorIn)
  { name: 'refectory', x0: sw, x1: sw + 8, y0: 78, y1: 98 }, // scriptorium <-> refectorium (hall.refOut/refIn)
];
// Is anyone within 12 logical px of the rect x0..x1, y0..y1?
const near = (actors, x0, y0, x1, y1) => actors.some(a => Math.hypot(Math.max(x0 - a.x, 0, a.x - x1), Math.max(y0 - a.y, 0, a.y - y1)) < 12);
function drawDoors(g, actors) {
  for (const d of doorsOf(H)) {
    const name = `door ${d.name} ${near(actors, d.x0, d.y0, d.x1, d.y1) ? 'open' : 'closed'}`, [ax, ay] = roomAt(name).door;
    tile(g, name, d.x0 - ax, d.y0 - ay); // leaves, lock cog, brass lintels and jambs
  }
}

// The grand gate at ENTRY: the iron leaves slide apart into the piers (eased) while anyone is near.
// The void is floor-level; leaves and frame (piers + arch) are returned as a drawable at the wall's base,
// so anyone north of the wall walks behind the arch.
// The frame's entry anchor sits on hall.entry; the leaves slide in its opening (PROP_AT.GATE).
let gateOpen = 0, gateTo = 0;
function drawGate(g, actors) {
  const A = PROP_AT.GATE, GATE = { x: H.entry.x - A.entry[0], y: H.entry.y - A.entry[1] };
  const [ow, oh] = A.opening.slice(2), ox = GATE.x + A.opening[0], oy = GATE.y + A.opening[1];
  gateTo = near(actors, ox, oy, ox + ow, oy + oh) ? 1 : 0;
  gateOpen += (gateTo - gateOpen) * (1 - 0.82 ** (frameDt * 30)); // 0.18 per frame at 30 fps
  if (Math.abs(gateTo - gateOpen) < 0.01) gateOpen = gateTo; // at rest (half(0.01 * 7) is 0)
  blit(g, MAPS.GATE_VOID, ox, oy); // the void beyond, lit by the braziers
  const s = half(gateOpen * A.slide[0]);
  return {
    y: GATE.y + MAPS.GATE.length / RES,
    draw(g2) {
      g2.save(); g2.beginPath(); g2.rect(ox, oy, ow, oh); g2.clip();
      blit(g2, MAPS.GATE_L, GATE.x + A.leafL[0] - s, GATE.y + A.leafL[1]); blit(g2, MAPS.GATE_R, GATE.x + A.leafR[0] + s, GATE.y + A.leafR[1]);
      g2.restore();
      blit(g2, MAPS.GATE, GATE.x, GATE.y);
    },
  };
}

// Escalation: while a petition has waited over 5 min, the beacon on the Sanctum wall turns (red sweep) and the
// servo-skull leaves its perch by the Magos to hover by the oldest stale petitioner, eye and searchlight red.
const beaconOf = ({ ox, sd }) => ({ x: 226 + ox, y: 118 + sd });
const perchOf = ({ ox, sd }) => ({ x: 297 + ox, y: 128 + sd }); // a resize moves it: the skull flies there
const skull = { ...perchOf(hallOf(0)), last: 0 };
const SKULL_SPEED = 60; // logical px per second
const motion = () => depthOn('motion'); // drawAlarm's own `on` is the alarm
const skullRed = themed(t => ({ o: t.ink.alarm, O: t.ink.alarmGlow }));
// Something of the scene is mid-move (the gate's leaves, the servo-skull's flight): the app keeps its full frame rate.
export const sceneBusy = () => gateOpen !== gateTo || !!skull.flying;
function drawAlarm(g, actors, now) {
  const t = now / 1000, lights = [];
  const stale = actors.filter(a => !a.h && !a.leaving && a.pose === 'queue' && isStale(a.s)).sort((p, q) => p.s.sinceMs - q.s.sinceMs);
  const on = stale.length > 0, BEACON = beaconOf(H), PERCH = perchOf(H);
  drawBeacon(g, t, on, BEACON);
  if (on) {
    const sweep = Math.sin(t * 5); // the reflector's turn: the glow swings across the wall and the floor below
    lights.push({ x: BEACON.x, y: BEACON.y, r: 14, color: T.light.beacon },
      { x: BEACON.x + 20 * sweep, y: BEACON.y + 16, r: 30 + 8 * Math.abs(Math.cos(t * 5)), color: T.light.beaconSweep });
  }
  const dt = skull.last ? Math.min(0.25, (now - skull.last) / 1000) : 0;
  skull.last = now;
  const who = stale[0], tgt = on ? { x: who.x + 34, y: who.y - 20 } : PERCH; // beside the petition label, clear of the Magos
  const dx = tgt.x - skull.x, dy = tgt.y - skull.y, d = Math.hypot(dx, dy), step = SKULL_SPEED * dt;
  skull.flying = d > step;
  if (d <= step) { skull.x = tgt.x; skull.y = tgt.y; } else { skull.x += (dx / d) * step; skull.y += (dy / d) * step; }
  const y = skull.y + Math.round(2 * Math.sin(t * 4)) / 2;
  if (on && d <= step) { // hovering: a red searchlight down onto the petitioner
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = hexA(I.searchlight, 0.1 + 0.04 * Math.sin(t * 8));
    const by = y - SK.centre[1] + SK.beam[1], bx = skull.x - SK.centre[0] + SK.beam[0];
    g.beginPath(); g.moveTo(bx - 1.5, by); g.lineTo(bx + 1.5, by); g.lineTo(who.x + 8, who.y + 1); g.lineTo(who.x - 8, who.y + 1); g.closePath(); g.fill();
    g.restore();
  }
  if (motion()) flyShadow(g, skull.x, skull.y);
  blit(g, MAPS.SKULL, half(skull.x) - SK.centre[0], half(y) - SK.centre[1], on ? skullRed() : undefined);
  lights.push({ x: skull.x, y, r: on ? 14 : 7, color: on ? T.light.skullAlarm : T.light.green });
  return lights;
}

// Alarm beacon on its wall bracket: its dome lit or dark, the reflector strip sweeping across the dome when on, under the
// cage (room tiles 'beacon on/off', 'beacon cage'; anchors: centre on the bracket point, the dome the sweep crosses).
function drawBeacon(g, t, on, { x, y }) {
  const A = roomAt('beacon off'), fx = x - A.centre[0], fy = y - A.centre[1];
  tile(g, on ? 'beacon on' : 'beacon off', fx, fy);
  if (on) {
    const [sx0, sy, sw, sh] = A.sweep, p = (t * 2.5) % 1, sx = half(fx + sx0 + p * (sw - 0.5));
    rect(g, sx, fy + sy, 0.5, sh, I.alarmGlow);
    if (sx + 0.5 < fx + sx0 + sw) rect(g, sx + 0.5, fy + sy, 0.5, sh, I.beaconSweep);
  }
  tile(g, 'beacon cage', fx, fy);
}

// The anchors above from the active art (a theme may redraw desks, the skull... with its own anchors). A change drops
// the paper piles: their sheets were laid out on the old surfaces.
function fromArt() {
  DESK_AT = { ...PROP_AT.DESK, scale: 1 }; LECTERN_AT = { ...PROP_AT.LECTERN, scale: 1 }; CONSOLE_AT = { ...PROP_AT.CONSOLE, scale: 0.6 };
  KIND.desk.at = DESK_AT; KIND.lectern.at = LECTERN_AT; KIND.console.at = CONSOLE_AT;
  SK = PROP_AT.SKULL; // centre (its position), carry (a pushed sheet), beam (the searchlight)
  PAPER = papers();
}
fromArt();
onTheme(() => { fromArt(); piles.clear(); });
