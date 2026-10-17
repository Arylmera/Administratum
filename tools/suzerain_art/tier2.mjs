// Ordo Administratum (every 40k world): the Suzerain's plinth, bevelled grey flagstones inside an inlaid brass border,
// the Mechanicus cog at its front, an iron riser banded in brass and studded; the link a brass-sleeved data cable,
// its end an iron socket plate with a lit port.
import { grid, slab, across, down, cog, stones, ringOf } from './kit.mjs';

const plinth = w => {
  const T = 45, x0 = 4, x1 = w - 5, y0 = 4, y1 = T - 5; // the brass border's outer edge (2 px wide)
  const cx = w / 2, cy = 33, inCog = (x, y) => !!cog(x, y, cx, cy, 7);
  return slab(w, 54, 9, {
    lit: 'l', shade: 'M', faceLit: 'h', faceShade: 'U',
    top: (x, y) => {
      const out = x < x0 || x > x1 || y < y0 || y > y1, ring = !out && (x < x0 + 2 || x > x1 - 2 || y < y0 + 2 || y > y1 - 2);
      if (out) return 'm'; // the plain rim
      if (ring) return x < x0 + 1 || y < y0 + 1 ? 'h' : x > x1 - 1 || y > y1 - 1 ? 'G' : 'g';
      const c = cog(x, y, cx, cy, 7);
      if (c) return c === 'hub' ? 'k' : x + y < cx + cy - 3 ? 'h' : x + y > cx + cy + 3 ? 'G' : 'g';
      if (ringOf(inCog, x, y)) return 'U';
      return stones(x, y, x0 + 2, y0 + 2, (w - 12) / 4, 11, { joint: 'V', lit: 'l', shade: 'M', fill: 'm' }); // four stones across, three deep
    },
    // The riser: a brass band between iron, a stud under each stone column.
    front: (x, y) => (y === 48 || y === 49 ? (y === 48 ? 'h' : 'g') : y === 51 && (x - 6) % 12 === 0 ? 'l' : y === 51 && (x - 7) % 12 === 0 ? 'V' : 'M'),
  });
};

// A braided cable in a brass sleeve: lit along its north edge, shaded along its south, an iron ring every tile.
const cable = (a, c) => (c === 0 || c === 5 ? 'k' : a === 0 ? (c === 1 ? 'l' : c === 4 ? 'V' : 'm')
  : c === 1 ? 'h' : c === 4 ? 'G' : (a + c) % 4 === 0 ? 'G' : 'g');

export default () => ({
  DAIS: plinth(80),
  DAIS_C: plinth(60),
  LINK_H: across(cable),
  LINK_V: down(cable),
  // The socket at the child's feet: an iron plate, four rivets, the port glowing.
  LINK_END: grid(10, 8, (x, y) => (x === 0 || x === 9 || y === 0 || y === 7 ? 'k' : (x === 1 || x === 8) && (y === 1 || y === 6) ? 'l'
    : y >= 3 && y <= 4 && x >= 3 && x <= 6 ? (x === 3 || x === 6 ? 'C' : 'c') : y === 1 ? 'l' : y === 6 ? 'V' : 'm')),
});
