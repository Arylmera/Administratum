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
export const SLOT_H = 64;
// The growing hall: each bay adds BAY_H of scriptorium floor (one slot row) above the bottom aisle; the aisle,
// the grand gate and the hall's queue slots move down with it. Sanctum and refectorium stay where they are.
export const BAY_H = SLOT_H;
export const MAX_BAYS = 6; // up to 6 more slot rows; past that, the plaque

// The scene's geometry for a size {w, h} (the window's) and a number of bays (below the window, panned to).
// dx: the scriptorium's centre (gate, cogitator bank) vs the minimum; ox: the right column; sd: the sanctum's
// top wall (the refectorium takes ~40 % of the column's floor); sb: the sanctum's floor items by its bottom wall;
// hy: the scriptorium's by its bottom wall. sd, sb and hy are moves from the measured hall (WALL_DY included).
// wing (layoutDepartments' `wing`: [{ id, color, empty, rows }] in rule order, [] for its geometry alone): the west wing
// of custom rooms (O10c), west of the scriptorium's own west wall; the hall is the one without it, every x moved by wx.
const halls = new Map(), NO_ROOMS = Object.freeze([]); // one empty list: a hall without a wing never looks re-roomed (Cast.sync)
export function hallOf(bays = 0, size = SCENE, wing = null) {
  if (wing) return wingHall(hallOf(bays, size), wing);
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
    key, wx: 0, rooms: NO_ROOMS, bays, dy, w, h, baseH, sw, rx, ox, dx, split, sd, sb, hy, rows,
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

// The west wing (O10c): WING_W of rooms (the east column's width), then the scriptorium's west wall (8 px, as its east
// wall): the scriptorium starts at wx. Its rooms stand on the scriptorium's slot-row grid (rows at y0 + 64 k), 2 desks
// a row (4 lecterns compact) west of the room's corridor, one under another with no row lost: the first under the back
// wall, each further one under a WING_DIV dark divider (the refectorium/sanctum's) packed into the floor above its
// first desk row (from 2 px under the lane above to the desks' top). The rooms share the wing's full height: each its
// desk rows (wing[].rows), the scriptorium's rows left over shared evenly (the last takes the remainder and runs down
// to the hall's bottom, bays included; wing[].share, the layout's, caps the share); hall.rooms[].rows counts both. A
// room's door sits in the west wall on the scriptorium lane nearest the room's vertical middle (one of the room's own
// lanes, every one a scriptorium lane), or on wing[].door, the layout's choice clear of the break-out room's fence; its
// hall side (wx + 1) and room side (the room's corridor) take only that lane (route), the room's corridor joining it to
// the desk lanes. Geometry only (id, rows): a room's colour and whether it is empty are the layout's (wingZones), so
// they never rebuild the hall.
export const WING_W = 138, WING_X = WING_W + 8, WING_CX = WING_W - 10, WING_DIV = 10;
const wings = new Map();
const movedX = (p, d) => ({ ...p, x: p.x + d });
// A room's door lane: of its lanes that `ok` allows (all if none), the one whose door (its frame y - 18 .. y + 2, so
// its centre y - 8) is nearest the room's middle; a tie: the lower.
const doorLane = (lanes, mid, ok = () => true) => (lanes.some(ok) ? lanes.filter(ok) : lanes)
  .reduce((p, q) => (Math.abs(q - 8 - mid) <= Math.abs(p - 8 - mid) ? q : p));
function wingHall(B, wing) {
  const key = `${B.key}|${wing.map(r => `${r.id}:${Math.max(1, r.rows ?? 1)}:${r.door ?? ''}:${r.share ?? ''}`).join(',')}`;
  let H = wings.get(key);
  if (H) return H;
  if (wings.size > 64) wings.clear();
  const X = WING_X, m = p => movedX(p, X), rooms = [], n = wing.length;
  const need = wing.map(r => Math.max(1, r.rows ?? 1)), spare = Math.max(0, B.rows - need.reduce((s, q) => s + q, 0));
  const share = Math.min(Math.floor(spare / n), ...wing.map(r => r.share ?? Infinity)); // the layout's cap (layoutDepartments)
  let k = 0;
  for (const [j, r] of wing.entries()) {
    const last = j === n - 1, rows = need[j] + (last ? spare - share * (n - 1) : share), top = j ? B.y0 + SLOT_H * k - 2 : 0; // its top wall's top
    const y = j ? top + WING_DIV : WALL, y1 = last ? B.h : B.y0 + SLOT_H * (k + rows) - 2, under = i => B.y0 + 60 + SLOT_H * (k + i);
    const lanes = [...(j ? [] : [B.y0]), ...Array.from({ length: rows }, (_, i) => under(i))], mid = (y + y1) / 2;
    const door = lanes.includes(r.door) ? r.door : doorLane(lanes, mid); // the layout's choice (layoutDepartments), else by the middle
    rooms.push({ kind: 'room', id: r.id, x: 0, y, w: WING_W, h: y1 - y, top, k, rows, plaqueY: j ? top + 1 : WALL - 12,
      lanes, corridorX: WING_CX, doorIn: { x: WING_CX, y: door }, doorOut: { x: X + 1, y: door } });
    k += rows;
  }
  H = { ...B, base: B, key, wx: X, rooms, w: B.w + X, sw: B.sw + X, rx: B.rx + X, ox: B.ox + X, dx: B.dx + X, x0: B.x0 + X, x1: B.x1 + X,
    corridorX: B.corridorX + X, entry: m(B.entry), doorOut: m(B.doorOut), doorIn: m(B.doorIn), refOut: m(B.refOut), refIn: m(B.refIn),
    recaff: m(B.recaff), refectory: B.refectory.map(m), cogSpots: B.cogSpots.map(m), queue: B.queue.map(m) };
  wings.set(key, H);
  return H;
}
// The west wing's rooms as drawn this frame: hallOf().rooms with each one's rule colour and whether it is empty, from
// the layout's blocks (a room's departments, or its placeholder: zoneSequence).
export const wingZones = (H, blocks) => (H.rooms ?? []).map(R => {
  const mine = blocks.filter(b => b.room === R.id);
  return { ...R, color: mine[0]?.roomColor, empty: !mine.some(b => !b.empty) };
});
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
// The break-out room's departments (d.temp) start on a fresh slot row and the row after them is fresh too, so its
// bounding box (zonesOf) never takes in a neighbour.
// wing (planLayout: the custom rooms in force, [{ id, color }] in rule order, or null): a custom room's departments
// (d.room) and an empty room's placeholder (d.empty, zoneSequence) go to its room in the west wing (hallOf), one
// sub-block each; the result's `wing` lists the rooms drawn, [{ id, color, empty, rows }] (hallOf's wing), null without.
export function layoutDepartments(depts, { compact = false, bays = 0, size = SCENE, clearCog = false, wing = null } = {}) {
  const G = compact ? GRID.compact : GRID.normal, SLOT_W = G.w, CONSOLE_CELL = G.cell;
  const { x0, x1, y0, y1, corridorX, dx } = hallOf(bays, size, wing && []);
  const blocks = [];
  const desks = [];
  const seats = new Map();
  const consoles = [];
  const consoleSeats = new Map();
  const geom = (d, COLS) => { // an empty room's placeholder: one slot, no desk
    const helpers = d.helpers ?? [], slotsOf = d.desks ?? d.ids.map(id => ({ key: id, id })), n = slotsOf.length;
    const slots = d.empty ? 1 : n + Math.max(d.cons ?? 0, Math.ceil(helpers.length / 4));
    return { helpers, slotsOf, n, w: Math.min(COLS, slots) * SLOT_W + 2, h: Math.ceil(slots / COLS) * SLOT_H - 8 };
  };
  // A department's block at (x, y): its desks and consoles, COLS slots a row.
  const place = (d, { helpers, slotsOf, n, w, h }, x, y, COLS) => {
    blocks.push({ name: d.name, color: d.color, x, y, w, h, ...(d.temp && { temp: true }), ...(d.room && !d.temp && { room: d.room, roomColor: d.roomColor }), ...(d.empty && { empty: true }) });
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
  };
  let overflow = 0;
  // The west wing: room by room in rule order, each from the grid row after the last one's (hallOf), its
  // departments wrapping west of the room's corridor. A room with nothing in the sequence (its placeholder dropped past
  // MAX_BAYS, planLayout) is not drawn.
  const known = new Set((wing ?? []).map(r => r.id)), inWing = d => !d.temp && known.has(d.room), rooms = [];
  // the break-out room starts below this row's lane, as before the rooms took the wing's height: the lane under the
  // first desk row of the last room drawn, the rooms packed on their desk rows alone (-1: one room, its door then y0)
  let doorRow = -1;
  const COLS_W = compact ? 4 : 2, at = []; // at: per room drawn, its blocks' places from its top
  if (wing) {
    const WX0 = 3, COLS = COLS_W;
    let k = 0, full = false;
    for (const r of wing) {
      const inside = depts.filter(d => inWing(d) && d.room === r.id), mine = [];
      if (!inside.length) continue;
      let x = WX0, y = y0 + SLOT_H * k, rowH = 0, bottom = 0;
      for (const d of inside) {
        const gm = geom(d, COLS), live = gm.slotsOf.filter(s => s.id).length;
        if (x > WX0 && (x + gm.w > WING_CX + 1 || (compact && x + gm.w - 6 > WING_CX - 5))) { x = WX0; y += (rowH || SLOT_H - 8) + 8; rowH = 0; }
        // an empty room that does not fit counts one, so the hall grows to keep its place (planLayout drops it past MAX_BAYS)
        if (full || y + gm.h > y1) { full = true; overflow += d.empty ? 1 : live; continue; }
        mine.push([d, gm, x, y - y0 - SLOT_H * k]);
        x += gm.w + 4; rowH = Math.max(rowH, gm.h); bottom = Math.max(bottom, y + gm.h);
      }
      if (!bottom) continue; // nothing of it fits (full): nor of any room after it, all counted in the overflow
      const rows = (bottom + 8 - (y0 + SLOT_H * k)) / SLOT_H;
      if (rooms.length) doorRow = k;
      rooms.push({ id: r.id, color: r.color, empty: inside.every(d => d.empty), rows });
      at.push(mine);
      k += rows;
    }
  }
  const hallDepts = depts.filter(d => !inWing(d) && !d.empty), COLS = G.cols;
  const all = hallDepts.map(d => geom(d, COLS));
  packHall(doorRow + 1);
  if (rooms.length) {
    // Each room's door: the lane nearest its middle that the break-out room's fence (zonesOf: the lanes strictly inside
    // it) does not take in, so a walk from a door along its lane never crosses the fence. The rooms share the wing's
    // height (hallOf); each one's desks packed from its own first grid row, ahead of the hall's in every list.
    // A room with every lane inside the fence (the spare rows took it down there): the spare share is capped so that
    // every room starts above the fence (the fence starts below the last room's first desk row: doorRow).
    const zb = blocks.filter(b => b.temp), fy0 = zb.length ? Math.min(...zb.map(b => b.y)) + 2 : 0, fy1 = zb.length ? Math.max(...zb.map(b => b.y + b.h)) + 6 : 0;
    const free = l => !(l > fy0 && l < fy1);
    if (hallOf(bays, size, rooms).rooms.some(R => !R.lanes.some(free))) {
      const cap = Math.floor(((fy0 - 2 - y0) / SLOT_H - 1 - doorRow) / (rooms.length - 1)); // rows between doorRow and the fence's first
      for (const r of rooms) r.share = cap;
    }
    hallOf(bays, size, rooms).rooms.forEach((R, j) => { rooms[j].door = doorLane(R.lanes, R.y + R.h / 2, free); });
    const n = { blocks: blocks.length, desks: desks.length, consoles: consoles.length }, s0 = [...seats], c0 = [...consoleSeats];
    seats.clear(); consoleSeats.clear();
    hallOf(bays, size, rooms).rooms.forEach((R, j) => { for (const [d, gm, x, dy] of at[j]) place(d, gm, x, y0 + SLOT_H * R.k + dy, COLS_W); });
    for (const [A, m] of [[blocks, n.blocks], [desks, n.desks], [consoles, n.consoles]]) A.unshift(...A.splice(m));
    for (const [M, old] of [[seats, s0], [consoleSeats, c0]]) for (const [key, v] of old) M.set(key, v);
  }
  return { blocks, desks, seats, consoles, consoleSeats, overflow, wing: wing ? rooms : null };

  function packHall(tempFrom) {
    let x = x0, y = y0, rowH = 0, full = false, prevKey = null;
    hallDepts.forEach((d, i) => {
      const { slotsOf, w, h } = all[i], live = slotsOf.filter(k => k.id).length, key = zoneKey(d);
      if (key !== prevKey && x > x0) { x = x0; y += (rowH || SLOT_H - 8) + 8; rowH = 0; } // a zone begins or ends: a fresh row
      // the break-out room starts at row tempFrom (doorRow above)
      if (key === 'temp' && key !== prevKey && y < y0 + SLOT_H * tempFrom) { x = x0; y = y0 + SLOT_H * tempFrom; rowH = 0; }
      // 39°: a zone never straddles the cogitator bank: east of it when the whole zone fits in the first row, else from row 1
      if (clearCog && key != null && key !== prevKey && y === y0) {
        let zw = -4;
        for (let j = i; j < hallDepts.length && zoneKey(hallDepts[j]) === key; j++) zw += all[j].w + 4;
        const east = 200 + dx;
        if (east + zw <= x1 + 1 && !(compact && east + zw - 6 > corridorX - 5)) x = Math.max(x, east);
        else { x = x0; y += SLOT_H; rowH = 0; }
      }
      prevKey = key;
      if (clearCog && y === y0 && x < 200 + dx && x + w > 114 + dx) x = 200 + dx; // past the bank (wraps below if it no longer fits)
      // a block wraps past the hall's east edge, or when its last lectern would stand in the corridor (a 6-wide row never does)
      if (!full && x > x0 && (x + w > x1 + 1 || (compact && x + w - 6 > corridorX - 5))) { x = x0; y += (rowH || SLOT_H - 8) + 8; rowH = 0; } // rowH 0: the first block skipped the cogitator
      if (full || y + h > y1) { full = true; overflow += live; return; }
      place(d, all[i], x, y, COLS);
      x += w + 4;
      rowH = Math.max(rowH, h);
    });
  }
}

// A department's (or a block's) zone in the scriptorium: 'temp' (the break-out room) or null (the open hall).
const zoneKey = d => (d.temp ? 'temp' : null);

// The packing order: per custom room in rule order (rooms.js rooms.list) its departments (d.room, by arrival), or one
// placeholder for an empty room (it keeps the room's place), then the departments in no known room, then the break-out
// room's (temp). A room member carries the rule's colour (roomColor); a stale room id (rule deleted) counts as none.
export function zoneSequence(depts, rooms = []) {
  const known = new Set(rooms.map(r => r.id)), roomOf = d => (!d.temp && known.has(d.room) ? d.room : null);
  const plain = d => (d.room ? { ...d, room: null } : d);
  return rooms.flatMap(r => {
    const inside = depts.filter(d => roomOf(d) === r.id);
    return inside.length ? inside.map(d => ({ ...d, room: r.id, roomColor: r.color }))
      : [{ name: `room:${r.id}`, room: r.id, roomColor: r.color, empty: true, ids: [], desks: [] }];
  }).concat(depts.filter(d => !d.temp && !roomOf(d)).map(plain), depts.filter(d => d.temp).map(plain));
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
// once the level below would still fit with one more department for SHRINK_MS, straight down to the smallest such level.
// The "+N in the stacks" overflow only remains past MAX_BAYS. lay: the layout function (layoutStrip in the desktop strip).
// rooms: the custom rooms in force (rooms.js rooms.list; d.room their id): lay() gets zoneSequence(plan, rooms), never the plan.
export function planLayout(prev, depts, now, grace = {}, size = SCENE, lay = layoutDepartments, rooms = []) {
  const zoned = list => zoneSequence(list, rooms), wing = rooms.length ? rooms : null; // the west wing while a rule exists
  const deskG = grace.desk ?? DESK_GRACE_MS, deptG = grace.dept ?? DEPT_GRACE_MS, shrinkG = grace.shrink ?? SHRINK_MS;
  const live = new Map(depts.map(d => [d.name, d]));
  let seq = prev?.seq ?? 0;
  let plan = (prev?.plan ?? []).map(p => ({ ...p, desks: p.desks.map(k => ({ ...k })) }));
  for (const d of depts) if (!plan.some(p => p.name === d.name)) plan.push({ name: d.name, desks: [], cons: 0, emptySince: null });
  for (const p of plan) {
    const d = live.get(p.name), ids = d?.ids ?? [];
    p.color = d?.color ?? p.color;
    p.temp = d?.temp ?? p.temp ?? false;
    p.room = d ? d.room ?? null : p.room ?? null; // a waiting block stays in its room
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
  // A hall lay (lay.hall: not the strip's) with no department in the open hall (all in wing rooms): the scriptorium narrows by the wing, so the wing fits the window
  if (wing && lay.hall && zoned(plan).every(d => d.room)) size = { ...size, w: Math.max(SCENE.w, size.w - WING_X) };
  let L = lay(zoned(plan), { ...levelOpt(level), size, wing });
  if (L.overflow) { // capacity forces it: drop the waiting empties now
    plan = plan.filter(p => p.emptySince == null);
    for (const p of plan) { p.desks = p.desks.filter(k => k.id); p.cons = Math.ceil(p.helpers.length / 4); p.consFreeSince = null; }
    L = lay(zoned(plan), { ...levelOpt(level), size, wing });
  }
  if (L.overflow) shrinkSince = null;
  while (L.overflow && level < MAX_LEVEL) L = lay(zoned(plan), { ...levelOpt(++level), size, wing }); // still full: compact, then grow
  // past MAX_BAYS an empty room's placeholder is not drawn: it never takes a live department's place
  if (L.overflow) L = lay(zoned(plan).filter(d => !d.empty), { ...levelOpt(level), size, wing });
  if (level > 0 && !L.overflow) { // hysteresis: the level below must still hold a newcomer's department, for a while
    // the probe lands where a real newcomer would: after the rooms and the open hall, before any temp (break-out room)
    // block, not after it
    const probe = zoned(plan.concat({ name: '+', desks: [{ key: '+', id: '+' }] }));
    const roomy = l => !lay(probe, { ...levelOpt(l), size, wing }).overflow;
    if (!roomy(level - 1)) shrinkSince = null;
    else if (now - (shrinkSince ??= now) >= shrinkG) { // straight down to the smallest roomy level, not a minute per bay
      do level--; while (level > 0 && roomy(level - 1));
      L = lay(zoned(plan), { ...levelOpt(level), size, wing });
      shrinkSince = null;
    }
  }
  return { ...L, plan, seq, level, shrinkSince, size, ...levelOpt(level) }; // size: the scene's, for hallOf
}

// The break-out room's art contract (ui/art/breakout.*, ui/art/<theme>/breakout.*), art px: the floor tile; the rail,
// front-facing, tiled along the top and bottom edges (every rail face in 39°); the side, the east and west edges seen
// from above; the post (corners, beside each gate); a closed gate in the east side seen from above and its leaf swung
// open; the front-facing gate, closed and open (the strip's, and the 39° closed leaf).
export const BREAKOUT_SIZES = {
  BREAKOUT_FLOOR: [16, 16], BREAKOUT_RAIL: [16, 10], BREAKOUT_SIDE: [4, 16], BREAKOUT_POST: [6, 14],
  BREAKOUT_GATE: [4, 16], BREAKOUT_GATE_OPEN: [16, 10], BREAKOUT_GATE_FRONT: [16, 20], BREAKOUT_GATE_FRONT_OPEN: [16, 20],
};
// A custom room's art contract (ui/art/enclave.*, ui/art/<world>/enclave.*): the same frames and sizes, ENCLAVE_ for
// BREAKOUT_; the sash slot y (ui/art/key.gpl) is the dyed part, drawn in the rule's colour (rooms.js tintOf).
export const ENCLAVE_SIZES = Object.fromEntries(Object.entries(BREAKOUT_SIZES).map(([n, s]) => [n.replace('BREAKOUT_', 'ENCLAVE_'), s]));
// A Suzerain's sheet (tools/suzerain_art.mjs, scene.js drawPlinths/drawLinks), art px: its dais under a desk or a
// lectern (logical 40x27 / 30x27, from 4 px west and 6 px south of the desk), the link tiled across and down, its end.
export const SUZERAIN_SIZES = { DAIS: [80, 54], DAIS_C: [60, 54], LINK_H: [8, 6], LINK_V: [6, 8], LINK_END: [10, 8] };
// A Watchman frame (tools/watch_art.mjs, ui/art/<world>/watch.*), art px: w, h.
export const WATCH_SIZE = [32, 36];

// The fenced zone in the scriptorium: the break-out room (the temp blocks), from a fresh row (layoutDepartments). The
// rectangle fencing its blocks: west and top 2 px inside them (the lane above stays outside), east 2 px out but west of
// the corridor, bottom 6 px under the last row so its lane is inside; a gate where each lane inside it meets the east
// (corridor) side. kind 'temp', id 'temp' (the custom rooms are the west wing's: hallOf().rooms). None in the strip
// (strip.js zonesOfStrip) or the column.
export function zonesOf(blocks, H) {
  if (H.strip || H.column) return [];
  const zb = blocks.filter(b => b.temp);
  if (!zb.length) return [];
  const x = Math.min(...zb.map(b => b.x)) - 2, y = Math.min(...zb.map(b => b.y)) + 2;
  const x1 = Math.min(Math.max(...zb.map(b => b.x + b.w)) + 2, H.corridorX - 1), y1 = Math.max(...zb.map(b => b.y + b.h)) + 6;
  return [{ kind: 'temp', id: 'temp', color: undefined, empty: false, x, y, w: x1 - x, h: y1 - y, gates: H.lanes.filter(l => l > y && l < y1).map(l => ({ x: x1, y: l })) }];
}

// Rooms east of the scriptorium's east wall: the refectorium above the sanctum. Each opens onto the scriptorium.
// West of its west wall (hallOf().rooms): the west wing's rooms, 'w:<id>', by their band (a wall belongs to the room under it).
export function roomOf(p, H = hallOf(0)) {
  if (H.wx && p.x < H.wx - 4) { const R = H.rooms.find(q => p.y < q.y + q.h) ?? H.rooms.at(-1); if (R) return `w:${R.id}`; }
  return p.x <= H.sw ? 'hall' : p.y < H.split - 6 ? 'ref' : 'sanct';
}

// A block is solid row by row: the 8 px gap under each of its slot rows holds a lane and is open. A `solid` one (a
// zone, to anyone outside it) is solid all through.
const crosses = (x, y0, y1, blocks) => blocks.some(b => x > b.x && x < b.x + b.w && (b.solid ? y0 < b.y + b.h && y1 > b.y :
  Array.from({ length: (b.h + 8) / SLOT_H }, (_, k) => b.y + k * SLOT_H).some(ry => y0 < ry + SLOT_H - 8 && y1 > ry)));
// Lanes a hall point can step onto straight up or down without walking through a department block.
// Going down, the stretch to the first lane below is always clear (it's the point's own slot gap).
// Zs (zonesOf): a point inside a zone takes only its own lane in there (it leaves along it, through that lane's gate);
// every other zone is solid to it, so it never steps onto one of their lanes.
// fixed: the x of points that take only their own lane, as the corridor's (a wing room's door, hall side).
function lanesOf(p, blocks, LANES, corridorX, Zs = [], fixed = []) {
  if (p.x === corridorX || fixed.includes(p.x)) return [p.y];
  const mine = Zs.find(Z => p.x > Z.x && p.x < Z.x + Z.w && p.y > Z.y && p.y < Z.y + Z.h);
  const B = blocks.concat(Zs.filter(Z => Z !== mine).map(Z => ({ ...Z, solid: true })));
  const first = LANES.find(y => y >= p.y);
  const out = LANES.filter(y => (y < p.y ? !crosses(p.x, y, p.y, B) : !crosses(p.x, first, y, B)));
  return mine ? out.filter(y => y > mine.y && y < mine.y + mine.h).slice(0, 1) : out;
}
const lengthOf = pts => pts.reduce((s, p, i) => s + (i ? Math.abs(p.x - pts[i - 1].x) + Math.abs(p.y - pts[i - 1].y) : 0), 0);

// Axis-aligned path from a to b (both feet), the shortest over the lane choices. blocks: layoutDepartments().blocks.
// A point may carry `via`: the step taken between it and the lanes (see console seats). H: hallOf().
// The walk between p and q over LANES and a vertical corridor at CX, the shortest over the lane choices: the points
// between them.
function walk(p, q, blocks, LANES, CX, Zs, fixed) {
  let best = null;
  for (const la of lanesOf(p, blocks, LANES, CX, Zs, fixed)) for (const lb of lanesOf(q, blocks, LANES, CX, Zs, fixed)) {
    const mid = la === lb ? [{ x: p.x, y: la }, { x: q.x, y: la }] : [{ x: p.x, y: la }, { x: CX, y: la }, { x: CX, y: lb }, { x: q.x, y: lb }];
    if (!best || lengthOf([p, ...mid, q]) < lengthOf([p, ...best, q])) best = mid;
  }
  return best ?? [{ x: p.x, y: LANES.at(-1) }, { x: q.x, y: LANES.at(-1) }]; // ponytail: boxed in on every side, old aisle walk
}
export function route(a, b, blocks = [], H = hallOf(0)) {
  const DOORWAY = { sanct: [H.doorOut, H.doorIn], ref: [H.refOut, H.refIn] };
  const W = H.rooms ?? [], ra = roomOf(a, H), rb = roomOf(b, H), wingOf = r => W.find(R => `w:${R.id}` === r);
  // inside a west wing room: the hall's walk on the room's own lanes and corridor
  const inside = (p, q, R) => walk(p, q, blocks, R.lanes, R.corridorX, [], []);
  // a door's hall side takes only its lane (layoutDepartments keeps every door's lane out of the break-out room's fence)
  const fixed = W.length ? [H.wx + 1] : [];
  const clean = pts => pts.slice(1).filter((pt, i, arr) => pt.x !== (arr[i - 1] ?? a).x || pt.y !== (arr[i - 1] ?? a).y).map(pt => ({ x: pt.x, y: pt.y }));
  const near = pt => [pt].concat(pt.via ?? []); // a point and the step it takes to the lanes
  // In the west wall (wx - 8 .. wx + 1: a scribe crossing a door when its route is recomputed): it keeps to its door's
  // lane, out to the hall side or in to the room side, never along the wall.
  const doorOf = pt => {
    if (!W.length || pt.x < H.wx - 8 || pt.x > H.wx + 1) return null;
    const D = W.reduce((p, q) => (Math.abs(q.doorOut.y - pt.y) < Math.abs(p.doorOut.y - pt.y) ? q : p));
    return pt.x === D.doorOut.x && pt.y === D.doorOut.y ? null : D; // its hall side: the hall's own (lanesOf fixed)
  };
  const Da = doorOf(a), Db = doorOf(b);
  if (Da || Db) {
    if (Da && Db) return Da === Db ? [{ x: b.x, y: b.y }] : clean([a, Da.doorOut].concat(route(Da.doorOut, b, blocks, H)));
    const D = Da ?? Db, other = Da ? b : a, side = roomOf(other, H) === `w:${D.id}` ? D.doorIn : D.doorOut;
    const leg = [side].concat(route(side, other, blocks, H)); // from the door's side to the other end
    return clean(Da ? [a, ...leg] : [b, ...leg].reverse()); // b in the wall: the same walk, backwards
  }
  if (ra === rb && ra !== 'hall') {
    const R = wingOf(ra);
    if (!R) return [{ x: b.x, y: b.y }]; // the refectorium, the sanctum: open floors
    const p = near(a), q = near(b).reverse();
    return clean(p.concat(inside(p.at(-1), q[0], R), q));
  }
  // from a point to the hall: its own step in the hall; through its room's door from anywhere else
  const out = (pt, r) => {
    const R = wingOf(r);
    if (r === 'hall') return near(pt);
    if (!R) return [pt, DOORWAY[r][1], DOORWAY[r][0]];
    const p = near(pt);
    return p.concat(inside(p.at(-1), R.doorIn, R), R.doorIn, R.doorOut);
  };
  const head = out(a, ra), tail = out(b, rb).reverse();
  return clean(head.concat(walk(head.at(-1), tail[0], blocks, H.lanes, H.corridorX, zonesOf(blocks, H), fixed), tail));
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
layoutDepartments.hall = true; // planLayout may narrow its scene (an empty open hall beside the west wing)
