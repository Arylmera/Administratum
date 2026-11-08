// Ordo Administratum (every 40k world): a gothic iron cage. The shaft an iron lattice between riveted rails, its head a
// battlemented lintel over a brass pulley, its pit two coiled buffers; the car panelled in dark wood with a brass band
// and a red lumen, its front a pointed-arch canopy and a scissor gate that folds to the left; the floor a stone slab
// on corbels; the call lamp a red lumen in a brass ring.
import { world, disc } from './kit.mjs';

const rail = x => (x === 0 || x === 55 ? 'k' : x === 1 || x === 54 ? 'm' : x === 2 || x === 53 ? 'M' : null);
const lattice = (x, y) => ((x + y) % 8 === 0 || (x - y + 64) % 8 === 0 ? 'V' : 'n');
const post = x => (x === 0 || x === 51 ? 'k' : x === 1 || x === 50 ? 'm' : x === 2 || x === 49 ? 'M' : null);
const canopy = (x, y) => {
  if (y === 0) return 'k';
  if (y === 1) return 'g';
  const t = Math.abs(((x + 4) % 8) - 4); // pointed teeth hanging from the band
  return y - 2 < 4 - t ? (y - 2 === 3 - t ? 'k' : 'G') : null;
};
// the scissor gate over [x0, x1], its bars `pitch` apart
const gate = (x, y, x0, x1, pitch) => {
  if (x < x0 || x > x1 || y < 6 || y > 37) return null;
  if ((x - x0) % pitch === 0) return (x - x0) % (2 * pitch) === 0 ? 'l' : 'm';
  return pitch > 2 && ((x + y) % 8 === 0 || (x - y + 64) % 8 === 0) ? 'M' : null;
};
const front = (x0, x1, pitch) => (x, y) => post(x) ?? (y >= 38 ? (y === 39 ? 'k' : 'M') : y < 6 ? canopy(x, y) : gate(x, y, x0, x1, pitch));
const ring = disc(3, 3, 3), core = disc(3, 3, 2);

export default () => world({
  SHAFT: (x, y) => rail(x) ?? (x === 1 && y % 8 === 4 ? 'g' : y === 0 ? 'm' : lattice(x, y)),
  SHAFT_TOP: (x, y) => {
    if (y === 0) return x % 6 < 3 ? 'm' : null; // battlements
    if (y === 1) return 'k';
    if (y <= 3) return y === 3 ? 'g' : 'M';
    const r = Math.hypot(x + 0.5 - 28, y + 0.5 - 8);
    if (r <= 1.5) return 'h';
    if (r <= 3.5) return (x + y) % 2 ? 'G' : 'g'; // the pulley's spokes
    if (r <= 4.5) return 'g';
    return rail(x) ?? 'n';
  },
  SHAFT_PIT: (x, y) => rail(x) ?? (y >= 6 ? (y === 7 ? 'k' : 'M') : (x >= 12 && x <= 17) || (x >= 38 && x <= 43) ? ((x + y) % 2 ? 'g' : 'G') : 'n'),
  CABLE: (x, y) => ((x + y) % 2 ? 'l' : 'm'),
  CAR_BACK: (x, y) => {
    if (x === 0 || x === 51 || y === 0 || y === 39) return 'k';
    if (y <= 4) return x >= 24 && x <= 27 && y >= 3 ? (x >= 25 && x <= 26 && y === 4 ? 'F' : 'a') : 'M';
    if (y >= 36) return y === 36 ? 'l' : 'M';
    if (y === 20) return 'g';
    const panel = [[4, 15], [18, 33], [36, 47]].find(([a, b]) => x >= a && x <= b);
    if (!panel || y < 8 || y > 33 || y === 19 || y === 21) return 'W';
    return x === panel[0] || y === 8 || y === 22 ? 'L' : x === panel[1] || y === 18 || y === 33 ? 'W' : 'w';
  },
  'CAR_FRONT.shut': front(3, 48, 4),
  'CAR_FRONT.half': front(3, 26, 2),
  'CAR_FRONT.open': front(3, 8, 2),
  SLAB: (x, y) => (y === 0 ? 'l' : y === 1 ? 'm' : y === 11 ? 'k' : y === 10 ? 'V' : y === 6 || (x === 0 && y < 6) || (x === 8 && y > 6) ? 'V' : (x === 4 && y === 3) || (x === 12 && y === 8) ? 'g' : 'M'),
  SLAB_L: (x, y) => (y === 0 ? 'l' : y === 1 ? 'm' : y < 6 ? (x === 0 ? 'k' : 'M') : x < 2 * (y - 6) ? null : x === 2 * (y - 6) ? 'k' : 'M'), // a corbel under the end
  'LAMP.off': (x, y) => (core(x, y) ? 'n' : ring(x, y) ? 'G' : null),
  'LAMP.on': (x, y) => (x === 2 && y === 2 ? 'F' : core(x, y) ? 'a' : ring(x, y) ? 'g' : null),
});
