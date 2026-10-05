// Pure scene geometry, in logical pixels. Every {x, y} point is a scribe's feet.
export const SCENE = { w: 346, h: 226 };
export const HALL = { x0: 3, x1: 197, y0: 58, y1: 196 };
export const AISLE_Y = 206;
export const ENTRY = { x: (HALL.x0 + HALL.x1) / 2, y: 224 }; // the grand gate, centred in the scriptorium's bottom wall
export const DOOR_OUT = { x: 190, y: 172 };
export const DOOR_IN = { x: 214, y: 172 };
// Refectorium (top-right room) and its door from the scriptorium; idle scribes stop at the recaff, then doze.
export const REF_OUT = { x: 190, y: 92 };
export const REF_IN = { x: 216, y: 92 };
export const RECAFF_SPOT = { x: 222, y: 48 };
export const REFECTORY_SPOTS = [271, 285, 299].flatMap(x => [{ x, y: 66 }, { x, y: 90 }]); // benches south of the two tables
export const COG_SPOTS = [{ x: 160, y: 58 }, { x: 172, y: 58 }, { x: 184, y: 58 }];
export const QUEUE_SLOTS = [
  { x: 276, y: 187 }, { x: 248, y: 189 }, { x: 220, y: 189 }, { x: 186, y: 213 },
  { x: 162, y: 217 }, { x: 140, y: 217 }, { x: 60, y: 217 }, { x: 38, y: 217 }, // the line steps around the gate (x 72..128)
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

// Rooms east of the 200..208 wall: the refectorium above y 104, the sanctum below. Each opens onto the scriptorium.
const roomOf = p => (p.x <= 200 ? 'hall' : p.y < 104 ? 'ref' : 'sanct');
const DOORWAY = { sanct: [DOOR_OUT, DOOR_IN], ref: [REF_OUT, REF_IN] };

// Walk lanes: horizontal ones above the desks, in the gaps under each slot row (desk-free in every layout,
// see layoutDepartments: slot rows start at 58 + 64k) and the bottom aisle; one vertical corridor at x 190,
// east of every desk, which also holds both doorways' hall side.
const LANES = [HALL.y0, HALL.y0 + 60, HALL.y0 + 124, AISLE_Y];
const CORRIDOR_X = REF_OUT.x;
const crosses = (x, y0, y1, blocks) => blocks.some(b => x > b.x && x < b.x + b.w && y0 < b.y + b.h && y1 > b.y);
// Lanes a hall point can step onto straight up or down without walking through a department block.
// Going down, the stretch to the first lane below is always clear (it's the point's own slot gap).
function lanesOf(p, blocks) {
  if (p.x === CORRIDOR_X) return [p.y];
  const first = LANES.find(y => y >= p.y);
  return LANES.filter(y => (y < p.y ? !crosses(p.x, y, p.y, blocks) : !crosses(p.x, first, y, blocks)));
}
const lengthOf = pts => pts.reduce((s, p, i) => s + (i ? Math.abs(p.x - pts[i - 1].x) + Math.abs(p.y - pts[i - 1].y) : 0), 0);

// Axis-aligned path from a to b (both feet), the shortest over the lane choices. blocks: layoutDepartments().blocks.
export function route(a, b, blocks = []) {
  const ra = roomOf(a), rb = roomOf(b);
  if (ra === rb && ra !== 'hall') return [{ x: b.x, y: b.y }];
  const head = ra === 'hall' ? [a] : [a, DOORWAY[ra][1], DOORWAY[ra][0]];
  const tail = rb === 'hall' ? [b] : [DOORWAY[rb][0], DOORWAY[rb][1], b];
  const p = head.at(-1), q = tail[0];
  let best = null;
  for (const la of lanesOf(p, blocks)) for (const lb of lanesOf(q, blocks)) {
    const mid = la === lb ? [{ x: p.x, y: la }, { x: q.x, y: la }]
      : [{ x: p.x, y: la }, { x: CORRIDOR_X, y: la }, { x: CORRIDOR_X, y: lb }, { x: q.x, y: lb }];
    const pts = head.concat(mid, tail);
    if (!best || lengthOf(pts) < lengthOf(best)) best = pts;
  }
  best ??= head.concat({ x: p.x, y: AISLE_Y }, { x: q.x, y: AISLE_Y }, tail); // ponytail: boxed in on every side, old aisle walk
  return best.slice(1).filter((pt, i, arr) => pt.x !== (arr[i - 1] ?? a).x || pt.y !== (arr[i - 1] ?? a).y).map(pt => ({ x: pt.x, y: pt.y }));
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
