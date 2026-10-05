import { blit, sprite, MAPS } from './sprites.js';

export const AMBER = 'rgba(240,168,60,.26)';
export const GREEN = 'rgba(124,255,158,.16)';
export const RED = 'rgba(200,40,28,.22)';

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
function put(g, map, x, y, over) { blit(g, map, x, y, over); }

const DECOR = [
  ['SHELF', 6, 19], ['PAPER_STACK', 10, 8], ['PAPER_STACK', 18, 10], ['SCROLL_PILE', 22, 13],
  ['SHELF', 40, 19], ['BOOKS', 44, 11], ['PAPER_STACK', 58, 8], ['LOOSE_A', 66, 15],
  ['BANNER', 98, 10], ['COGITATOR', 152, 24], ['GAUGE', 132, 26], ['GAUGE', 132, 33], ['VENT', 186, 14],
  ['RECAFF', 214, 22], ['SHELF', 236, 19], ['PAPER_STACK', 240, 8], ['BOOKS', 250, 11], ['PAPER_STACK', 260, 9],
  ['BANNER', 274, 10], ['CRATE', 318, 28], ['CRATE', 320, 80], ['PAPER_STACK', 300, 58], ['PAPER_STACK', 307, 62],
  ['SCROLL_PILE', 256, 84], ['LOOSE_B', 236, 64], ['LOOSE_A', 280, 74],
  ['COG_MECH', 267, 110], ['BANNER', 236, 112], ['BANNER', 306, 112], ['THRONE', 268, 124],
  ['CANDLES', 250, 136], ['CANDLES', 292, 136], ['PAPER_STACK', 246, 140], ['PAPER_STACK', 300, 142],
  ['LORD_DESK', 254, 150], ['SEAL', 260, 162], ['SEAL', 286, 162],
  ['BOOKS', 220, 172], ['SCROLL_PILE', 306, 200], ['LOOSE_A', 244, 206], ['LOOSE_B', 300, 214], ['PAPER_STACK', 326, 178],
  ['BRAZIER', 224, 196], ['BRAZIER', 320, 196], ['CENSER', 94, 7], ['CENSER', 196, 60],
  ['CRATE', 172, 206], ['BRAZIER', 6, 196], ['CANDLES', 186, 46],
];
const CLUTTER = [
  ['SCROLL_PILE', 58, 98], ['PAPER_STACK', 92, 92], ['PAPER_STACK', 99, 95], ['LOOSE_A', 46, 104], ['LOOSE_B', 140, 104],
  ['SCROLL_PILE', 160, 98], ['LOOSE_A', 190, 92], ['PAPER_STACK', 54, 132], ['PAPER_STACK', 61, 136], ['BOOKS', 76, 140],
  ['LOOSE_B', 8, 160], ['SCROLL_PILE', 150, 140], ['PAPER_STACK', 176, 128], ['LOOSE_A', 104, 160], ['SCROLL_PILE', 30, 188],
  ['PAPER_STACK', 64, 196], ['PAPER_STACK', 71, 200], ['BOOKS', 96, 206], ['LOOSE_A', 120, 190], ['LOOSE_B', 134, 212],
  ['SCROLL_PILE', 140, 196], ['LOOSE_A', 186, 186], ['LOOSE_B', 196, 172],
];

export function drawStatic(g, daylight) {
  plates(g, 0, 0, 200, 40, '#2a2a2c', '#18191b'); rect(g, 0, 36, 200, 4, '#140f0c');
  grate(g, 0, 40, 200, 186);
  plates(g, 208, 0, 138, 40, '#2c2c2e', '#18191b'); rect(g, 208, 36, 138, 4, '#140f0c');
  grate(g, 208, 40, 138, 60);
  rect(g, 208, 100, 138, 10, '#100b08');
  plates(g, 208, 110, 138, 30, '#301612', '#1e0c09'); rect(g, 208, 136, 138, 4, '#100b08');
  rect(g, 208, 140, 138, 86, '#3a110e');
  g.strokeStyle = '#6e3f17'; g.lineWidth = 1; g.strokeRect(214.5, 146.5, 125, 73);
  rect(g, 200, 0, 8, 150, '#100b08'); rect(g, 200, 186, 8, 40, '#100b08'); rect(g, 200, 150, 8, 36, '#3a110e');

  g.save(); g.shadowColor = '#3aa864'; g.shadowBlur = 4;
  coolant(g, 0, 116, 200, 2); coolant(g, 0, 182, 200, 2); coolant(g, 98, 40, 2, 186);
  g.restore();

  pipeH(g, 0, 4, 200); pipeH(g, 208, 4, 138);
  [20, 64, 110, 150, 190, 230, 280, 330].forEach(x => flange(g, x, 3, 3, 5));
  pipeV(g, 203, 0, 150); pipeV(g, 203, 186, 40);
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
  [[60, 104, 14, 1], [73, 104, 1, 6], [120, 204, 1, 12]].forEach(([x, y, w, h]) => rect(g, x, y, w, h, '#0e0a08'));
  [[30, 120, 18, 8], [146, 186, 8, 6], [270, 196, 14, 6]].forEach(([x, y, w, h]) => rect(g, x, y, w, h, 'rgba(10,6,4,.35)'));

  const win = daylight ? WIN_DAY : WIN_NIGHT;
  [78, 114, 292].forEach(x => put(g, MAPS.WINDOW, x, 10, win));
  [210, 334].forEach(x => {
    rect(g, x, 108, 10, 118, '#1c1d20'); rect(g, x + 9, 108, 1, 118, '#0e0a08');
    pipeV(g, x + 3, 108, 118);
    [124, 160, 196].forEach(y => put(g, MAPS.GAUGE, x + 2, y));
  });
  rect(g, 210, 150, 10, 36, '#3a110e'); flange(g, 210, 148, 10, 2); flange(g, 210, 186, 10, 2); // pillar opens onto the passage door
  rect(g, 254, 163, 44, 3, 'rgba(0,0,0,.45)');
  for (const [name, x, y] of DECOR) put(g, MAPS[name], x, y);
  for (const [name, x, y] of CLUTTER) put(g, MAPS[name], x, y);
}

const hexA = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

export function drawRugs(g, blocks) {
  for (const b of blocks) {
    g.fillStyle = hexA(b.color, 0.07); g.fillRect(b.x, b.y, b.w, b.h);
    g.strokeStyle = hexA(b.color, 0.3); g.lineWidth = 1; g.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  }
}

export function deskDrawable(desk, busy) {
  return {
    y: desk.y + 21,
    draw(g) {
      g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(desk.x + 1, desk.y + 21, 30, 2);
      blit(g, MAPS.DESK, desk.x, desk.y, busy ? {} : { f: null, F: null, c: '#2e6b47' });
    },
  };
}

export function consoleDrawable(con, lit) {
  return {
    y: con.y + 10,
    draw(g) {
      g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(con.x + 4, con.y + 10, 6, 1);
      blit(g, MAPS.CONSOLE, con.x, con.y, lit ? {} : { c: '#2e6b47' });
    },
  };
}

export const consoleLight = (con, lit) => ({ x: con.x + 7, y: con.y + 3, r: lit ? 10 : 5, color: GREEN });

export function deskLight(desk, busy) {
  return busy
    ? { x: desk.x + 25, y: desk.y + 1, r: 22, color: AMBER, flicker: true }
    : { x: desk.x + 13, y: desk.y + 5, r: 10, color: GREEN };
}

export function drawDecorFrame(g, t) {
  blit(g, MAPS.SKULL, 244, 50 + Math.round(2 * Math.sin(t * 4)));
  drawInquisitor(g, t);
}

// The Inquisitor on the throne: upper body settles 1 art px on each slow breath, the rosette glints every 6 s.
const INQ = { x: 271, y: 128 };
function drawInquisitor(g, t) {
  const cv = sprite(MAPS.INQUISITOR), cut = 22; // art row where the breathing upper body meets the hands/lap
  const w = cv.width / 2, breath = Math.sin(t * 1.4) > 0.2 ? 0.5 : 0;
  g.drawImage(cv, 0, cut, cv.width, cv.height - cut, INQ.x, INQ.y + cut / 2, w, (cv.height - cut) / 2);
  g.drawImage(cv, 0, 0, cv.width, cut, INQ.x, INQ.y + breath, w, cut / 2);
  if (t % 6 < 0.3) {
    const gx = INQ.x + 6, gy = INQ.y + 8 + breath; // rosette's lit upper-left rim
    rect(g, gx - 0.5, gy, 1.5, 0.5, '#fff4c8'); rect(g, gx, gy - 0.5, 0.5, 1.5, '#fff4c8');
  }
}

export const STATIC_LIGHTS = [
  { x: 86, y: 22, r: 22 }, { x: 122, y: 22, r: 22 }, { x: 300, y: 22, r: 22 },
  { x: 172, y: 30, r: 30, color: GREEN }, { x: 222, y: 30, r: 14, color: GREEN }, { x: 248, y: 56, r: 12, color: GREEN },
  { x: 256, y: 138, r: 20, color: AMBER, flicker: true }, { x: 298, y: 138, r: 20, color: AMBER, flicker: true },
  { x: 274, y: 153, r: 14, color: GREEN },
  { x: 228, y: 197, r: 26, color: AMBER, flicker: true }, { x: 324, y: 197, r: 26, color: AMBER, flicker: true },
  { x: 10, y: 197, r: 26, color: AMBER, flicker: true }, { x: 276, y: 186, r: 26, color: RED },
  { x: 192, y: 50, r: 14, color: AMBER, flicker: true },
  { x: 96, y: 14, r: 10, color: AMBER, flicker: true }, { x: 198, y: 67, r: 10, color: AMBER, flicker: true },
  { x: 50, y: 117, r: 14 }, { x: 150, y: 117, r: 14 }, { x: 99, y: 150, r: 14 }, { x: 50, y: 183, r: 14 }, { x: 150, y: 183, r: 14 },
];

// Doors, drawn each frame: open while any actor is within 12 logical px of the doorway.
// v: leaves slide up/down inside the 200..208 wall; h: the exit, leaves slide apart in the bottom wall.
const DOORS = [
  { x0: 200, x1: 208, y0: 150, y1: 186, v: true }, // scriptorium <-> sanctum (DOOR_OUT/DOOR_IN)
  { x0: 200, x1: 208, y0: 78, y1: 98, v: true, floor: '#1c1d20' }, // scriptorium <-> refectorium, decor only
  { x0: 1, x1: 15, y0: 220, y1: 226, floor: '#060404' }, // exit at ENTRY
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
export function drawDoors(g, actors) {
  for (const d of DOORS) {
    const open = actors.some(a => Math.hypot(Math.max(d.x0 - a.x, 0, a.x - d.x1), Math.max(d.y0 - a.y, 0, a.y - d.y1)) < 12);
    const cx = (d.x0 + d.x1) / 2, cy = (d.y0 + d.y1) / 2;
    if (d.v) {
      if (open) { if (d.floor) rect(g, d.x0, d.y0, 8, d.y1 - d.y0, d.floor); leaf(g, d.x0 + 0.5, d.y0, 7, 2); leaf(g, d.x0 + 0.5, d.y1 - 2, 7, 2); }
      else { leaf(g, d.x0 + 0.5, d.y0, 7, cy - d.y0); leaf(g, d.x0 + 0.5, cy, 7, d.y1 - cy); rect(g, d.x0 + 0.5, cy - 0.25, 7, 0.5, '#0e0a08'); cog(g, cx, cy); }
      for (const y of [d.y0 - 2, d.y1]) flange(g, d.x0 - 1, y, 10, 2); // brass lintels
      rect(g, d.x0, d.y0, 0.5, d.y1 - d.y0, '#b8742e'); rect(g, d.x1 - 0.5, d.y0, 0.5, d.y1 - d.y0, '#6e3f17');
    } else {
      rect(g, d.x1, d.y0, 14, d.y1 - d.y0, '#100b08'); rect(g, d.x1, d.y0, 14, 0.5, '#b8742e'); // wall stub
      if (open) { rect(g, d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0, d.floor); leaf(g, d.x0, d.y0 + 0.5, 2, 5.5); leaf(g, d.x1 - 2, d.y0 + 0.5, 2, 5.5); }
      else { leaf(g, d.x0, d.y0 + 0.5, cx - d.x0, 5.5); leaf(g, cx, d.y0 + 0.5, d.x1 - cx, 5.5); cog(g, cx, d.y0 + 3.5); }
      for (const x of [d.x0 - 1, d.x1]) flange(g, x, d.y0 - 1, 2, d.y1 - d.y0 + 1); // brass posts
    }
  }
}
