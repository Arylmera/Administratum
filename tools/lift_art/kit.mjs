// Shared sizes and drawing helpers for the desktop column's lift (tools/lift_art.mjs). Frames are rows of key.gpl chars,
// '.' clear. Every world draws its own shaft, car and floor slab from scratch at these sizes (art px; the column is
// ui/column.js: the shaft SHAFT_W = 28 logical px = 56 art px, the car centred in it, 2 art px of shaft either side).
export const SIZES = {
  SHAFT: [56, 16], SHAFT_TOP: [56, 12], SHAFT_PIT: [56, 8], CABLE: [2, 4], CAR_BACK: [52, 40],
  'CAR_FRONT.shut': [52, 40], 'CAR_FRONT.half': [52, 40], 'CAR_FRONT.open': [52, 40],
  SLAB: [16, 12], SLAB_L: [8, 12], SLAB_R: [8, 12], 'LAMP.off': [6, 6], 'LAMP.on': [6, 6],
};
export const NAMES = Object.keys(SIZES);

// A frame of name n from f(x, y) -> char | null.
export const draw = (n, f) => { const [w, h] = SIZES[n]; return Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => f(x, y) ?? '.').join('')); };
// The right end cap: the left one mirrored (chars kept).
export const mirrored = rows => rows.map(r => [...r].reverse().join(''));
// A disc of radius r round (cx, cy) (pixel centres).
export const disc = (cx, cy, r) => (x, y) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r;
// Every frame of a world from its painters: one function per frame name (x, y) -> char | null.
export const world = painters => Object.fromEntries(NAMES.map(n => [n, n === 'SLAB_R' && !painters.SLAB_R ? mirrored(draw('SLAB_L', painters.SLAB_L)) : draw(n, painters[n])]));
