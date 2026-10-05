// Pure scene geometry, in logical pixels. Every {x, y} point is a scribe's feet.
export const SCENE = { w: 346, h: 226 };
export const HALL = { x0: 3, x1: 197, y0: 58, y1: 196 };
export const AISLE_Y = 206;
export const ENTRY = { x: 8, y: 224 };
export const DOOR_OUT = { x: 190, y: 172 };
export const DOOR_IN = { x: 214, y: 172 };
export const COG_SPOTS = [{ x: 160, y: 58 }, { x: 172, y: 58 }, { x: 184, y: 58 }];
export const QUEUE_SLOTS = [
  { x: 276, y: 187 }, { x: 248, y: 189 }, { x: 220, y: 189 }, { x: 186, y: 213 },
  { x: 158, y: 217 }, { x: 130, y: 217 }, { x: 102, y: 217 }, { x: 74, y: 217 },
];

const SLOT_W = 48;
const SLOT_H = 64;
const COLS = 4;

// Console grid inside an adept slot: 2x2, each cell 22 wide x 22 tall; console (14x10) top-left, adept feet below it.
const CONSOLE_CELL = { w: 22, h: 22, x0: 6, y0: 3 };

// ponytail: departments that no longer fit are counted in `overflow` (shown as a plaque), not shrunk.
// d.helpers (optional): helper actor ids, null for a freed console so the others keep their place.
export function layoutDepartments(depts) {
  const blocks = [];
  const desks = [];
  const seats = new Map();
  const consoles = [];
  const consoleSeats = new Map();
  let x = HALL.x0, y = HALL.y0, rowH = 0, overflow = 0, full = false;
  for (const d of depts) {
    const n = d.ids.length, helpers = d.helpers ?? [];
    const slots = n + Math.ceil(helpers.length / 4);
    const cols = Math.min(COLS, slots);
    const rows = Math.ceil(slots / COLS);
    const w = cols * SLOT_W + 2;
    const h = rows * SLOT_H - 8;
    if (!full && x + w > HALL.x1 + 1) { x = HALL.x0; y += rowH + 8; rowH = 0; }
    if (full || y + h > HALL.y1) { full = true; overflow += n; continue; }
    blocks.push({ name: d.name, color: d.color, x, y, w, h });
    const slot = i => ({ x: x + (i % COLS) * SLOT_W, y: y + Math.floor(i / COLS) * SLOT_H });
    d.ids.forEach((id, i) => {
      const s = slot(i), desk = { id, dept: d.name, x: s.x + 5, y: s.y + 8 };
      desks.push(desk);
      seats.set(id, { x: desk.x + 16, y: desk.y + 30 });
    });
    helpers.forEach((id, k) => {
      if (id == null) return;
      const s = slot(n + (k >> 2)), c = k & 3;
      const con = { id, dept: d.name, x: s.x + CONSOLE_CELL.x0 + (c & 1) * CONSOLE_CELL.w, y: s.y + CONSOLE_CELL.y0 + (c >> 1) * CONSOLE_CELL.h };
      consoles.push(con);
      consoleSeats.set(id, { x: con.x + 7, y: con.y + 22 });
    });
    x += w + 4;
    rowH = Math.max(rowH, h);
  }
  return { blocks, desks, seats, consoles, consoleSeats, overflow };
}

const inOffice = p => p.x > 200;

export function route(a, b) {
  if (inOffice(a) && inOffice(b)) return [{ x: b.x, y: b.y }];
  const pts = [];
  if (inOffice(a)) pts.push(DOOR_IN, DOOR_OUT, { x: DOOR_OUT.x, y: AISLE_Y });
  else pts.push({ x: a.x, y: AISLE_Y });
  if (inOffice(b)) pts.push({ x: DOOR_OUT.x, y: AISLE_Y }, DOOR_OUT, DOOR_IN, b);
  else pts.push({ x: b.x, y: AISLE_Y }, b);
  return pts.map(p => ({ x: p.x, y: p.y }));
}

export function phaseOf(hour) {
  if (hour >= 8 && hour < 18) return 'day';
  if ((hour >= 6 && hour < 8) || (hour >= 18 && hour < 21)) return 'dusk';
  return 'night';
}

export function lightLevel(mode, hour) {
  const phase = mode === 'full' ? 'day' : mode === 'candles' ? 'night' : phaseOf(hour);
  return {
    phase,
    dark: { day: 0.18, dusk: 0.5, night: 0.78 }[phase],
    glow: { day: 0.45, dusk: 0.8, night: 1 }[phase],
    beams: phase === 'day',
  };
}
