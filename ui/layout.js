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
export const COG_SPOTS = [127, 142, 157, 172, 187].map(x => ({ x, y: 57 })); // along the cogitator bank's front desk (y 40..51)
export const QUEUE_SLOTS = [
  { x: 276, y: 187 }, { x: 248, y: 189 }, { x: 220, y: 189 }, { x: 186, y: 213 },
  { x: 162, y: 217 }, { x: 140, y: 217 }, { x: 60, y: 217 }, { x: 38, y: 217 }, // the line steps around the gate (x 72..128)
];

const SLOT_H = 64;
// Slot grids: normal desks 4 per row; compact lecterns (22 wide) 6 per row, same row height so the lanes hold.
// Console grid inside an adept slot: 2x2 cells; console (14x10) top-left of its cell, adept feet below it.
const GRID = {
  normal: { w: 48, cols: 4, desk: 32, cell: { w: 22, h: 22, x0: 6, y0: 3 } },
  compact: { w: 31, cols: 6, desk: 22, cell: { w: 16, h: 22, x0: 1, y0: 3 } }, // 6 x 31: the last consoles stay west of the corridor
};

// The growing hall: each bay adds BAY_H of scriptorium floor (one slot row) above the bottom aisle; the aisle,
// the grand gate and the hall's queue slots move down with it. Sanctum and refectorium stay where they are.
export const BAY_H = SLOT_H;
export const MAX_BAYS = 3;
export function hallOf(bays = 0) {
  const dy = bays * BAY_H;
  return {
    bays, dy, h: SCENE.h + dy, y1: HALL.y1 + dy, aisleY: AISLE_Y + dy,
    entry: { x: ENTRY.x, y: ENTRY.y + dy },
    queue: QUEUE_SLOTS.map(q => (q.x <= 200 ? { x: q.x, y: q.y + dy } : q)),
  };
}

// Departments that no longer fit are counted in `overflow` (the last-resort plaque). opt: { compact, bays }.
// d.helpers (optional): helper actor ids, null for a freed console so the others keep their place.
// d.desks (optional, from planLayout): desk slots { key, id, was, freeSince }, id null for an empty desk; else d.ids.
// d.cons (optional): console slots to reserve, at least what the helpers need.
export function layoutDepartments(depts, { compact = false, bays = 0 } = {}) {
  const G = compact ? GRID.compact : GRID.normal, COLS = G.cols, SLOT_W = G.w, CONSOLE_CELL = G.cell, y1 = HALL.y1 + bays * BAY_H;
  const blocks = [];
  const desks = [];
  const seats = new Map();
  const consoles = [];
  const consoleSeats = new Map();
  let x = HALL.x0, y = HALL.y0, rowH = 0, overflow = 0, full = false;
  for (const d of depts) {
    const helpers = d.helpers ?? [], slotsOf = d.desks ?? d.ids.map(id => ({ key: id, id }));
    const n = slotsOf.length, live = slotsOf.filter(k => k.id).length;
    const slots = n + Math.max(d.cons ?? 0, Math.ceil(helpers.length / 4));
    const cols = Math.min(COLS, slots);
    const rows = Math.ceil(slots / COLS);
    const w = cols * SLOT_W + 2;
    const h = rows * SLOT_H - 8;
    if (!full && x + w > HALL.x1 + 1) { x = HALL.x0; y += rowH + 8; rowH = 0; }
    if (full || y + h > y1) { full = true; overflow += live; continue; }
    blocks.push({ name: d.name, color: d.color, x, y, w, h });
    const slot = i => ({ x: x + (i % COLS) * SLOT_W, y: y + Math.floor(i / COLS) * SLOT_H });
    slotsOf.forEach((k, i) => {
      const s = slot(i), desk = { ...k, dept: d.name, x: s.x + 5, y: s.y + 8, ...(compact && { compact }) };
      desks.push(desk);
      if (k.id) seats.set(k.id, { x: desk.x + G.desk / 2, y: desk.y + 30 });
    });
    helpers.forEach((id, k) => {
      if (id == null) return;
      const s = slot(n + (k >> 2)), c = k & 3;
      const con = { id, dept: d.name, x: s.x + CONSOLE_CELL.x0 + (c & 1) * CONSOLE_CELL.w, y: s.y + CONSOLE_CELL.y0 + (c >> 1) * CONSOLE_CELL.h };
      consoles.push(con);
      const seat = { x: con.x + 7, y: con.y + 22 };
      // An upper console's adept would walk down through the console below: step into the gap between the columns first.
      if (c < 2) seat.via = { x: s.x + CONSOLE_CELL.x0 + (CONSOLE_CELL.w + 14) / 2, y: seat.y };
      consoleSeats.set(id, seat);
    });
    x += w + 4;
    rowH = Math.max(rowH, h);
  }
  return { blocks, desks, seats, consoles, consoleSeats, overflow };
}

export const DESK_GRACE_MS = 180_000; // an empty desk waits this long for a newcomer of its department
export const DEPT_GRACE_MS = 300_000; // a department block with no session left stays this long
export const SHRINK_MS = 60_000; // the hall steps back down (fewer bays, then full desks) once roomy this long
// Space levels: 0 full desks; 1 compact lecterns; 1 + b compact with b bays.
const levelOpt = l => ({ compact: l > 0, bays: Math.max(0, l - 1) });
const MAX_LEVEL = 1 + MAX_BAYS;

// Stable seating across roster ticks: a scribe keeps its desk while it lives, a departed scribe's desk stays
// empty (reused first by its department) until DESK_GRACE_MS, an empty block until DEPT_GRACE_MS; new
// departments append. Spare console slots also wait DESK_GRACE_MS. When the hall would overflow, every
// waiting empty is dropped at once. prev: last result (or null); depts: live departments as for
// layoutDepartments (ids, helpers, without the scribes dozing in the refectorium: they release their desk) in arrival order; now: ms. Returns layoutDepartments() plus `plan`, the
// state to pass back next tick. grace: { desk, dept, shrink } ms overrides.
// Space: past capacity the hall goes compact, then grows bays (result `level`, `compact`, `bays`); it steps back
// one level at a time once the level below would still fit with a desk more in every department, for SHRINK_MS.
// The "+N in the stacks" overflow only remains past MAX_BAYS.
export function planLayout(prev, depts, now, grace = {}) {
  const deskG = grace.desk ?? DESK_GRACE_MS, deptG = grace.dept ?? DEPT_GRACE_MS, shrinkG = grace.shrink ?? SHRINK_MS;
  const live = new Map(depts.map(d => [d.name, d]));
  let seq = prev?.seq ?? 0;
  let plan = (prev?.plan ?? []).map(p => ({ ...p, desks: p.desks.map(k => ({ ...k })) }));
  for (const d of depts) if (!plan.some(p => p.name === d.name)) plan.push({ name: d.name, desks: [], cons: 0, emptySince: null });
  for (const p of plan) {
    const d = live.get(p.name), ids = d?.ids ?? [];
    p.color = d?.color ?? p.color;
    p.helpers = d?.helpers ?? [];
    for (const k of p.desks) if (k.id && !ids.includes(k.id)) Object.assign(k, { id: null, was: k.id, freeSince: now });
    for (const id of ids) {
      if (p.desks.some(k => k.id === id)) continue;
      const free = p.desks.find(k => !k.id && k.was === id) ?? p.desks.find(k => !k.id); // a waking napper's own desk first
      if (free) Object.assign(free, { id, was: null, freeSince: null });
      else p.desks.push({ key: `${p.name}#${seq++}`, id, was: null, freeSince: null });
    }
    // An empty block keeps its desks until the whole block goes.
    if (ids.length) p.desks = p.desks.filter(k => k.id || now - k.freeSince < deskG);
    const need = Math.ceil(p.helpers.length / 4);
    if (need >= p.cons) Object.assign(p, { cons: need, consFreeSince: null });
    else if (now - (p.consFreeSince ??= now) >= deskG) Object.assign(p, { cons: need, consFreeSince: null });
    p.emptySince = ids.length || p.helpers.some(id => id != null) ? null : p.emptySince ?? now;
  }
  plan = plan.filter(p => p.emptySince == null || now - p.emptySince < deptG);
  let level = prev?.level ?? 0, shrinkSince = prev?.shrinkSince ?? null;
  let L = layoutDepartments(plan, levelOpt(level));
  if (L.overflow) { // capacity forces it: drop the waiting empties now
    plan = plan.filter(p => p.emptySince == null);
    for (const p of plan) { p.desks = p.desks.filter(k => k.id); p.cons = Math.ceil(p.helpers.length / 4); p.consFreeSince = null; }
    L = layoutDepartments(plan, levelOpt(level));
  }
  if (L.overflow) shrinkSince = null;
  while (L.overflow && level < MAX_LEVEL) L = layoutDepartments(plan, levelOpt(++level)); // still full: compact, then grow
  if (level > 0 && !L.overflow) { // hysteresis: the level below must hold a desk more per department, for a while
    const roomy = !layoutDepartments(plan.map(p => ({ ...p, desks: p.desks.concat({ key: '+', id: null }) })), levelOpt(level - 1)).overflow;
    if (!roomy) shrinkSince = null;
    else if (now - (shrinkSince ??= now) >= shrinkG) { L = layoutDepartments(plan, levelOpt(--level)); shrinkSince = null; }
  }
  return { ...L, plan, seq, level, shrinkSince, ...levelOpt(level) };
}

// Rooms east of the 200..208 wall: the refectorium above y 104, the sanctum below. Each opens onto the scriptorium.
const roomOf = p => (p.x <= 200 ? 'hall' : p.y < 104 ? 'ref' : 'sanct');
const DOORWAY = { sanct: [DOOR_OUT, DOOR_IN], ref: [REF_OUT, REF_IN] };

// Walk lanes: horizontal ones above the desks, in the gaps under each slot row (desk-free in every layout,
// see layoutDepartments: slot rows start at 58 + 64k) and the bottom aisle; one vertical corridor at x 190,
// east of every desk, which also holds both doorways' hall side.
const lanesFor = bays => [HALL.y0, ...Array.from({ length: 2 + bays }, (_, k) => HALL.y0 + 60 + k * SLOT_H), AISLE_Y + bays * BAY_H];
const CORRIDOR_X = REF_OUT.x;
// A block is solid row by row: the 8 px gap under each of its slot rows holds a lane and is open.
const crosses = (x, y0, y1, blocks) => blocks.some(b => x > b.x && x < b.x + b.w &&
  Array.from({ length: (b.h + 8) / SLOT_H }, (_, k) => b.y + k * SLOT_H).some(ry => y0 < ry + SLOT_H - 8 && y1 > ry));
// Lanes a hall point can step onto straight up or down without walking through a department block.
// Going down, the stretch to the first lane below is always clear (it's the point's own slot gap).
function lanesOf(p, blocks, LANES) {
  if (p.x === CORRIDOR_X) return [p.y];
  const first = LANES.find(y => y >= p.y);
  return LANES.filter(y => (y < p.y ? !crosses(p.x, y, p.y, blocks) : !crosses(p.x, first, y, blocks)));
}
const lengthOf = pts => pts.reduce((s, p, i) => s + (i ? Math.abs(p.x - pts[i - 1].x) + Math.abs(p.y - pts[i - 1].y) : 0), 0);

// Axis-aligned path from a to b (both feet), the shortest over the lane choices. blocks: layoutDepartments().blocks.
// A point may carry `via`: the step taken between it and the lanes (see console seats). bays: hallOf().
export function route(a, b, blocks = [], bays = 0) {
  const LANES = lanesFor(bays), aisle = LANES.at(-1);
  const ra = roomOf(a), rb = roomOf(b);
  if (ra === rb && ra !== 'hall') return [{ x: b.x, y: b.y }];
  const head = ra === 'hall' ? [a].concat(a.via ?? []) : [a, DOORWAY[ra][1], DOORWAY[ra][0]];
  const tail = rb === 'hall' ? [].concat(b.via ?? [], b) : [DOORWAY[rb][0], DOORWAY[rb][1], b];
  const p = head.at(-1), q = tail[0];
  let best = null;
  for (const la of lanesOf(p, blocks, LANES)) for (const lb of lanesOf(q, blocks, LANES)) {
    const mid = la === lb ? [{ x: p.x, y: la }, { x: q.x, y: la }]
      : [{ x: p.x, y: la }, { x: CORRIDOR_X, y: la }, { x: CORRIDOR_X, y: lb }, { x: q.x, y: lb }];
    const pts = head.concat(mid, tail);
    if (!best || lengthOf(pts) < lengthOf(best)) best = pts;
  }
  best ??= head.concat({ x: p.x, y: aisle }, { x: q.x, y: aisle }, tail); // ponytail: boxed in on every side, old aisle walk
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
