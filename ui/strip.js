// The desktop strip's geometry, logical px: one floor line along a thin bar on the taskbar. stripOf() returns the
// fields the cast and app.js read from hallOf() (layout.js), so the same Cast walks in either. Left to right: the
// gate (off-screen left), the departments' lecterns and consoles, the cogitator, the recaff and bench, the petition
// line and the Magos at the right end (nearest the clock).
export const STRIP_H = 56; // lectern (30) + the scribe's label above it
export const FLOOR = STRIP_H - 3; // feet
const GATE_W = 24, LEC_W = 32, CON_W = 20, GAP = 12;
const RIGHT_W = 276; // cogitator (82 wide) to Magos

export const stripRoute = (a, b) => (a.x === b.x && a.y === b.y ? [] : [{ x: b.x, y: b.y }]); // every point is on the floor

const strips = new Map();
export function stripOf(w) {
  w = Math.round(w);
  let S = strips.get(w);
  if (S) return S;
  if (strips.size > 16) strips.clear();
  const at = x => ({ x, y: FLOOR });
  const magos = at(w - 16), queue = Array.from({ length: 6 }, (_, i) => at(w - 40 - 14 * i));
  const refectory = [w - 150, w - 138, w - 126].map(at), recaff = at(w - 166);
  const cogSpots = [w - 250, w - 229, w - 208].map(at); // in front of the cogitator bank
  S = {
    strip: true, route: stripRoute, w, h: STRIP_H, baseH: STRIP_H, bays: 0, dy: 0, rows: 1,
    sw: w, rx: w, ox: 0, dx: 0, split: STRIP_H, sd: 0, sb: 0, hy: 0, // roomOf(): everything is 'hall'
    x0: GATE_W, x1: w - RIGHT_W, y0: FLOOR, y1: FLOOR, aisleY: FLOOR, corridorX: w, lanes: [FLOOR],
    entry: at(-10), magos, queue, refectory, recaff, cogSpots,
    cog: { x: w - 270, y: FLOOR }, bench: { x: w - 161, y: FLOOR }, // props' left end on the floor (scene.js drawStripProps)
  };
  strips.set(w, S);
  return S;
}

// One row: per department its lecterns (desk slots, held empty by planLayout) then its consoles, GAP between
// departments, a mat under each. Same result shape as layoutDepartments(); compact/bays are ignored.
export function layoutStrip(depts, { size } = {}) {
  const { x0, x1 } = stripOf(size.w);
  const blocks = [], desks = [], seats = new Map(), consoles = [], consoleSeats = new Map();
  let x = x0, overflow = 0, full = false;
  for (const d of depts) {
    const helpers = d.helpers ?? [], slotsOf = d.desks ?? d.ids.map(id => ({ key: id, id }));
    const ncons = Math.max(d.cons ?? 0, helpers.length);
    const w = slotsOf.length * LEC_W + ncons * CON_W;
    if (full || x + w > x1 + 1) { full = true; overflow += slotsOf.filter(k => k.id).length; continue; }
    blocks.push({ name: d.name, color: d.color, x, y: FLOOR - 3, w, h: 5 });
    slotsOf.forEach((k, i) => {
      const desk = { ...k, dept: d.name, x: x + i * LEC_W + 2, y: FLOOR - 30, compact: true };
      desks.push(desk);
      if (k.id) seats.set(k.id, { x: desk.x + 11, y: FLOOR });
    });
    helpers.forEach((id, k) => {
      if (id == null) return;
      const con = { id, dept: d.name, x: x + slotsOf.length * LEC_W + k * CON_W + 3, y: FLOOR - 22 };
      consoles.push(con);
      consoleSeats.set(id, { x: con.x + 7, y: FLOOR });
    });
    x += w + GAP;
  }
  return { blocks, desks, seats, consoles, consoleSeats, overflow };
}
