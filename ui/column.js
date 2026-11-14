// The desktop column's geometry, logical px (the vertical counterpart of strip.js): a narrow bar the full height of the
// work area on the left or right screen edge, floors stacked top to bottom, one lift shaft on the inner side
// (lift.js runs the car). columnOf() returns the fields the cast and app.js read from hallOf() (layout.js), so the
// same Cast walks in it. Canonical layout: the screen edge at x = 0, the shaft at COL_W - SHAFT_W..COL_W; the right
// side mirrors every x (x' = COL_W - x, a rect's left COL_W - x - w), the sprites never mirrored.
// Floors, each a key with its foot y: 'sanctum' (the Magos and the petition line) at TOP + FH, one 'd:<name>' per
// department in arrival order (department k at TOP + (k + 2) FH), 'cog' at h - FH, 'ref' (the refectory, the entry
// floor) at h. A new department appends below the last; a removed one lifts the floors below it by FH.
export const COL_W = 128, FH = 44, TOP = 14, SHAFT_W = 28, SLAB_H = 6, MIN_FLOORS = 4;
const LEC_W = 22, CON_W = 14, SPAN = 96, MAX_LEC = 6, MAX_CON = 9;
const LANDING_X = COL_W - SHAFT_W, CAR_X = COL_W - SHAFT_W / 2; // the shaft door, the car's centre (canonical)
const BENCH_X = 38, BENCH_W = 58, COG_X = 8;

export const maxDeptFloors = h => Math.floor((h - TOP) / FH) - 3;
// Items w wide from x 4, at most max apart, the last one clear of the lift's first line spot (LANDING_X - 4).
const pitch = (n, max, w) => (n > 1 ? Math.min(max, Math.floor((LANDING_X - 4 - 4 - w) / (n - 1))) : max);
// Entering the column: the cast settles once the window is the column (its height the work area's at the column's
// scale, cssH: stripwin.js colHeight), not on the layout made while the window is still the hall's.
export const columnPlaced = (h, cssH, scale) => h === Math.floor(cssH / scale);
// The column's scale (CSS px per logical px): the Strip size's, dropped L -> M -> S until MIN_FLOORS department
// floors fit the work area's height (cssH); the one writer viewport.js (fit) and stripwin.js (the window's width) read.
export function columnScale(cssH, want) {
  const all = [2.5, 2, 1.5].filter(s => s <= want);
  return all.find(s => maxDeptFloors(Math.floor(cssH / s)) >= MIN_FLOORS) ?? all.at(-1) ?? want;
}
const deptY = k => TOP + (k + 2) * FH;
// The floor key at foot y (a seat a few px above its floor line counts), or null between floors.
export const floorAt = (H, y) => {
  let best = null;
  for (const f of H.floors) if (Math.abs(f.y - y) <= FH / 2 && (!best || Math.abs(f.y - y) < Math.abs(best.y - y))) best = f;
  return best?.key ?? null;
};
// Same floor: straight there. Another floor: to the landing, the lift (the waypoint at the far landing carries
// lift: { from, to }, actors.js rides it), then on.
export function columnRoute(a, b, blocks, H) {
  if (a.x === b.x && a.y === b.y) return [];
  const from = floorAt(H, a.y), to = floorAt(H, b.y);
  if (!from || !to || from === to) return [{ x: b.x, y: b.y }];
  return [H.landing(from), { ...H.landing(to), lift: { from, to } }, { x: b.x, y: b.y }];
}

const cols = new Map();
// size: the scene's logical size (w is COL_W); floors: the departments' names on a floor, in order.
export function columnOf(size, floors = [], side = 'right') {
  const h = Math.round(size.h), id = `${h}|${side}|${floors.join('\n')}`;
  let H = cols.get(id);
  if (H) return H;
  if (cols.size > 32) cols.clear();
  const X = side === 'right' ? x => COL_W - x : x => x, L = side === 'right' ? (x, w) => COL_W - x - w : x => x;
  const at = (x, y) => ({ x: X(x), y });
  const list = [{ key: 'sanctum', y: TOP + FH }, ...floors.map((n, k) => ({ key: `d:${n}`, y: deptY(k) })), { key: 'cog', y: h - FH }, { key: 'ref', y: h }];
  const stops = new Map(list.map(f => [f.key, f.y])), S = TOP + FH, C = h - FH;
  const benches = [{ x: L(BENCH_X, BENCH_W), y: h }];
  const cog = { x: L(COG_X, 82), y: C };
  H = {
    strip: true, column: true, side, route: columnRoute, w: COL_W, h, baseH: h, floors: list, floorsKey: list.map(f => `${f.key}@${f.y}`).join(','), stops,
    bays: 0, dy: 0, rows: 1, sw: COL_W, rx: COL_W, ox: 0, dx: 0, split: h, sd: 0, sb: 0, hy: 0, // roomOf(): everything is 'hall'
    x0: 0, x1: COL_W, y0: S, y1: h, aisleY: h, corridorX: COL_W, lanes: [h], doors: [],
    landing: key => at(LANDING_X, stops.get(key)), lineSpot: (key, i) => at(LANDING_X - 4 - 10 * i, stops.get(key)),
    carX: X(CAR_X), shaftX: L(LANDING_X, SHAFT_W),
    entry: at(-10, h), magos: at(12, S), queue: [34, 50, 66, 82].map(x => at(x, S)),
    recaff: at(36, h), recaffAt: L(18, 16), benches, benchW: BENCH_W, refectory: [14, 32, 50].map(d => at(BENCH_X + d, h)),
    cog, cogSpots: [20, 41, 62].map(d => at(COG_X + d, C)),
  };
  cols.set(id, H);
  return H;
}

// One floor per department (in the given order) under the sanctum: its lecterns a front row, its consoles a back row
// 6 px higher, a mat under them. Past maxDeptFloors departments, and past MAX_LEC lecterns on a floor, scribes are
// overflow (hidden and counted). Same result shape as layoutStrip(), plus floors (the departments placed).
export function layoutColumn(depts, { size, side = 'right' } = {}) {
  const L = side === 'right' ? (x, w) => COL_W - x - w : x => x;
  const blocks = [], desks = [], seats = new Map(), consoles = [], consoleSeats = new Map(), floors = [];
  const max = maxDeptFloors(size.h);
  let overflow = 0;
  for (const d of depts) {
    const slots = d.desks ?? d.ids.map(id => ({ key: id, id }));
    if (floors.length >= max) { overflow += slots.filter(k => k.id).length; continue; }
    const fy = deptY(floors.length), shown = slots.slice(0, MAX_LEC), helpers = (d.helpers ?? []).filter(id => id != null).slice(0, MAX_CON);
    overflow += slots.slice(MAX_LEC).filter(k => k.id).length;
    floors.push(d.name);
    blocks.push({ name: d.name, color: d.color, x: L(2, SPAN), y: fy - 3, w: SPAN, h: 5, ...(d.temp && { temp: true }) });
    const p = pitch(shown.length, 24, LEC_W);
    shown.forEach((k, i) => {
      const desk = { ...k, dept: d.name, x: L(4 + i * p, LEC_W), y: fy - 30, compact: true };
      desks.push(desk);
      if (k.id) seats.set(k.id, { x: desk.x + 11, y: fy });
    });
    const cp = pitch(helpers.length, 16, CON_W);
    helpers.forEach((id, k) => {
      const con = { id, dept: d.name, x: L(4 + k * cp, CON_W), y: fy - 28 };
      consoles.push(con);
      consoleSeats.set(id, { x: con.x + 7, y: fy - 6 });
    });
  }
  return { blocks, desks, seats, consoles, consoleSeats, overflow, floors };
}
