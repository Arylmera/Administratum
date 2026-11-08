// Arcane Tower's custom room: a library alcove. Oak boards under a rug with a sash border, a sash rope with tassels
// slung between brass hooks, bookcase ends for posts, a gate of two bookcases with the rope across.
import { grid } from '../breakout_art/kit.mjs';

// A bookcase end, 6x14: oak sides, shelves, book spines (one in the sash).
const SPINES = 'xuyvxGyu';
const shelf = (x, y) => (y === 0 ? (x === 0 || x === 5 ? '.' : 'L') : x === 0 || x === 5 ? 'w' : y % 4 === 0 ? 'W' : y === 13 ? 'W' : SPINES[(x + Math.floor(y / 4) * 3) % SPINES.length]);

export default () => {
  // Rope: it sags from a hook at each end to the middle, a tassel hangs at the low point.
  const sag = x => 2 + Math.round(3 * Math.sin(Math.PI * x / 15));
  const rope = (x, y) => (x === 0 || x === 15 ? (y < 3 ? 'g' : '.') : y === sag(x) ? 'y' : y === sag(x) + 1 ? 'G' : (x === 7 || x === 8) && y > sag(x) + 1 && y < 9 ? (y === 8 ? 'G' : 'y') : '.');
  const pair = (x, y) => (x < 6 ? shelf(x, Math.max(0, y - 6)) : x > 9 ? shelf(x - 10, Math.max(0, y - 6)) : null);
  return {
    // Oak boards (planks along x, staggered joints), the rug's sash border along one edge with its gold thread.
    ENCLAVE_FLOOR: grid(16, 16, (x, y) => (y === 13 ? 'g' : y > 13 ? 'y' : y % 4 === 3 ? 'W' : (x + (y >> 2) * 6) % 16 === 0 ? 'W' : (x + y) % 9 === 0 ? 'L' : 'w')),
    ENCLAVE_RAIL: grid(16, 10, rope),
    // The rope seen from above, its hooks at the ends.
    ENCLAVE_SIDE: grid(4, 16, (x, y) => (x === 1 || x === 2 ? (y % 5 === 0 ? 'G' : 'y') : '.')),
    ENCLAVE_POST: grid(6, 14, shelf),
    // The gate rope from above, a brass clasp in the middle.
    ENCLAVE_GATE: grid(4, 16, (x, y) => (x === 1 || x === 2 ? (y === 7 || y === 8 ? 'g' : 'y') : '.')),
    // Unhooked: the rope hangs straight down from its hook, the tassel at the floor.
    ENCLAVE_GATE_OPEN: grid(16, 10, (x, y) => (x === 15 ? (y < 2 ? 'g' : y === 9 ? 'G' : 'y') : x === 14 && y > 6 ? 'y' : '.')),
    ENCLAVE_GATE_FRONT: grid(16, 20, (x, y) => (y < 6 ? (x < 6 || x > 9 ? '.' : y === 5 ? 'g' : '.') : pair(x, y) ?? (y === 9 ? 'y' : y === 10 && (x === 7 || x === 8) ? 'y' : y === 11 && (x === 7 || x === 8) ? 'G' : '.'))),
    ENCLAVE_GATE_FRONT_OPEN: grid(16, 20, (x, y) => (y < 6 ? '.' : pair(x, y) ?? (x === 9 && y > 8 ? (y === 19 ? 'G' : 'y') : '.'))),
  };
};
