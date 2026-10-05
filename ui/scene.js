import { blit, sprite, MAPS } from './sprites.js';
import { ENTRY, hallOf } from './layout.js';
import { drawActor, isStale, BURN_S, PUFF_S, FX_S, PICK_S, LAMP_S } from './actors.js';

const AMBER = 'rgba(240,168,60,.26)';
const GREEN = 'rgba(124,255,158,.16)';
const RED = 'rgba(200,40,28,.22)';

const WIN_DAY = { u: '#6a8fb0', v: '#8aa86a', g: '#e0b85a', x: '#b8423a' };
const WIN_NIGHT = { u: '#3a2236', v: '#36401f', g: '#7a5a28' };
const BIN = '0100000101110110011001010010000001001111011011010110111001101001';

// Half-pixel detail: 0.5 logical = 1 art px (the background canvas is drawn at RES).
function grate(g, x, y, w, h) {
  g.fillStyle = '#2b2d30'; g.fillRect(x, y, w, h);
  g.fillStyle = '#141516';
  for (let i = x; i < x + w; i += 4) g.fillRect(i, y, 0.5, h);
  for (let j = y; j < y + h; j += 4) g.fillRect(x, j, w, 0.5);
  g.fillStyle = '#383b3f'; // lit lip of each bar
  for (let i = x; i < x + w; i += 4) g.fillRect(i + 0.5, y, 0.5, h);
  for (let j = y; j < y + h; j += 4) g.fillRect(x, j + 0.5, w, 0.5);
}
function plates(g, x, y, w, h, base, line) {
  g.fillStyle = base; g.fillRect(x, y, w, h);
  for (let j = y + 9; j < y + h; j += 10) {
    g.fillStyle = line; g.fillRect(x, j, w, 0.5);
    g.fillStyle = 'rgba(255,240,220,.07)'; g.fillRect(x, j + 0.5, w, 0.5);
    for (let i = x + 3; i < x + w; i += 12) { // rivets either side of the seam
      g.fillStyle = line; g.fillRect(i, j - 2, 1, 1); g.fillRect(i, j + 1.5, 1, 1);
      g.fillStyle = 'rgba(255,240,220,.18)'; g.fillRect(i, j - 2, 0.5, 0.5); g.fillRect(i, j + 1.5, 0.5, 0.5);
    }
  }
}
function pipeH(g, x, y, w) {
  rect(g, x, y, w, 1, '#c8853a'); rect(g, x, y, w, 0.5, '#e8b070');
  rect(g, x, y + 1, w, 2, '#8a4f22'); rect(g, x, y + 2.5, w, 0.5, '#5a3214');
}
function pipeV(g, x, y, h) {
  rect(g, x, y, 1, h, '#c8853a'); rect(g, x, y, 0.5, h, '#e8b070');
  rect(g, x + 1, y, 2, h, '#8a4f22'); rect(g, x + 2.5, y, 0.5, h, '#5a3214');
}
// Flange ring around a pipe: lit top/left edge, dark bottom/right edge, a bolt.
function flange(g, x, y, w, h) {
  rect(g, x, y, w, h, '#6e3f17');
  rect(g, x, y, w, 0.5, '#b8742e'); rect(g, x, y, 0.5, h, '#b8742e');
  rect(g, x, y + h - 0.5, w, 0.5, '#3a200c'); rect(g, x + w - 0.5, y, 0.5, h, '#3a200c');
  rect(g, x + w / 2 - 0.5, y + h / 2 - 0.5, 1, 1, '#e8b45a');
}
// Coolant channel: dark glow edge, green body, bright inner core.
function coolant(g, x, y, w, h) {
  rect(g, x, y, w, h, '#2a8a50');
  if (w > h) { rect(g, x, y + 0.5, w, h - 1, '#3aa864'); rect(g, x, y + h / 2 - 0.25, w, 0.5, '#b4ffc8'); }
  else { rect(g, x + 0.5, y, w - 1, h, '#3aa864'); rect(g, x + w / 2 - 0.25, y, 0.5, h, '#b4ffc8'); }
}
function rect(g, x, y, w, h, color) { g.fillStyle = color; g.fillRect(x, y, w, h); }
const half = v => Math.round(v * 2) / 2; // snap to the art-pixel grid

// Static props [map, x, y]; none may sit under a queue slot (layout.test.mjs).
export const DECOR = [
  ['SHELF', 6, 19], ['PAPER_STACK', 10, 8], ['PAPER_STACK', 18, 10], ['SCROLL_PILE', 22, 13],
  ['SHELF', 40, 19], ['BOOKS', 44, 11], ['PAPER_STACK', 58, 8], ['LOOSE_A', 66, 15],
  ['BANNER', 98, 10], ['COGITATOR', 116, 2], ['CANDLES', 100, 44],
  ['RECAFF', 214, 22], ['SHELF', 236, 19], ['PAPER_STACK', 240, 8], ['BOOKS', 250, 11], ['PAPER_STACK', 260, 9],
  ['BANNER', 274, 10], ['CRATE', 318, 28], ['CRATE', 320, 80], ['PAPER_STACK', 322, 44], ['PAPER_STACK', 329, 48],
  ['SCROLL_PILE', 238, 78], ['LOOSE_B', 236, 64], ['LOOSE_A', 244, 94],
  ['TABLE', 262, 46], ['BENCH', 262, 58], ['TABLE', 262, 70], ['BENCH', 262, 82], // refectory (REFECTORY_SPOTS sit on the benches)
  ['COG_MECH', 267, 110], ['BANNER', 236, 112], ['BANNER', 306, 112], ['THRONE', 268, 124],
  ['CANDLES', 250, 136], ['CANDLES', 292, 136], ['PAPER_STACK', 246, 140], ['PAPER_STACK', 300, 142],
  ['LORD_DESK', 254, 150], ['SEAL', 260, 162], ['SEAL', 286, 162],
  ['BOOKS', 316, 164], ['SCROLL_PILE', 306, 200], ['LOOSE_A', 244, 206], ['LOOSE_B', 300, 214], ['PAPER_STACK', 326, 178],
  ['BRAZIER', 224, 196], ['BRAZIER', 320, 196], ['CENSER', 94, 7], ['CENSER', 196, 60],
  ['CRATE', 12, 190], ['BRAZIER', ENTRY.x - 28, 211], ['BRAZIER', ENTRY.x + 18, 211],
];
export const CLUTTER = [
  ['SCROLL_PILE', 58, 98], ['PAPER_STACK', 92, 92], ['PAPER_STACK', 99, 95], ['LOOSE_A', 46, 104], ['LOOSE_B', 140, 104],
  ['SCROLL_PILE', 160, 98], ['LOOSE_A', 190, 92], ['PAPER_STACK', 54, 132], ['PAPER_STACK', 61, 136], ['BOOKS', 76, 140],
  ['LOOSE_B', 8, 160], ['SCROLL_PILE', 150, 140], ['PAPER_STACK', 176, 128], ['LOOSE_A', 104, 160], ['SCROLL_PILE', 30, 188],
  ['PAPER_STACK', 19, 204], ['BOOKS', 8, 206], ['LOOSE_A', 120, 190], ['LOOSE_B', 150, 212],
  ['SCROLL_PILE', 78, 187], ['LOOSE_A', 186, 186], ['LOOSE_B', 196, 172],
];

// Hall props south of the last original slot row (y >= 184, x < 200) move down with the bays (layout.js hallOf).
const sink = dy => ([name, x, y]) => [name, x, x < 200 && y >= 184 ? y + dy : y];

export function drawStatic(g, daylight, hall = hallOf(0)) {
  const dy = hall.dy;
  plates(g, 0, 0, 200, 40, '#2a2a2c', '#18191b'); rect(g, 0, 36, 200, 4, '#140f0c');
  grate(g, 0, 40, 200, 186 + dy);
  plates(g, 208, 0, 138, 40, '#2c2c2e', '#18191b'); rect(g, 208, 36, 138, 4, '#140f0c');
  grate(g, 208, 40, 138, 60);
  rect(g, 208, 100, 138, 10, '#100b08');
  plates(g, 208, 110, 138, 30, '#301612', '#1e0c09'); rect(g, 208, 136, 138, 4, '#100b08');
  rect(g, 208, 140, 138, 86, '#3a110e');
  g.strokeStyle = '#6e3f17'; g.lineWidth = 1; g.strokeRect(214.5, 146.5, 125, 73);
  rect(g, 200, 0, 8, 150, '#100b08'); rect(g, 200, 186, 8, 40 + dy, '#100b08'); rect(g, 200, 150, 8, 36, '#3a110e');
  if (dy) bayWall(g, dy);

  g.save(); g.shadowColor = '#3aa864'; g.shadowBlur = 4;
  coolant(g, 0, 116, 200, 2); coolant(g, 98, 40, 2, 186 + dy);
  for (let k = 0; k <= hall.bays; k++) coolant(g, 0, 182 + k * 64, 200, 2);
  g.restore();
  for (let k = 1; k <= hall.bays; k++) bayArch(g, 120 + k * 64);

  pipeH(g, 0, 4, 200); pipeH(g, 208, 4, 138);
  [20, 64, 110, 150, 190, 230, 280, 330].forEach(x => flange(g, x, 3, 3, 5));
  pipeV(g, 203, 0, 150); pipeV(g, 203, 186, 40 + dy);
  [36, 74, 112].forEach(y => flange(g, 202, y, 5, 3));
  pipeV(g, 144, 7, 29); pipeV(g, 194, 7, 29);
  [8, 26, 50, 74, 96, 128, 150, 172, 196, 220].forEach((x, i) => {
    const h = 10 + (i * 7) % 18;
    rect(g, x, 7, 0.5, h, '#0e0a08'); rect(g, x + 0.5, 7, 0.5, h, 'rgba(255,240,220,.06)'); rect(g, x, 7 + h - 1, 2, 1, '#0e0a08');
  });
  // Binary cant: 1-art-px glyphs (ones tall, zeros a dot), one per logical px.
  g.fillStyle = 'rgba(124,255,158,.38)';
  [[2, 32, 198], [74, 38, 198], [210, 32, 344], [210, 105, 344]].forEach(([x, y, end]) => {
    for (let i = 0; x + i < end; i++) g.fillRect(x + i, y, 0.5, BIN[(i + x) % BIN.length] === '1' ? 1 : 0.5);
  });
  [[60, 104, 14, 1], [73, 104, 1, 6], [120, 204 + dy, 1, 12]].forEach(([x, y, w, h]) => rect(g, x, y, w, h, '#0e0a08'));
  [[30, 120, 18, 8], [146, 186 + dy, 8, 6], [270, 196, 14, 6]].forEach(([x, y, w, h]) => rect(g, x, y, w, h, 'rgba(10,6,4,.35)'));

  const win = daylight ? WIN_DAY : WIN_NIGHT;
  [78, 292].forEach(x => blit(g, MAPS.WINDOW, x, 10, win));
  [210, 334].forEach(x => {
    rect(g, x, 108, 10, 118, '#1c1d20'); rect(g, x + 9, 108, 1, 118, '#0e0a08');
    pipeV(g, x + 3, 108, 118);
    [124, 160, 196].forEach(y => blit(g, MAPS.GAUGE, x + 2, y));
  });
  rect(g, 210, 150, 10, 36, '#3a110e'); flange(g, 210, 148, 10, 2); flange(g, 210, 186, 10, 2); // pillar opens onto the passage door
  rect(g, 254, 163, 44, 3, 'rgba(0,0,0,.45)');
  for (const [name, x, y] of DECOR.concat(CLUTTER).map(sink(dy))) blit(g, MAPS[name], x, y);
  rect(g, 0, 223 + dy, 200, 3, '#100b08'); rect(g, 0, 223 + dy, 200, 0.5, '#6e3f17'); // scriptorium's bottom wall, the gate sits in it
}

// A bay's seam (y: its first slot row's top, minus 2): a brass-edged iron sill across the floor between two
// pilasters standing out of the side walls, the arch the new floor opens behind.
function bayArch(g, y) {
  rect(g, 0, y, 200, 2, '#1c1d20'); rect(g, 0, y, 200, 0.5, '#b8742e'); rect(g, 0, y + 1.5, 200, 0.5, '#0e0a08');
  for (let x = 6; x < 200; x += 12) { rect(g, x, y + 0.5, 1, 1, '#6e3f17'); rect(g, x, y + 0.5, 0.5, 0.5, '#e8b45a'); }
  for (const x of [0, 196]) {
    rect(g, x, y - 14, 4, 18, '#0e0a08'); rect(g, x + 0.5, y - 13.5, 3, 17, '#2a2c30');
    rect(g, x + 0.5, y - 13.5, 0.5, 17, '#5a5e63'); rect(g, x + 3, y - 13.5, 0.5, 17, '#141516');
    flange(g, x, y - 15, 4, 2); flange(g, x, y + 3, 4, 1.5); // capital and base
  }
}
// East of the scriptorium, below the sanctum: plated wall the length of the bays, a pipe run, cant and banners per bay.
function bayWall(g, dy) {
  plates(g, 208, 226, 138, dy, '#2a2a2c', '#18191b');
  rect(g, 208, 226, 138, 3, '#100b08'); rect(g, 208, 228.5, 138, 0.5, '#6e3f17'); // the sanctum's bottom wall
  for (let y = 226; y < 226 + dy; y += 64) {
    pipeH(g, 220, y + 10, 114);
    [232, 272, 312].forEach(x => flange(g, x, y + 9, 3, 5));
    g.fillStyle = 'rgba(124,255,158,.38)';
    for (let i = 0; 222 + i < 332; i++) g.fillRect(222 + i, y + 20, 0.5, BIN[(i + y) % BIN.length] === '1' ? 1 : 0.5);
    blit(g, MAPS.BANNER, 240, y + 30); blit(g, MAPS.BANNER, 294, y + 30); blit(g, MAPS.WINDOW, 263, y + 28, WIN_NIGHT);
  }
  for (const x of [210, 334]) { // the sanctum's pillars carry on down
    rect(g, x, 229, 10, dy - 3, '#1c1d20'); rect(g, x + 9, 229, 1, dy - 3, '#0e0a08');
    pipeV(g, x + 3, 229, dy - 3);
    for (let y = 266; y < 226 + dy; y += 64) blit(g, MAPS.GAUGE, x + 2, y);
  }
}

const hexA = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

const PILE_FADE_MS = 4000;
const lastFill = new Map(); // desk key -> its occupant's last paper fill, for the fade once it leaves

// One frame of everything that moves or depends on the roster, over the static background.
// actors: Cast.actors; fillOf: context -> paper fill. Returns every light of the frame for drawLighting.
// layout.hall: hallOf() of the current bays.
export function drawScene(g, layout, actors, fillOf, now) {
  H = layout.hall ?? hallOf(0);
  const all = [...actors.values()];
  drawRugs(g, layout.blocks);
  drawDoors(g, all);
  const items = [drawGate(g, all)], lights = [], over = [];
  const blockOf = dept => layout.blocks.find(b => b.name === dept);
  for (const d of layout.desks) {
    const a = actors.get(d.id), pile = d.id ?? d.was ?? d.key;
    // An empty desk (its scribe gone, see planLayout) is unlit and its pile fades away over PILE_FADE_MS.
    const fill = !d.id ? (lastFill.get(d.key) ?? 0) * Math.max(0, 1 - (Date.now() - d.freeSince) / PILE_FADE_MS)
      : a?.burn ? 0 : fillOf(a?.s.context); // a burner carries its pile away
    if (d.id) lastFill.set(d.key, fill);
    const busy = !!a && a.pose === 'desk' && a.s.status === 'busy';
    paperFloor(g, pile, kindOf(d), fill, d, blockOf(d.dept), now);
    items.push(deskDrawable({ ...d, id: pile }, busy, fill, !!a?.s.background, now, d.id && a));
    if (d.id) lights.push(deskLight(d, busy));
    if (d.id && a) reactions(a, d, KIND[kindOf(d)].at, over, lights, now);
    if (a?.puff > 0) {
      const k = 1 - a.puff / PUFF_S, mid = KIND[kindOf(d)].mid;
      items.push({ y: d.y + 22, draw: g2 => puff(g2, d.x + mid, d.y + 11, k) });
      lights.push({ x: d.x + mid, y: d.y + 10, r: 18 * (1 - k), color: AMBER });
    }
  }
  for (const c of layout.consoles) {
    const a = actors.get(c.id), fill = fillOf(a?.h?.context);
    const lit = !!a && a.pose === 'console';
    paperFloor(g, c.id, 'console', fill, c, blockOf(c.dept), now);
    items.push(consoleDrawable(c, lit, fill, a));
    lights.push(consoleLight(c, lit));
    if (a) reactions(a, c, CONSOLE_AT, over, lights, now);
  }
  for (const a of all) items.push({ y: a.y, draw: g2 => { drawActor(g2, a); if (a.burn) bundle(g2, a, fillOf(a.burn.old)); } });
  items.sort((p, q) => p.y - q.y).forEach(it => it.draw(g));
  over.forEach(f => f(g));
  for (const a of all) if (a.burn && a.pose === 'burn') { // the brazier sits south of the burner: its fire draws over the robe hem
    const k = 1 - a.burn.left / BURN_S, f = a.burn.fire, heat = k < 0.25 ? k / 0.25 : (1 - k) / 0.75;
    flare(g, f, k, heat, now / 1000);
    lights.push({ x: f.x, y: f.y - 2, r: 26 + 44 * heat, color: 'rgba(255,196,96,.5)', flicker: true });
  }
  drawDecorFrame(g, now / 1000, all.filter(a => a.pose === 'cog').length);
  return staticLights(H).concat(lights, drawAlarm(g, all, now));
}

function drawRugs(g, blocks) {
  for (const b of blocks) {
    g.fillStyle = hexA(b.color, 0.07); g.fillRect(b.x, b.y, b.w, b.h);
    g.strokeStyle = hexA(b.color, 0.3); g.lineWidth = 1; g.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  }
}

// A full desk or, in a crowded hall, a compact lectern (layout.js GRID.compact): sprite, width, and where its
// centre, slate and candle are, from its top-left.
const kindOf = d => (d.compact ? 'lectern' : 'desk');
function deskDrawable(desk, busy, fill, bgShell, now, a) {
  const kind = kindOf(desk), K = KIND[kind];
  return {
    y: desk.y + 21,
    draw(g) {
      g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(desk.x + 1, desk.y + 21, K.w - 2, 2);
      blit(g, MAPS[K.map], desk.x, desk.y, busy ? {} : { f: null, F: null, c: '#2e6b47' });
      paperTop(g, desk.id, kind, fill, desk);
      if (bgShell) spinCog(g, desk.x + K.w - 4, desk.y + 7, now / 1000);
      if (a) furnitureFx(g, a, desk, K.at);
    },
  };
}

// A background shell still runs after the turn: a tiny brass cog turning on the desk corner (art px = 0.5).
function spinCog(g, cx, cy, t) {
  rect(g, cx - 2, cy - 1, 4, 3, '#0e0a08'); rect(g, cx - 1.5, cy - 1.5, 3, 4, '#0e0a08'); // outline
  for (let i = 0; i < 8; i++) { // 8 teeth, turning ~1 rev / 3 s
    const ang = t * 2 + i * Math.PI / 4;
    rect(g, half(cx - 0.25 + Math.cos(ang) * 2.25), half(cy - 0.25 + Math.sin(ang) * 2.25), 1, 1, i ? '#8a4f22' : '#e8b45a');
  }
  rect(g, cx - 1.5, cy - 1, 3, 2, '#b8742e'); rect(g, cx - 1, cy - 1.5, 2, 3, '#b8742e');
  rect(g, cx - 1.5, cy - 1, 0.5, 1, '#e8b45a'); rect(g, cx - 1, cy - 1.5, 1, 0.5, '#e8b45a'); // lit upper-left
  rect(g, cx - 0.5, cy - 0.5, 1, 1, '#2a2c30'); // axle
}

function consoleDrawable(con, lit, fill, a) {
  return {
    y: con.y + 10,
    draw(g) {
      g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(con.x + 4, con.y + 10, 6, 1);
      blit(g, MAPS.CONSOLE, con.x, con.y, lit ? {} : { c: '#2e6b47' });
      paperTop(g, con.id, 'console', fill, con);
      if (a) furnitureFx(g, a, con, CONSOLE_AT);
    },
  };
}

// Context paper. fill = context tokens / model window: 0..0.5 covers the desk (or a small pile beside a
// console), above 0.5 sheets fall and spread over the department floor, dense at 1. Red sheets from 0.9.
// Every desk/console has one deterministic sheet list (seeded by its id); fill only picks how many show.
const PAPER = {
  desk: { cols: 6, rows: 3, x0: 1, dx: 4.8, y0: 10.5, dy: 2.6, layers: 4, floor: 56, cx: 16, cy: 12, r0: 14, reach: 30 },
  lectern: { cols: 4, rows: 3, x0: 1, dx: 4.4, y0: 10.5, dy: 2.6, layers: 4, floor: 40, cx: 11, cy: 12, r0: 11, reach: 22 },
  console: { cols: 1, rows: 3, x0: 15, dx: 0, y0: 8, dy: 0.5, layers: 2, floor: 5, cx: 7, cy: 6, r0: 9, reach: 6 },
};
const piles = new Map(); // ponytail: one entry per id ever seen (a few hundred bytes each); prune if ids churn a lot
function pileOf(id, kind) {
  let p = piles.get(`${kind}:${id}`);
  if (p) return p;
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
  p = { top, floor, shown: -1, born: [], vis: [] };
  piles.set(`${kind}:${id}`, p);
  return p;
}
const counts = (p, fill) => {
  const f = Math.max(0, fill);
  return [Math.round(Math.min(f, 0.5) / 0.5 * p.top.length), Math.round(Math.min(1, Math.max(0, f - 0.5) / 0.5) * p.floor.length)];
};
function sheet(g, x, y, w, h, red) {
  rect(g, x - 0.5, y - 0.5, w + 1, h + 1, '#0e0a08');
  rect(g, x, y, w, h, red ? '#d8a08a' : '#d6c79f');
  g.fillStyle = red ? '#8e1c16' : '#a8946a'; g.fillRect(x + 0.5, y + 1, w - 1.5, 0.5);
  if (h > 3) g.fillRect(x + 0.5, y + 2.5, w - 2, 0.5);
}
// On the desk surface (or beside the console), drawn with the furniture.
function paperTop(g, id, kind, fill, at) {
  const p = pileOf(id, kind), [n] = counts(p, fill);
  if (p.vis.length !== n) p.vis = p.top.slice(0, n).sort((a, b) => a.y - b.y); // re-sorted only when the count changes
  const warn = fill >= 0.9;
  for (const t of p.vis) for (let l = 0; l < t.layers; l++) sheet(g, at.x + t.x, at.y + t.y - l, t.w, 2.5, warn && t.red && l === t.layers - 1);
}
// Fallen sheets on the floor around it, kept inside the department block; new ones flutter down from the desk.
function paperFloor(g, id, kind, fill, at, block, now) {
  const p = pileOf(id, kind), [, m] = counts(p, fill), k = PAPER[kind];
  if (m > p.shown) for (let i = Math.max(0, p.shown); i < m; i++) p.born[i] = p.shown < 0 ? -1e9 : now;
  p.shown = m;
  const warn = fill >= 0.9;
  const fit = (v, lo, hi) => Math.min(hi, Math.max(lo, v < lo ? 2 * lo - v : v > hi ? 2 * hi - v : v));
  for (let i = 0; i < m; i++) {
    const s = p.floor[i];
    let x = fit(at.x + s.x, block.x + 1, block.x + block.w - s.w - 1), y = fit(at.y + s.y, block.y + 1, block.y + block.h - s.h - 1);
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
  rect(g, x - 0.5, top - 0.5, w + 1, n * 0.5 + 1.5, '#0e0a08');
  for (let i = 0; i < n; i++) rect(g, x + (i % 3 === 1 ? 0.5 : 0), top + i * 0.5, w - 0.5, 0.5, i % 2 ? '#a8946a' : '#d6c79f');
  rect(g, x, y, w, 0.5, '#d6c79f'); // the bottom sheet's lit edge
  rect(g, half(x + w / 2 - 0.5), top - 0.5, 1, n * 0.5 + 1.5, '#8e1c16'); // cord
}
// The pile burning in the brazier: tall flame tongues, rising sparks and charred flakes. k: 0..1 of the burn, heat: 0..1..0.
function flare(g, f, k, heat, t) {
  for (let dx = -3; dx <= 3; dx += 0.5) {
    const h = heat * Math.max(0, 9 - Math.abs(dx) * 2.2) * (0.7 + 0.3 * Math.sin(t * 23 + dx * 3.1));
    if (h < 0.5) continue;
    rect(g, f.x + dx - 0.25, half(f.y - h), 0.5, half(h), '#f0a83c');
    if (Math.abs(dx) < 2) rect(g, f.x + dx - 0.25, half(f.y - h * 0.6), 0.5, half(h * 0.6), '#ffe6a0');
  }
  for (let i = 0; i < 18; i++) {
    const p = (k * 1.8 + hash(i * 7919)) % 1, life = 1 - p;
    if (k > 0.85 && p > 0.5) continue; // the last sparks die out
    const x = f.x + (hash(i * 131) - 0.5) * 10 * p + Math.sin(t * 6 + i) * p, y = f.y - 3 - p * (14 + 10 * hash(i * 37));
    rect(g, half(x), half(y), 0.5, 0.5, i % 5 === 0 ? '#3a3430' : life > 0.6 ? '#ffe6a0' : life > 0.3 ? '#f0a83c' : '#ff3a20');
  }
}
// Papers vanishing off an unattended desk: a grey puff spreading and fading, a few embers at first. k: 0..1.
function puff(g, x, y, k) {
  for (let i = 0; i < 8; i++) {
    const ang = i * 0.785 + hash(i * 53) * 0.6, d = 2 + 9 * k * (0.6 + 0.4 * hash(i * 17)), r = 1 + 2.5 * k;
    g.fillStyle = `rgba(190,180,164,${0.75 * (1 - k)})`;
    g.fillRect(half(x + Math.cos(ang) * d - r), half(y + Math.sin(ang) * d * 0.6 - r - 4 * k), 2 * r, 2 * r);
    if (k < 0.4) rect(g, half(x + Math.cos(ang) * d * 1.3), half(y + Math.sin(ang) * d - 2 * k), 0.5, 0.5, i % 2 ? '#ffe6a0' : '#f0a83c');
  }
}

// Chronicle reactions (actors.js Cast.chronicle). Offsets from the desk/console's top-left: the screen that sparks, the
// test lamp on its frame, where the commit's purity seal goes (on a desk they stay: a.seals, max 3, hung on the front edge
// clear of the seated scribe).
const DESK_AT = { screen: [8.5, 2.5, 7, 4.5], lamp: [8, -3], seals: [[1.5, 8], [5.5, 8.5], [26.5, 8]], scale: 1 };
const LECTERN_AT = { screen: [2.5, 2.5, 7, 4.5], lamp: [2, -3], seals: [[0.5, 8], [19, 8], [19, 12.5]], scale: 1 };
const CONSOLE_AT = { screen: [3, 1.5, 7.5, 3.5], lamp: [10, -2.5], seals: [[15, 3.5]], scale: 0.6 };
const STAMP_HIT = 0.9; // s into a commit: the stamp comes down and the seal is set
const newest = a => Math.max(0, (a.seals ?? 1) - 1);
const stamping = a => a.fx?.some(f => f.kind === 'commit' && f.t < STAMP_HIT);
// The test lamp: green for LAMP_S after a pass, then dark; red blinking for LAMP_S after a fail, then dim red.
function lampColor(l) {
  if (l.ok) return l.t < LAMP_S ? 'on' : 'off';
  return l.t >= LAMP_S ? 'dim' : Math.floor(l.t * 3) % 3 ? 'red' : 'dark';
}
const LAMP = { on: ['#7cff9e', '#e6ffee'], off: ['#16301f', '#2a8a50'], red: ['#ff3a20', '#ffd0b0'], dim: ['#8e1c16', '#c8281a'], dark: ['#3a0d09', '#5e1710'] };
// Drawn with the furniture (under the scribe): sealed sheets and the lamp.
function furnitureFx(g, a, at, AT) {
  if (!a.h) {
    const n = (a.seals ?? 0) - (stamping(a) ? 1 : 0);
    for (let i = 0; i < n; i++) seal(g, at.x + AT.seals[i][0], at.y + AT.seals[i][1], 1);
  }
  if (a.lamp) {
    const [body, shine] = LAMP[lampColor(a.lamp)], x = at.x + AT.lamp[0], y = at.y + AT.lamp[1];
    rect(g, x - 0.5, y - 0.5, 3.5, 3.5, '#0e0a08'); // cage outline, bulb, shine, brass collar onto the frame
    rect(g, x, y, 2.5, 2.5, body); rect(g, x + 0.5, y + 0.5, 0.5, 0.5, shine);
    rect(g, x - 0.5, y + 2.5, 3.5, 0.5, '#b8742e');
  }
}
// Everything else plays over the scene; lights join the frame's.
function reactions(a, at, AT, over, lights, now) {
  const t = now / 1000;
  if (a.lamp) {
    const c = lampColor(a.lamp), x = at.x + AT.lamp[0] + 1.25, y = at.y + AT.lamp[1] + 1.25;
    if (c === 'on') lights.push({ x, y, r: 16, color: 'rgba(124,255,158,.55)' });
    if (c === 'red') lights.push({ x, y, r: 18, color: 'rgba(255,58,32,.6)' });
    if (c === 'dim') lights.push({ x, y, r: 6, color: 'rgba(255,58,32,.3)' });
  }
  for (const f of a.fx ?? []) {
    const k = f.t / FX_S[f.kind];
    if (f.kind === 'commit') {
      const [sx, sy] = AT.seals[a.h ? 0 : newest(a)], x = at.x + sx, y = at.y + sy;
      over.push(g => stamp(g, x, y, f.t, a.h));
      if (f.t > STAMP_HIT && f.t < STAMP_HIT + 0.6) lights.push({ x: x + 1.5, y: y + 1.5, r: 18 * (1 - (f.t - STAMP_HIT) / 0.6), color: 'rgba(255,58,32,.7)' });
    }
    if (f.kind === 'push') {
      const [sx, sy] = AT.seals[a.h ? 0 : f.slot], p = courier(f.t, at.x + sx + 1.5, at.y + sy - 6, t);
      over.push(g => { blit(g, MAPS.SKULL, half(p.x) - 5, half(p.y) - 5); if (f.t >= PICK_S) seal(g, half(p.x) - 1.5, half(p.y) + 4.5, 1); });
      lights.push({ x: p.x, y: p.y, r: 10, color: GREEN });
    }
    if (f.kind === 'tool-error') {
      const [sx, sy, sw, sh] = AT.screen, x = at.x + sx, y = at.y + sy;
      over.push(g => spark(g, x, y, sw, sh, k, AT.scale, t));
      lights.push({ x: x + sw / 2, y: y + sh / 2, r: 34 * AT.scale * (1 - k), color: 'rgba(255,230,160,.8)' });
    }
    if (f.kind === 'task-done') {
      const x = a.h || a.pose !== 'desk' ? a.x : a.x + 6, y = a.h ? a.y - 17 : a.pose === 'desk' ? a.y - 25 : a.y - 20;
      over.push(g => glint(g, x, y, k));
      lights.push({ x, y, r: 16 * Math.sin(Math.PI * k), color: 'rgba(232,180,90,.6)' });
    }
  }
}
// A purity seal (art px = 0.5): two parchment strips hanging below a red wax disc, (x, y) its top-left; wax 0 = strips only.
function seal(g, x, y, wax) {
  rect(g, x, y + 2, 2, 5, '#0e0a08'); rect(g, x + 1.5, y + 2, 2, 4, '#0e0a08');
  rect(g, x + 0.5, y + 2.5, 1, 4, '#d6c79f'); rect(g, x + 2, y + 2.5, 1, 3, '#cfc3a8');
  rect(g, x + 0.5, y + 4, 1, 0.5, '#a8946a'); rect(g, x + 0.5, y + 5.5, 0.5, 0.5, '#a8946a'); rect(g, x + 2, y + 4.5, 1, 0.5, '#a8946a');
  if (!wax) return;
  rect(g, x - 0.5, y, 4, 3, '#0e0a08'); rect(g, x, y - 0.5, 3, 4, '#0e0a08');
  rect(g, x, y + 0.5, 3, 2, '#c8281a'); rect(g, x + 0.5, y, 2, 3, '#c8281a');
  rect(g, x + 1, y + 1, 1, 1, '#8e1c16'); rect(g, x + 0.5, y + 0.5, 0.5, 0.5, '#ff8a6a'); rect(g, x + 2, y + 2, 0.5, 0.5, '#5e1710');
}
// The commit: a wax drop falls on a fresh sheet, the stamp comes down (STAMP_HIT), lifts away, the seal glints.
function stamp(g, x, y, t, small) {
  if (t < STAMP_HIT) {
    seal(g, x, y, 0);
    const d = Math.min(1, t / 0.4); // the wax drop, a blob once it lands
    if (d < 1) rect(g, x + 1, half(y + 1 - 8 * (1 - d) ** 2), 1, 1.5, '#c8281a');
    else { rect(g, x, y + 0.5, 3, 2, '#0e0a08'); rect(g, x + 0.5, y + 1, 2, 1, '#c8281a'); }
  }
  const down = t < STAMP_HIT ? Math.max(0, (t - 0.35) / (STAMP_HIT - 0.35)) : t < 1.2 ? 1 : Math.max(0, 1 - (t - 1.2) / 0.5);
  if (down > 0) {
    const sy = half(y - 12 + 8.5 * down * down) + (t >= STAMP_HIT && t < 1.05 ? 0.5 : 0), sx = x;
    rect(g, sx - 0.5, sy - 0.5, 4, 6, '#0e0a08'); // knob, brass stem, iron foot
    rect(g, sx + 0.5, sy, 2, 1.5, '#b8742e'); rect(g, sx + 0.5, sy, 1.5, 0.5, '#e8b45a');
    rect(g, sx + 1, sy + 1.5, 1, 2, '#6e3f17'); rect(g, sx + 1, sy + 1.5, 0.5, 2, '#b8742e');
    rect(g, sx, sy + 3.5, 3, 1.5, '#2a2c30'); rect(g, sx, sy + 3.5, 3, 0.5, '#8a9096');
  }
  if (!small && t > 1.5) glint(g, x + 1.5, y + 1.5, (t - 1.5) / 1.5);
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
  if (k < 0.3 && Math.floor(t * 20) % 2 === 0) rect(g, x, y, w, h, k < 0.12 ? '#ffffff' : '#ffe6a0');
  if (k < 0.25) for (let i = 0, px = cx - 3 * sc, py = y - 0.5; i < 6; i++) { // an arc crackling over the frame
    const nx = px + 1.5 * sc, ny = y - 1.5 - 2 * sc * hash(i * 31 + Math.floor(t * 20));
    rect(g, half(px), half(Math.min(py, ny)), half(nx - px) || 0.5, Math.max(0.5, half(Math.abs(ny - py))), '#e6ffee');
    px = nx; py = ny;
  }
  for (let i = 0; i < 12; i++) {
    const ang = -Math.PI / 2 + (i - 5.5) * 0.36 + (hash(i * 71) - 0.5) * 0.3, sp = (8 + 10 * hash(i * 13)) * sc;
    const px = cx + Math.cos(ang) * sp * k, py = cy + Math.sin(ang) * sp * k + 22 * sc * k * k; // flung up, falling back
    if (k > 0.75 - 0.3 * hash(i * 29)) continue;
    rect(g, half(px) - 0.25, half(py) - 0.25, 1, 1, k < 0.25 ? '#ffffff' : k < 0.5 ? '#ffe6a0' : '#f0a83c');
    rect(g, half(px - Math.cos(ang) * 1.2), half(py - Math.sin(ang) * 1.2 + 0.5), 0.5, 0.5, '#f0a83c');
  }
  if (k > 0.2) for (let i = 0; i < 7; i++) {
    const p = (k - 0.2) / 0.8, r = (1 + 2 * p + hash(i * 7)) * sc;
    g.fillStyle = `rgba(196,188,174,${0.8 * (1 - p) ** 1.5})`;
    g.fillRect(half(cx + (hash(i * 97) - 0.5) * 8 * sc + Math.sin(p * 6 + i) * p - r), half(y - 1 - 14 * sc * p * (0.5 + 0.5 * hash(i * 3)) - r), 2 * r, 2 * r);
  }
}
// Gold glint: a four-point star that blooms and twinkles out. k: 0..1.
function glint(g, x, y, k) {
  const s = Math.sin(Math.PI * Math.min(1, k)), n = half(0.5 + 3 * s * (0.8 + 0.2 * Math.sin(k * 30)));
  if (s <= 0) return;
  x = half(x); y = half(y);
  rect(g, x - n, y - 0.25, 2 * n + 0.5, 0.5, '#e8b45a'); rect(g, x - 0.25, y - n, 0.5, 2 * n + 0.5, '#e8b45a');
  rect(g, x - 0.75, y - 0.75, 1.5, 1.5, '#ffe6a0'); rect(g, x - 0.25, y - 0.25, 0.5, 0.5, '#ffffff');
}

const KIND = {
  desk: { map: 'DESK', w: 32, mid: 16, at: DESK_AT, candle: 25, slate: 13 },
  lectern: { map: 'LECTERN', w: 22, mid: 11, at: LECTERN_AT, candle: 17.5, slate: 7 },
};
const consoleLight = (con, lit) => ({ x: con.x + 7, y: con.y + 3, r: lit ? 10 : 5, color: GREEN });

function deskLight(desk, busy) {
  const K = KIND[kindOf(desk)];
  return busy
    ? { x: desk.x + K.candle, y: desk.y + 1, r: 22, color: AMBER, flicker: true }
    : { x: desk.x + K.slate, y: desk.y + 5, r: 10, color: GREEN };
}

// cog = scribes standing at the cogitator: the bank works harder (faster scroll, blinking, steam).
function drawDecorFrame(g, t, cog = 0) {
  blit(g, MAPS.SKULL, 244, 50 + Math.round(2 * Math.sin(t * 4)));
  drawMagos(g, t);
  drawCogitator(g, t, cog);
}

// The cogitator bank (MAPS.COGITATOR at 116,2): everything animated sits above y 40, clear of the scribes in front.
const hash = n => { n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d); n = Math.imul(n ^ (n >>> 12), 0x297a2d39); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; };
function drawCogitator(g, t, cog) {
  const on = cog > 0, speed = on ? 6 + 2 * cog : 1.5;
  // centre screen (149,15.5 16x16.5): rows of green cant scrolling up, one row per 1.5 logical px
  const s = t * speed, top = Math.floor(s), off = (s - top) * 1.5;
  g.save(); g.beginPath(); g.rect(149, 15.5, 16, 16.5); g.clip();
  for (let i = 0; i < 12; i++) {
    const row = top + i, y = half(16 + i * 1.5 - off);
    let x = 150, h = hash(row);
    rect(g, 149, y, 0.5, 0.5, h < 0.2 ? '#e6ffee' : '#2a8a50'); // line marker
    while (x < 163.5) {
      const w = Math.min(163.5 - x, 0.5 + Math.floor((h = hash(h * 4294967296 + row)) * 6) / 2);
      rect(g, x, y, w, 0.5, h < 0.15 ? '#b8ffc8' : h < 0.7 ? '#7cff9e' : '#3aa864');
      x += w + 0.5 + (h > 0.85 ? 2 : 0);
    }
  }
  if (Math.random() < (on ? 0.06 : 0.02)) rect(g, 149, 15.5, 16, 16.5, 'rgba(22,48,31,.55)'); // flicker
  g.restore();
  // side screens (133 / 170, 15.5, 11x8.5): left a waveform, right a bar chart
  for (let x = 0; x < 11; x += 0.5) {
    const y = 19.5 + Math.round(Math.sin(x * 0.9 + t * (on ? 9 : 3)) * Math.sin(t * 0.7 + x * 0.2) * 6) / 2;
    rect(g, 133 + x, y, 0.5, 0.5, '#7cff9e');
  }
  for (let i = 0; i < 7; i++) {
    const h = 1 + Math.floor(hash(i * 977 + Math.floor(t * (on ? 6 : 1.5))) * 14) / 2;
    rect(g, 170.5 + i * 1.5, 23.5 - h, 1, h, i % 3 ? '#3aa864' : '#7cff9e');
  }
  // lamp row: idle a slow chase, busy a random chatter
  for (let i = 0; i < 7; i++) {
    const lit = on ? hash(i * 31 + Math.floor(t * 8)) < 0.5 : Math.floor(t * 2) % 7 === i;
    if (!lit) rect(g, 149 + 2.5 * i, 34.5, 1, 1, '#1c1d20');
  }
  // data-drums: a light notch turning on each reel
  for (const [cx, cy, dir] of [[125, 18, 1], [125, 29, -1], [188, 18, -1], [188, 29, 1]]) {
    const a = t * dir * (on ? 6 : 1.2);
    rect(g, half(cx + Math.cos(a) * 2) - 0.25, half(cy + Math.sin(a) * 2) - 0.25, 0.5, 0.5, '#e8b45a');
  }
  // steam from the two vent stacks: a puff every few seconds idle, a steady plume while working
  for (const vx of [138, 175.5]) for (let i = 0; i < 3; i++) {
    const c = t * 0.6 + i / 3 + vx, p = c % 1;
    if (!on && Math.floor(c) % 3) continue;
    const r = 1 + p * 2.5;
    g.fillStyle = `rgba(214,206,190,${0.55 * (1 - p)})`;
    g.fillRect(half(vx - r + Math.sin(c * 5) * p), half(5 - p * 9 - r), 2 * r, 2 * r);
  }
}

// The Magos on the throne: the hanging drill forearm (art cols 0..9) swings 1 art px, chest screen scans, optics pulse.
const MAG = { x: 264, y: 120 };
function drawMagos(g, t) {
  const cv = sprite(MAPS.MAGOS), A = 10, h = cv.height / 2, sway = Math.sin(t * 0.7) > 0 ? 0.5 : 0;
  g.drawImage(cv, A, 0, cv.width - A, cv.height, MAG.x + A / 2, MAG.y, (cv.width - A) / 2, h);
  g.drawImage(cv, 0, 0, A, cv.height, MAG.x + sway, MAG.y, A / 2, h);
  rect(g, MAG.x + 13, MAG.y + 15 + (Math.floor(t * 5) % 3) / 2, 2, 0.5, Math.random() < 0.1 ? '#16301f' : '#b8ffc8');
  if (Math.sin(t * 2.2) > 0.4) { rect(g, MAG.x + 13, MAG.y + 9.5, 0.5, 0.5, '#e6ffee'); rect(g, MAG.x + 14.5, MAG.y + 9.5, 0.5, 0.5, '#e6ffee'); }
}

const STATIC_LIGHTS = [
  { x: 86, y: 22, r: 22 }, { x: 300, y: 22, r: 22 },
  { x: 157, y: 26, r: 36, color: GREEN }, { x: 139, y: 20, r: 16, color: GREEN }, { x: 176, y: 20, r: 16, color: GREEN }, // cogitator screens
  { x: 222, y: 30, r: 14, color: GREEN }, { x: 248, y: 56, r: 12, color: GREEN }, // recaff, skull
  { x: 256, y: 138, r: 20, color: AMBER, flicker: true }, { x: 298, y: 138, r: 20, color: AMBER, flicker: true },
  { x: 274, y: 153, r: 14, color: GREEN }, { x: 278, y: 132, r: 9, color: GREEN }, // lord desk, Magos optics + chest screen
  { x: 228, y: 197, r: 26, color: AMBER, flicker: true }, { x: 324, y: 197, r: 26, color: AMBER, flicker: true },
  { x: 276, y: 186, r: 26, color: RED },
  { x: 106, y: 48, r: 14, color: AMBER, flicker: true },
  { x: 96, y: 14, r: 10, color: AMBER, flicker: true }, { x: 198, y: 67, r: 10, color: AMBER, flicker: true },
  { x: 50, y: 117, r: 14 }, { x: 150, y: 117, r: 14 }, { x: 99, y: 150, r: 14 },
];
// Plus the ones that follow the bays: coolant crossings on each bay's floor line, the gate's braziers and void.
const lightsByBays = new Map();
function staticLights(hall) {
  let L = lightsByBays.get(hall.bays);
  if (!L) {
    const { x, y } = hall.entry;
    L = STATIC_LIGHTS.concat(
      Array.from({ length: hall.bays + 1 }, (_, k) => [{ x: 50, y: 183 + 64 * k, r: 14 }, { x: 150, y: 183 + 64 * k, r: 14 }]).flat(),
      Array.from({ length: hall.bays }, (_, k) => ({ x: 99, y: 214 + 64 * k, r: 14 })),
      { x: x - 23, y: y - 11, r: 26, color: AMBER, flicker: true }, { x: x + 23, y: y - 11, r: 26, color: AMBER, flicker: true }, // gate braziers
      { x, y: y - 12, r: 18, color: RED },
    );
    lightsByBays.set(hall.bays, L);
  }
  return L;
}

// Doors, drawn each frame: open while any actor is within 12 logical px of the doorway.
// Leaves slide up/down inside the 200..208 wall.
const DOORS = [
  { x0: 200, x1: 208, y0: 150, y1: 186 }, // scriptorium <-> sanctum (DOOR_OUT/DOOR_IN)
  { x0: 200, x1: 208, y0: 78, y1: 98, floor: '#1c1d20' }, // scriptorium <-> refectorium (REF_OUT/REF_IN)
];
function cog(g, cx, cy) {
  rect(g, cx - 0.5, cy - 3.5, 1, 7, '#b8742e'); rect(g, cx - 3.5, cy - 0.5, 7, 1, '#b8742e');
  [[-3, -3], [2, -3], [-3, 2], [2, 2]].forEach(([dx, dy]) => rect(g, cx + dx, cy + dy, 1, 1, '#8a4f22'));
  rect(g, cx - 2.5, cy - 2.5, 5, 5, '#b8742e'); rect(g, cx - 2.5, cy - 2.5, 5, 0.5, '#e8b45a'); rect(g, cx - 2.5, cy - 2.5, 0.5, 5, '#e8b45a');
  rect(g, cx - 1, cy - 1, 2, 2, '#2a2c30'); rect(g, cx - 0.5, cy - 0.5, 1, 1, '#8e1c16');
}
function leaf(g, x, y, w, h) {
  rect(g, x, y, w, h, '#2a2c30'); rect(g, x, y, w, 0.5, '#5a5e63'); rect(g, x, y, 0.5, h, '#5a5e63');
  rect(g, x + w - 0.5, y, 0.5, h, '#141516'); rect(g, x, y + h - 0.5, w, 0.5, '#141516');
  if (h > 4) for (let j = y + 1.5; j < y + h - 1; j += 3) { rect(g, x + 1, j, 0.5, 0.5, '#8a9096'); rect(g, x + w - 1.5, j, 0.5, 0.5, '#8a9096'); }
  if (w > 4) for (let i = x + 1.5; i < x + w - 1; i += 3) { rect(g, i, y + 1, 0.5, 0.5, '#8a9096'); rect(g, i, y + h - 1.5, 0.5, 0.5, '#8a9096'); }
}
function drawDoors(g, actors) {
  for (const d of DOORS) {
    const open = actors.some(a => Math.hypot(Math.max(d.x0 - a.x, 0, a.x - d.x1), Math.max(d.y0 - a.y, 0, a.y - d.y1)) < 12);
    const cx = (d.x0 + d.x1) / 2, cy = (d.y0 + d.y1) / 2;
    if (open) { if (d.floor) rect(g, d.x0, d.y0, 8, d.y1 - d.y0, d.floor); leaf(g, d.x0 + 0.5, d.y0, 7, 2); leaf(g, d.x0 + 0.5, d.y1 - 2, 7, 2); }
    else { leaf(g, d.x0 + 0.5, d.y0, 7, cy - d.y0); leaf(g, d.x0 + 0.5, cy, 7, d.y1 - cy); rect(g, d.x0 + 0.5, cy - 0.25, 7, 0.5, '#0e0a08'); cog(g, cx, cy); }
    for (const y of [d.y0 - 2, d.y1]) flange(g, d.x0 - 1, y, 10, 2); // brass lintels
    rect(g, d.x0, d.y0, 0.5, d.y1 - d.y0, '#b8742e'); rect(g, d.x1 - 0.5, d.y0, 0.5, d.y1 - d.y0, '#6e3f17');
  }
}

// The grand gate at ENTRY: the iron leaves slide apart into the piers (eased) while anyone is near.
// The void is floor-level; leaves and frame (piers + arch) are returned as a drawable at the wall's base,
// so anyone north of the wall walks behind the arch.
// 32x30 frame at (entry.x - 16, entry.y - 28); opening 16x22 at +8,+5.
let gateOpen = 0;
function drawGate(g, actors) {
  const GATE = { x: H.entry.x - 16, y: H.entry.y - 28 }, ox = GATE.x + 8, oy = GATE.y + 5;
  const near = actors.some(a => Math.hypot(Math.max(ox - a.x, 0, a.x - ox - 16), Math.max(oy - a.y, 0, a.y - oy - 22)) < 12);
  gateOpen += ((near ? 1 : 0) - gateOpen) * 0.18;
  rect(g, ox, oy, 16, 22, '#060404');
  rect(g, ox + 2, oy + 16, 12, 6, '#2a0a07'); rect(g, ox + 5, oy + 18, 6, 4, '#4e110c'); // the void beyond, lit by the braziers
  const s = half(gateOpen * 7);
  return {
    y: GATE.y + 30,
    draw(g2) {
      g2.save(); g2.beginPath(); g2.rect(ox, oy, 16, 22); g2.clip();
      blit(g2, MAPS.GATE_L, ox - s, oy); blit(g2, MAPS.GATE_R, ox + 8 + s, oy);
      g2.restore();
      blit(g2, MAPS.GATE, GATE.x, GATE.y);
    },
  };
}

// Escalation: while a petition has waited over 5 min, the beacon on the Sanctum wall turns (red sweep) and the
// servo-skull leaves its perch by the Magos to hover by the oldest stale petitioner, eye and searchlight red.
const BEACON = { x: 226, y: 118 };
const PERCH = { x: 297, y: 128 };
const skull = { x: PERCH.x, y: PERCH.y, last: 0 };
const SKULL_SPEED = 60; // logical px per second
function drawAlarm(g, actors, now) {
  const t = now / 1000, lights = [];
  const stale = actors.filter(a => !a.h && !a.leaving && a.pose === 'queue' && isStale(a.s)).sort((p, q) => p.s.sinceMs - q.s.sinceMs);
  const on = stale.length > 0;
  drawBeacon(g, t, on);
  if (on) {
    const sweep = Math.sin(t * 5); // the reflector's turn: the glow swings across the wall and the floor below
    lights.push({ x: BEACON.x, y: BEACON.y, r: 14, color: 'rgba(255,58,32,.6)' },
      { x: BEACON.x + 20 * sweep, y: BEACON.y + 16, r: 30 + 8 * Math.abs(Math.cos(t * 5)), color: 'rgba(255,40,20,.4)' });
  }
  const dt = skull.last ? Math.min(0.1, (now - skull.last) / 1000) : 0;
  skull.last = now;
  const who = stale[0], tgt = on ? { x: who.x + 34, y: who.y - 20 } : PERCH; // beside the petition label, clear of the Magos
  const dx = tgt.x - skull.x, dy = tgt.y - skull.y, d = Math.hypot(dx, dy), step = SKULL_SPEED * dt;
  if (d <= step) { skull.x = tgt.x; skull.y = tgt.y; } else { skull.x += (dx / d) * step; skull.y += (dy / d) * step; }
  const y = skull.y + Math.round(2 * Math.sin(t * 4)) / 2;
  if (on && d <= step) { // hovering: a red searchlight down onto the petitioner
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = `rgba(255,50,30,${0.1 + 0.04 * Math.sin(t * 8)})`;
    g.beginPath(); g.moveTo(skull.x - 1.5, y + 4); g.lineTo(skull.x + 1.5, y + 4); g.lineTo(who.x + 8, who.y + 1); g.lineTo(who.x - 8, who.y + 1); g.closePath(); g.fill();
    g.restore();
  }
  blit(g, MAPS.SKULL, half(skull.x) - 5, half(y) - 5, on ? { o: '#ff3a20', O: '#ffd0b0' } : undefined);
  lights.push({ x: skull.x, y, r: on ? 14 : 7, color: on ? 'rgba(255,58,32,.45)' : GREEN });
  return lights;
}

// Alarm beacon on its wall bracket (art px = 0.5): a caged red dome whose reflector strip sweeps round when on.
function drawBeacon(g, t, on) {
  const { x, y } = BEACON;
  rect(g, x - 0.5, y + 3, 1, 3, '#3a200c'); // stem into the wall
  rect(g, x - 3.5, y + 2.5, 7, 2.5, '#0e0a08'); rect(g, x - 3, y + 3, 6, 1.5, '#6e3f17'); rect(g, x - 3, y + 3, 6, 0.5, '#b8742e');
  rect(g, x - 2.5, y + 3.5, 0.5, 0.5, '#e8b45a'); rect(g, x + 2, y + 3.5, 0.5, 0.5, '#e8b45a'); // bolts
  rect(g, x - 3, y - 2.5, 6, 5.5, '#0e0a08'); rect(g, x - 2.5, y - 3, 5, 0.5, '#0e0a08'); // dome outline, rounded top
  rect(g, x - 2.5, y - 2, 5, 4.5, on ? '#c8281a' : '#5e1710'); rect(g, x - 2, y - 2.5, 4, 0.5, on ? '#c8281a' : '#5e1710');
  rect(g, x - 2.5, y + 1.5, 5, 1, on ? '#8e1c16' : '#3a0d09'); // shaded lower rim
  if (on) {
    const p = (t * 2.5) % 1, sx = half(x - 2.5 + p * 4.5);
    rect(g, sx, y - 2, 0.5, 3.5, '#ffd0b0');
    if (sx + 0.5 < x + 2.5) rect(g, sx + 0.5, y - 2, 0.5, 3.5, '#ff6a4a');
  } else rect(g, x - 2, y - 1.5, 0.5, 1.5, '#8c2c1c'); // dull glint
  rect(g, x - 2.5, y, 5, 0.5, '#2a2c30'); rect(g, x - 1, y - 2.5, 0.5, 4, '#2a2c30'); rect(g, x + 0.5, y - 2.5, 0.5, 4, '#2a2c30'); // cage
  rect(g, x - 1.5, y - 4, 3, 1, '#6e3f17'); rect(g, x - 1.5, y - 4, 3, 0.5, '#e8b45a'); // brass cap
}
