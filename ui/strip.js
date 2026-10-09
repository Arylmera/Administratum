// The desktop strip's geometry, logical px: one floor line along a thin bar on the taskbar. stripOf() returns the
// fields the cast and app.js read from hallOf() (layout.js), so the same Cast walks in either. Left to right: the
// entry (off-screen left) and the gate, the recaff and bench right by it, a door, the departments' lecterns and
// consoles, a door, the cogitator, a door, the petition line and the Magos, MARGIN_R short of the right end (nearest
// the clock). Each room sits next to whoever uses it most, so the walks stay short: a dozing scribe goes to the
// bench by the gate it came in by, a shell command and a petition both lie east of the desks.
export const STRIP_H = 56; // lectern (30) + the scribe's label above it
export const FLOOR = STRIP_H - 3; // feet
// Spread out, so a department's plaque (app.js, also over the GAP after it) has room for its name.
const LEC_W = 44, CON_W = 24;
export const GAP = 24;
export const MARGIN_R = 32; // the right group (the Magos' throne) stops this far from the right edge
// Doors (scene.js drawStripProps: the hall's room-doors frames, 10 wide, and its GATE, 32 wide). The gate starts right
// of the handle (index.html #strip-handle, 6..18); a door clears what stands by it by 4, any spot by 12 (scene.js
// near), so nobody standing still holds it open.
const GATE_X = 20, GATE_W = 32, DOOR_W = 10;
const REF_W = 83, COG_W = 100; // recaff left edge to the far side of the door past the 46 px bench; cogitator door to the next

export const stripRoute = (a, b) => (a.x === b.x && a.y === b.y ? [] : [{ x: b.x, y: b.y }]); // every point is on the floor

const strips = new Map();
export function stripOf(w) {
  w = Math.round(w);
  let S = strips.get(w);
  if (S) return S;
  if (strips.size > 16) strips.clear();
  const at = x => ({ x, y: FLOOR });
  const R = w - MARGIN_R, magos = at(R - 10), queue = Array.from({ length: 6 }, (_, i) => at(R - 34 - 14 * i));
  const door = (x, kind, dw = DOOR_W) => ({ x, w: dw, kind });
  const dSan = door(R - 104 - 12 - DOOR_W, 'sanctum'); // 12 clear of the last petitioner; the sanctum zone never moves
  // the refectory just inside the gate: the recaff (drawn 18 px left of its spot), the bench, a door to the hall
  const rx = GATE_X + GATE_W + 4, recaff = at(rx + 18), bench = { x: rx + 23, y: FLOOR }, refectory = [11, 23, 35].map(d => at(bench.x + d));
  const dRef = door(rx + REF_W - DOOR_W, 'sanctum');
  // the cogitator just before the sanctum: its bank between its door and the sanctum's
  const dCog = door(dSan.x - COG_W, 'sanctum');
  const cog = { x: dCog.x + 4 + DOOR_W, y: FLOOR }, cogSpots = [20, 41, 62].map(d => at(cog.x + d)); // in front of the bank; all three the sanctum's door: one height, the tallest
  S = {
    strip: true, route: stripRoute, w, h: STRIP_H, baseH: STRIP_H, bays: 0, dy: 0, rows: 1,
    sw: w, rx: w, ox: 0, dx: 0, split: STRIP_H, sd: 0, sb: 0, hy: 0, // roomOf(): everything is 'hall'
    x0: dRef.x + DOOR_W + 4, x1: dCog.x - 4, y0: FLOOR, y1: FLOOR, aisleY: FLOOR, corridorX: w, lanes: [FLOOR],
    entry: at(-10), magos, queue, refectory, recaff, cogSpots, cog, bench, // cog, bench: props' left end on the floor
    gate: at(GATE_X + GATE_W / 2), doors: [door(GATE_X, 'gate', GATE_W), dRef, dCog, dSan], // scene.js drawStripProps
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
    // the strip packs its consoles: a finished adept's console goes at once, the others close up (the hall keeps its
    // 2x2 console grid stable instead); d.cons, the hall's reservation in slots of 4, does not apply here
    const helpers = (d.helpers ?? []).filter(id => id != null), slotsOf = d.desks ?? d.ids.map(id => ({ key: id, id }));
    const ncons = helpers.length;
    const w = slotsOf.length * LEC_W + ncons * CON_W;
    if (full || x + w + (d.temp ? 12 : 0) > x1 + 1) { full = true; overflow += slotsOf.filter(k => k.id).length; continue; } // a temp block keeps room for the bay's east gate
    blocks.push({ name: d.name, color: d.color, x, y: FLOOR - 3, w, h: 5, ...(d.temp && { temp: true }) });
    slotsOf.forEach((k, i) => {
      const desk = { ...k, dept: d.name, x: x + i * LEC_W + 2, y: FLOOR - 30, compact: true };
      desks.push(desk);
      if (k.id) seats.set(k.id, { x: desk.x + 11, y: FLOOR });
    });
    helpers.forEach((id, k) => {
      const con = { id, dept: d.name, x: x + slotsOf.length * LEC_W + k * CON_W + 3, y: FLOOR - 22 };
      consoles.push(con);
      consoleSeats.set(id, { x: con.x + 7, y: FLOOR });
    });
    x += w + GAP;
  }
  return { blocks, desks, seats, consoles, consoleSeats, overflow };
}

// The break-out bay: the temp blocks' span (packed last by planLayout), 4 px either side, a gate at each end. The strip
// is one walkway, so everyone heading east goes through it: a fenced bay, not a closed room (no routing change).
export function breakoutOfStrip(blocks) {
  const tb = blocks.filter(b => b.temp);
  if (!tb.length) return null;
  const x = Math.min(...tb.map(b => b.x)) - 4, x1 = Math.max(...tb.map(b => b.x + b.w)) + 4;
  return { x, y: FLOOR - 3, w: x1 - x, h: 5, gates: [{ x }, { x: x1 }] };
}
