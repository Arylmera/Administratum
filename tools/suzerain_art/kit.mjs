// Shared drawing helpers for the Suzerain sheets (tools/suzerain_art.mjs): frames are rows of key.gpl chars, '.' clear.
export const row = (w, f) => Array.from({ length: w }, (_, x) => f(x) ?? '.').join('');
export const grid = (w, h, f) => Array.from({ length: h }, (_, y) => row(w, x => f(x, y)));
// The link tile across (8x6), and down (6x8) the same tile turned a quarter: f(along, across) for along 0..7, across 0..5.
export const across = f => grid(8, 6, (x, y) => f(x, y));
export const down = f => grid(6, 8, (x, y) => f(y, x));
// A raised slab seen from above and in front: an outline, a top lit along its north and west edges, shaded along its
// east, then a front face `face` rows tall. top(x, y) / front(x, y) fill the inside, in slab coordinates.
export function slab(w, h, face, { top, front, lit, shade, faceLit, faceShade }) {
  const t = h - face;
  return grid(w, h, (x, y) => {
    if (x === 0 || x === w - 1 || y === 0 || y === h - 1 || y === t) return 'k';
    if (y < t) return y === 1 || x === 1 ? lit : x === w - 2 || y === t - 1 ? shade : top(x, y);
    return y === t + 1 ? faceLit : y === h - 2 ? faceShade : front(x, y);
  });
}
// Inside an ellipse filling a w x h box (radii shrunk by `inset`): d < 1.
export const ellipse = (w, h, inset = 0) => (x, y) => ((x + 0.5 - w / 2) / (w / 2 - inset)) ** 2 + ((y + 0.5 - h / 2) / (h / 2 - inset)) ** 2;
// A cog `r` px in radius centred at (cx, cy): teeth every 45 deg, a hub hole. Returns 'rim' | 'tooth' | 'hub' | null.
export function cog(x, y, cx, cy, r) {
  const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
  const tooth = Math.abs(((a / (Math.PI / 4)) % 1 + 1) % 1 - 0.5) > 0.27;
  if (d < r * 0.35) return 'hub';
  if (d < r * 0.8) return 'rim';
  if (d < r + 0.2 && tooth) return 'tooth';
  return null;
}
// Flagstones tw x th from (ox, oy): the joint on each stone's north and west, lit just inside, shaded on its south
// and east. Returns the char for (x, y).
export const stones = (x, y, ox, oy, tw, th, { joint, lit, shade, fill }) => {
  const i = (x - ox + tw * 9) % tw, j = (y - oy + th * 9) % th;
  return i === 0 || j === 0 ? joint : i === 1 || j === 1 ? lit : i === tw - 1 || j === th - 1 ? shade : fill;
};
// A shape's pixel, or its outline ring (any 8-neighbour inside), or null: in(x, y) -> truthy inside.
export const ringOf = (inside, x, y) => !inside(x, y) && [-1, 0, 1].some(dx => [-1, 0, 1].some(dy => inside(x + dx, y + dy)));
