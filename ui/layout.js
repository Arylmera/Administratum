// Pure scene geometry, in logical pixels. Every {x, y} point is a scribe's feet.
// The window sizes the scene (app.js): the scriptorium (west) grows both ways, the right column (refectorium
// over sanctum) keeps its width, anchored east, and grows down. SCENE is the smallest scene, the original
// hall: every position below is measured on it and moved by hallOf().
// WALL: the back wall's height (scriptorium and refectorium): the wall band 0..WALL, its foot WALL - 4..WALL, the floor
// from WALL down. The positions here and in scene.js were measured on the original 346x226 hall with a 40 px wall:
// whatever stands below that wall moves down by WALL_DY, and the minimum scene is WALL_DY taller.
export const WALL = 62;
export const WALL_DY = WALL - 40;
export const SCENE = { w: 346, h: 226 + WALL_DY };
export const MAX_W = 554; // ~1.6x: wider windows get bigger pixels instead of wider aisles (app.js)
const RIGHT_W = 138; // the refectorium/sanctum column, east of the scriptorium's 8 px east wall
const SLOT_H = 64;
// The growing hall: each bay adds BAY_H of scriptorium floor (one slot row) above the bottom aisle; the aisle,
// the grand gate and the hall's queue slots move down with it. Sanctum and refectorium stay where they are.
export const BAY_H = SLOT_H;
export const MAX_BAYS = 6; // up to 6 more slot rows; past that, the plaque

// The scene's geometry for a size {w, h} (the window's) and a number of bays (below the window, panned to).
// dx: the scriptorium's centre (gate, cogitator bank) vs the minimum; ox: the right column; sd: the sanctum's
// top wall (the refectorium takes ~40 % of the column's floor); sb: the sanctum's floor items by its bottom wall;
// hy: the scriptorium's by its bottom wall. sd, sb and hy are moves from the measured hall (WALL_DY included).
const halls = new Map();
export function hallOf(bays = 0, size = SCENE) {
  const w = Math.max(SCENE.w, Math.round(size.w)), baseH = Math.max(SCENE.h, Math.round(size.h)), key = `${w}x${baseH}:${bays}`;
  let H = halls.get(key);
  if (H) return H;
  if (halls.size > 64) halls.clear();
  const dy = bays * BAY_H, h = baseH + dy;
  const sw = w - RIGHT_W - 8, rx = w - RIGHT_W, ox = rx - 208; // the scriptorium is 0..sw, its east wall sw..rx
  const D = WALL_DY, split = Math.max(110, Math.round(0.4 * (baseH - D))) + D, sd = split - 110, sb = baseH - SCENE.h + D;
  const x0 = 3, x1 = sw - 3, y0 = WALL + 18, y1 = h - 30, aisleY = h - 20, corridorX = sw - 10;
  const entry = { x: x0 + Math.floor((x1 - x0) / 2), y: h - 2 }, dx = entry.x - 100, hy = h - SCENE.h + D;
  const rows = Math.floor((y1 - y0 + 8) / SLOT_H); // slot rows the hall holds
  // Refectorium: a canteen row (bench, table, bench) every 26 px down the room; nappers on the south bench, spots row
  // by row (a napper keeps its index). The last row's nappers stay clear of the sanctum wall (split - 10).
  const pairs = Math.floor((split - D - 84) / 26) + 1;
  const refectory = Array.from({ length: pairs }, (_, k) => [271, 285, 299].map(x => ({ x: x + ox, y: 70 + D + 26 * k }))).flat();
  // The petition line: before the Magos's desk, then rows snaking down the sanctum, then the hall's bottom aisle
  // (round the gate) when the sanctum is full.
  const queue = [{ x: 276, y: 187 }, { x: 248, y: 189 }, { x: 220, y: 189 }].map(q => ({ x: q.x + ox, y: q.y + sd }));
  for (let r = 1; r <= Math.floor((baseH - split - 112) / 22); r++) {
    const xs = [220, 248, 276, 304];
    for (const x of r % 2 ? xs : xs.reverse()) queue.push({ x: x + ox, y: 189 + sd + 22 * r });
  }
  queue.push({ x: corridorX - 4, y: 213 + hy });
  for (let x = corridorX - 28; x - entry.x >= 36; x -= 22) queue.push({ x, y: 217 + hy });
  for (let x = entry.x - 40; x >= 38; x -= 22) queue.push({ x, y: 217 + hy });
  H = {
    bays, dy, w, h, baseH, sw, rx, ox, dx, split, sd, sb, hy, rows,
    x0, x1, y0, y1, aisleY, corridorX, entry,
    // Walk lanes: horizontal ones above the desks, in the gap under each slot row (desk-free in every layout,
    // see layoutDepartments: slot rows start at y0 + 64k) and the bottom aisle; one vertical corridor east of
    // every desk, which also holds both doorways' hall side.
    lanes: [y0, ...Array.from({ length: rows }, (_, k) => y0 + 60 + k * SLOT_H), aisleY],
    doorOut: { x: corridorX, y: 172 + sd }, doorIn: { x: 214 + ox, y: 172 + sd }, // scriptorium <-> sanctum
    refOut: { x: corridorX, y: 92 + D }, refIn: { x: 216 + ox, y: 92 + D }, // scriptorium <-> refectorium
    recaff: { x: 222 + ox, y: 48 + D }, refectory, // idle scribes stop at the recaff, then doze on a bench
    cogSpots: [127, 142, 157, 172, 187].map(x => ({ x: x + dx, y: WALL + 17 })), // along the cogitator bank's front desk (y WALL..WALL + 11)
    queue,
  };
  halls.set(key, H);
  return H;
}
// The minimum scene's points, by their old names.
export const { entry: ENTRY, aisleY: AISLE_Y, doorOut: DOOR_OUT, doorIn: DOOR_IN, refOut: REF_OUT, refIn: REF_IN, recaff: RECAFF_SPOT,
  refectory: REFECTORY_SPOTS, cogSpots: COG_SPOTS, queue: QUEUE_SLOTS } = hallOf(0);
export const HALL = { x0: 3, x1: 197, y0: WALL + 18, y1: SCENE.h - 30 };

// Slot grids: normal desks 4 per row; compact lecterns (22 wide) 6 per row, same row height so the lanes hold.
// Console grid inside an adept slot: 2x2 cells; console (14x10) top-left of its cell, adept feet below it.
const GRID = {
  normal: { w: 48, cols: 4, desk: 32, cell: { w: 22, h: 22, x0: 6, y0: 3 } },
  compact: { w: 31, cols: 6, desk: 22, cell: { w: 16, h: 22, x0: 1, y0: 3 } }, // 6 x 31: the last consoles stay west of the corridor
};

// Departments that no longer fit are counted in `overflow` (the last-resort plaque). opt: { compact, bays, size }.
// d.helpers (optional): helper actor ids, null for a freed console so the others keep their place.
// d.desks (optional, from planLayout): desk slots { key, id, was, freeSince }, id null for an empty desk; else d.ids.
// d.cons (optional): console slots to reserve, at least what the helpers need.
// clearCog: the 39° view keeps the floor before the cogitator bank (x 116..198 + dx) free of desks in the first row.
export function layoutDepartments(depts, { compact = false, bays = 0, size = SCENE, clearCog = false } = {}) {
  const G = compact ? GRID.compact : GRID.normal, COLS = G.cols, SLOT_W = G.w, CONSOLE_CELL = G.cell;
  const { x0, x1, y0, y1, corridorX, dx } = hallOf(bays, size);
  const blocks = [];
  const desks = [];
  const seats = new Map();
  const consoles = [];
  const consoleSeats = new Map();
  let x = x0, y = y0, rowH = 0, overflow = 0, full = false, inZone = false;
  for (const d of depts) {
    const helpers = d.helpers ?? [], slotsOf = d.desks ?? d.ids.map(id => ({ key: id, id }));
    const n = slotsOf.length, live = slotsOf.filter(k => k.id).length;
    const slots = n + Math.max(d.cons ?? 0, Math.ceil(helpers.length / 4));
    const cols = Math.min(COLS, slots);
    const rows = Math.ceil(slots / COLS);
    const w = cols * SLOT_W + 2;
    const h = rows * SLOT_H - 8;
    // the break-out room (temp departments, packed last by planLayout) starts on a row of its own
    if (d.temp && !inZone) { inZone = true; if (x > x0) { x = x0; y += (rowH || SLOT_H - 8) + 8; rowH = 0; } }
    if (clearCog && y === y0 && x < 200 + dx && x + w > 114 + dx) x = 200 + dx; // past the bank (wraps below if it no longer fits)
    // a block wraps past the hall's east edge, or when its last lectern would stand in the corridor (a 6-wide row never does)
    if (!full && x > x0 && (x + w > x1 + 1 || (compact && x + w - 6 > corridorX - 5))) { x = x0; y += (rowH || SLOT_H - 8) + 8; rowH = 0; } // rowH 0: the first block skipped the cogitator
    if (full || y + h > y1) { full = true; overflow += live; continue; }
    blocks.push({ name: d.name, color: d.color, x, y, w, h, ...(d.temp && { temp: true }) });
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
// state to pass back next tick. grace: { desk, dept, shrink } ms overrides. size: the scene's {w, h} (hallOf).
// Space: past capacity the hall goes compact, then grows bays (result `level`, `compact`, `bays`); it steps back
// one level at a time once the level below would still fit with one more department, for SHRINK_MS.
// The "+N in the stacks" overflow only remains past MAX_BAYS. lay: the layout function (layoutStrip in the desktop strip).
export function planLayout(prev, depts, now, grace = {}, size = SCENE, lay = layoutDepartments) {
  const deskG = grace.desk ?? DESK_GRACE_MS, deptG = grace.dept ?? DEPT_GRACE_MS, shrinkG = grace.shrink ?? SHRINK_MS;
  const live = new Map(depts.map(d => [d.name, d]));
  let seq = prev?.seq ?? 0;
  let plan = (prev?.plan ?? []).map(p => ({ ...p, desks: p.desks.map(k => ({ ...k })) }));
  for (const d of depts) if (!plan.some(p => p.name === d.name)) plan.push({ name: d.name, desks: [], cons: 0, emptySince: null });
  for (const p of plan) {
    const d = live.get(p.name), ids = d?.ids ?? [];
    p.color = d?.color ?? p.color;
    p.temp = d?.temp ?? p.temp ?? false;
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
  plan.sort((p, q) => p.temp - q.temp); // stable: arrival order, the break-out room's departments last
  let level = prev?.level ?? 0, shrinkSince = prev?.shrinkSince ?? null;
  let L = lay(plan, { ...levelOpt(level), size });
  if (L.overflow) { // capacity forces it: drop the waiting empties now
    plan = plan.filter(p => p.emptySince == null);
    for (const p of plan) { p.desks = p.desks.filter(k => k.id); p.cons = Math.ceil(p.helpers.length / 4); p.consFreeSince = null; }
    L = lay(plan, { ...levelOpt(level), size });
  }
  if (L.overflow) shrinkSince = null;
  while (L.overflow && level < MAX_LEVEL) L = lay(plan, { ...levelOpt(++level), size }); // still full: compact, then grow
  if (level > 0 && !L.overflow) { // hysteresis: the level below must still hold a newcomer's department, for a while
    const roomy = !lay(plan.concat({ name: '+', desks: [{ key: '+', id: '+' }] }), { ...levelOpt(level - 1), size }).overflow;
    if (!roomy) shrinkSince = null;
    else if (now - (shrinkSince ??= now) >= shrinkG) { L = lay(plan, { ...levelOpt(--level), size }); shrinkSince = null; }
  }
  return { ...L, plan, seq, level, shrinkSince, ...levelOpt(level) };
}

// The break-out room: the rectangle fencing the temp blocks (packed last, from a fresh row) and its gates, null without
// any. West and top 2 px inside the blocks (the lane above stays outside), east 2 px out but west of the corridor,
// bottom 6 px under the last row so its lane is inside. A gate where each lane inside it meets the east (corridor) side.
export function breakoutOf(blocks, H) {
  const tb = blocks.filter(b => b.temp);
  if (!tb.length || H.strip) return null;
  const x = Math.min(...tb.map(b => b.x)) - 2, y = Math.min(...tb.map(b => b.y)) + 2;
  const x1 = Math.min(Math.max(...tb.map(b => b.x + b.w)) + 2, H.corridorX - 1), y1 = Math.max(...tb.map(b => b.y + b.h)) + 6;
  return { x, y, w: x1 - x, h: y1 - y, gates: H.lanes.filter(l => l > y && l < y1).map(l => ({ x: x1, y: l })) };
}

// Rooms east of the scriptorium's east wall: the refectorium above the sanctum. Each opens onto the scriptorium.
export const roomOf = (p, H = hallOf(0)) => (p.x <= H.sw ? 'hall' : p.y < H.split - 6 ? 'ref' : 'sanct');

// A block is solid row by row: the 8 px gap under each of its slot rows holds a lane and is open. A `solid` one (the
// break-out room, to anyone outside it) is solid all through.
const crosses = (x, y0, y1, blocks) => blocks.some(b => x > b.x && x < b.x + b.w && (b.solid ? y0 < b.y + b.h && y1 > b.y :
  Array.from({ length: (b.h + 8) / SLOT_H }, (_, k) => b.y + k * SLOT_H).some(ry => y0 < ry + SLOT_H - 8 && y1 > ry)));
// Lanes a hall point can step onto straight up or down without walking through a department block.
// Going down, the stretch to the first lane below is always clear (it's the point's own slot gap).
// Z (breakoutOf): a point inside the break-out room takes only its own lane in there (it leaves along it, through
// that lane's gate); a point outside sees the room as solid, so never steps onto one of its lanes.
function lanesOf(p, blocks, LANES, corridorX, Z) {
  if (p.x === corridorX) return [p.y];
  const inside = Z && p.x > Z.x && p.x < Z.x + Z.w && p.y > Z.y && p.y < Z.y + Z.h;
  const B = Z && !inside ? blocks.concat({ ...Z, solid: true }) : blocks;
  const first = LANES.find(y => y >= p.y);
  const out = LANES.filter(y => (y < p.y ? !crosses(p.x, y, p.y, B) : !crosses(p.x, first, y, B)));
  return inside ? out.filter(y => y > Z.y && y < Z.y + Z.h).slice(0, 1) : out;
}
const lengthOf = pts => pts.reduce((s, p, i) => s + (i ? Math.abs(p.x - pts[i - 1].x) + Math.abs(p.y - pts[i - 1].y) : 0), 0);

// Axis-aligned path from a to b (both feet), the shortest over the lane choices. blocks: layoutDepartments().blocks.
// A point may carry `via`: the step taken between it and the lanes (see console seats). H: hallOf().
export function route(a, b, blocks = [], H = hallOf(0)) {
  const LANES = H.lanes, aisle = LANES.at(-1), CORRIDOR_X = H.corridorX;
  const DOORWAY = { sanct: [H.doorOut, H.doorIn], ref: [H.refOut, H.refIn] };
  const ra = roomOf(a, H), rb = roomOf(b, H);
  if (ra === rb && ra !== 'hall') return [{ x: b.x, y: b.y }];
  const head = ra === 'hall' ? [a].concat(a.via ?? []) : [a, DOORWAY[ra][1], DOORWAY[ra][0]];
  const tail = rb === 'hall' ? [].concat(b.via ?? [], b) : [DOORWAY[rb][0], DOORWAY[rb][1], b];
  const p = head.at(-1), q = tail[0];
  const Z = breakoutOf(blocks, H);
  let best = null;
  for (const la of lanesOf(p, blocks, LANES, CORRIDOR_X, Z)) for (const lb of lanesOf(q, blocks, LANES, CORRIDOR_X, Z)) {
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

// auto: the Auto phase when the sun decides it (sun.js sunPhase); fixed hours otherwise.
export function lightLevel(mode, hour, auto = phaseOf(hour)) {
  const phase = mode === 'full' ? 'day' : mode === 'candles' ? 'night' : auto;
  return {
    phase,
    dark: { day: 0.18, dusk: 0.5, night: 0.78 }[phase],
    glow: { day: 0.45, dusk: 0.8, night: 1 }[phase],
    beams: phase === 'day',
  };
}
