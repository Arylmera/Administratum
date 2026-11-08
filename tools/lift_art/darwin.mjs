// Darwin (the Victorian world): a brass cage. The shaft mahogany between fluted brass rails with brass rods, its head
// an arched brass pediment with a sunburst, its pit a brass footing with bosses; the cable a brass chain; the car
// mahogany with a brass dado rail and an oval mirror, its front an ornate grille of brass rings that folds like an
// accordion; the floor herringbone parquet with a brass nosing on scroll brackets; the call lamp a brass dial.
import { world, disc } from './kit.mjs';

const rail = x => (x === 0 || x === 55 ? 'k' : x === 1 || x === 54 ? 'h' : x === 2 || x === 53 ? 'g' : x === 3 || x === 52 ? 'G' : null);
const post = x => (x === 0 || x === 51 ? 'k' : x === 1 || x === 50 ? 'h' : x === 2 || x === 49 ? 'g' : null);
const arch = (x, y) => (y < 6 && Math.hypot(x + 0.5 - 26, y + 0.5 - 26) > 26 ? null : y === 0 || y === 5 ? 'G' : y < 5 ? 'g' : null); // the arched head
const rings = (x, y, x1) => { const d = Math.hypot((x % 8) - 3.5, (y % 8) - 3.5); return x >= 3 && x <= x1 && y > 5 && y < 38 && d > 2.2 && d < 3.4 ? 'h' : null; };
const folded = x1 => (x, y) => post(x) ?? arch(x, y) ?? (y >= 38 ? 'G' : x >= 3 && x <= x1 && y > 5 ? (x % 3 === 0 ? 'g' : x % 3 === 1 ? 'G' : null) : null);
const mirror = disc(26, 13, 6), mirrorRim = disc(26, 13, 7.2), pip = disc(3, 3, 3);

export default () => world({
  SHAFT: (x, y) => rail(x) ?? (x === 14 || x === 41 ? 'G' : (x === 28 && y % 16 < 3) ? 'g' : 'W'),
  SHAFT_TOP: (x, y) => {
    const d = Math.hypot(x + 0.5 - 28, y + 0.5 - 14);
    if (d > 14) return null;
    if (d > 12) return 'g';
    return Math.round(Math.atan2(y + 0.5 - 14, x + 0.5 - 28) * 8 / Math.PI) % 2 ? 'G' : 'W'; // the sunburst
  },
  SHAFT_PIT: (x, y) => (y <= 1 ? 'h' : y === 7 ? 'k' : (y === 4 && x % 8 === 4) ? 'g' : 'w'),
  CABLE: (x, y) => ((x + y) % 2 ? 'G' : 'h'),
  CAR_BACK: (x, y) => {
    if (y < 6 && Math.hypot(x + 0.5 - 26, y + 0.5 - 26) > 26) return null; // the arched top
    if (x === 0 || x === 51 || y === 39 || (y < 6 && Math.hypot(x + 0.5 - 26, y + 0.5 - 26) > 25)) return 'k';
    if (y >= 36) return 'G';
    if (y === 35) return 'x'; // the carpet's edge
    if (y === 22) return 'h';
    if (mirror(x, y)) return 'u';
    if (mirrorRim(x, y)) return 'g';
    return x % 6 === 0 ? 'W' : 'w';
  },
  'CAR_FRONT.shut': (x, y) => post(x) ?? arch(x, y) ?? (y >= 38 ? 'G' : rings(x, y, 48)),
  'CAR_FRONT.half': folded(24),
  'CAR_FRONT.open': folded(7),
  SLAB: (x, y) => (y === 0 ? 'h' : y === 1 ? 'G' : y === 10 ? 'W' : y === 11 ? 'k' : (x + y) % 8 < 4 ? 'w' : 'L'),
  SLAB_L: (x, y) => (y === 0 ? 'h' : y === 1 ? 'G' : y <= 3 ? 'w' : Math.abs(Math.hypot(x + 0.5 - 4, y + 0.5 - 7.5) - 2.8) < 0.8 ? 'g' : null), // a scroll bracket
  'LAMP.off': (x, y) => (!pip(x, y) ? null : (x === 1 && y === 3) || (x === 2 && y === 3) ? 'k' : 'P'),
  'LAMP.on': (x, y) => (!pip(x, y) ? null : (x === 3 && (y === 1 || y === 2)) ? 'x' : 'F'),
});
