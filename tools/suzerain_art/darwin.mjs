// Darwin: the Suzerain's Persian rug laid on the tiles, a crimson field strewn with gold flowers, a navy border with a
// gold running pattern and guard lines, a lozenge medallion at its heart and cream fringes at both ends (no riser: it
// lies flat); the link a twisted hemp rope, its end a knot.
import { grid, across, down } from './kit.mjs';

const rug = w => grid(w, 54, (x, y) => {
  const L = 3, R = w - 4, T = 1, B = 52; // the rug's body, the fringes outside L and R
  if (x < L || x > R) return y >= 4 && y <= 49 && y % 2 === 0 ? (x === 0 || x === w - 1 ? 'P' : 'p') : null;
  if (y < T || y > B) return null;
  const bx = Math.min(x - L, R - x), by = Math.min(y - T, B - y);
  if (bx === 0 || by === 0) return 'G'; // the rug's edge
  if (bx === 1 || by === 1 || bx === 6 || by === 6) return 'g'; // guard lines
  if (bx < 6 && by < 6 || bx < 6 || by < 6) return (bx < 6 ? y : x) % 4 === 0 && (bx === 3 || by === 3) ? 'h' : (bx < 6 ? (y + bx) : (x + by)) % 4 === 1 ? 'g' : 'u'; // the navy border's running pattern
  const cx = (L + R) / 2, cy = (T + B) / 2, d = Math.abs(x - cx) / 14 + Math.abs(y - cy) / 12; // the lozenge medallion
  if (d < 1) return d > 0.88 ? 'g' : d > 0.5 ? ((x + y) % 3 === 0 ? 'h' : 'u') : d > 0.4 ? 'g' : d > 0.18 ? 'x' : 'h';
  const corner = Math.min(Math.abs(x - L - 7), Math.abs(R - 7 - x)) + Math.min(Math.abs(y - T - 7), Math.abs(B - 7 - y));
  if (corner < 6) return corner > 4 ? 'g' : 'u'; // quarter medallions in the corners
  return (x % 6 === 3 && y % 6 === 2) ? 'h' : ((x + 1) % 6 === 3 && y % 6 === 2) || ((x - 1) % 6 === 3 && y % 6 === 2) || (x % 6 === 3 && (y % 6 === 1 || y % 6 === 3)) ? 'G' : 'x'; // gold flowers
});

// The rope: two strands twisted, a light ridge on each turn.
const rope = (a, c) => (c === 0 || c === 5 ? null : c === 1 && (a + c) % 4 === 0 ? 'Y' : (a + c) % 4 < 2 ? 'X' : c === 4 ? 'i' : 'Z');

export default () => ({
  DAIS: rug(80),
  DAIS_C: rug(60),
  LINK_H: across(rope),
  LINK_V: down(rope),
  LINK_END: grid(10, 8, (x, y) => {
    const d = Math.hypot(x - 4.5, (y - 3.5) * 1.2);
    return d > 4.2 ? null : d > 3.4 ? 'i' : (x + y) % 3 === 0 ? 'Y' : (x - y + 9) % 3 === 0 ? 'Z' : 'X'; // the knot's coils
  }),
});
