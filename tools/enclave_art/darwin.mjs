// Darwin's custom room: a specimen gallery. Encaustic tiles (cream and terracotta) inside a sash border, a mahogany
// rail with a scalloped sash velvet drape, turned mahogany posts with brass finials, a glazed vitrine door on a velvet
// plinth, its curtains drawn aside when open.
import { grid, edge } from '../breakout_art/kit.mjs';

export default () => {
  const tile = (x, y) => {
    const fx = x % 8, fy = y % 8, d = Math.abs(fx - 3.5) + Math.abs(fy - 3.5);
    return d < 1.5 ? 'g' : d < 3 ? 'x' : 'b';
  };
  // The drape hangs in scallops below the rail, a gold fringe on each.
  const drape = (x, y) => {
    const low = 6 + Math.round(1.5 * Math.cos(Math.PI * (x % 8) / 4 + Math.PI));
    return y < low ? 'y' : y === low ? 'G' : '.';
  };
  const vitrine = (x, y, open) => {
    if (y < 2) return y === 0 ? (x === 7 || x === 8 ? 'g' : '.') : x > 0 && x < 15 ? 'L' : '.';
    if (x < 2 || x > 13) return edge(x, 16) ? 'k' : 'w';
    if (y > 16) return y === 19 ? 'k' : 'y';
    if (y === 2) return 'W';
    if (open) return x === 2 || x === 3 || x === 12 || x === 13 ? (y % 3 === 0 ? 'G' : 'y') : '.';
    return x === 7 || x === 8 ? 'w' : (x + y) % 6 === 0 ? 'p' : 'P';
  };
  return {
    ENCLAVE_FLOOR: grid(16, 16, (x, y) => (x === 0 || y === 0 ? 'y' : x === 1 || y === 1 ? 'G' : tile(x, y))),
    ENCLAVE_RAIL: grid(16, 10, (x, y) => (y === 0 ? 'L' : y === 1 ? 'w' : y === 2 ? (x % 8 === 0 ? 'g' : 'W') : drape(x, y))),
    ENCLAVE_SIDE: grid(4, 16, (x, y) => (edge(x, 4) ? 'W' : y % 8 === 0 ? 'g' : x === 1 ? 'w' : 'y')),
    // Turned post: a brass ball finial, a bulging mahogany shaft, a velvet collar, a square foot.
    ENCLAVE_POST: grid(6, 14, (x, y) => {
      if (y < 3) return Math.hypot(x - 2.5, y - 1.2) < 1.8 ? (y === 0 ? 'h' : 'g') : '.';
      if (y === 3) return x > 0 && x < 5 ? 'y' : '.';
      if (y > 11) return y === 13 ? 'k' : 'W';
      const w = y > 5 && y < 9 ? 2.6 : 1.6;
      return Math.abs(x - 2.5) < w ? (x < 3 ? 'L' : 'w') : '.';
    }),
    // The velvet rope across the gap from above, a brass clip at each end.
    ENCLAVE_GATE: grid(4, 16, (x, y) => (x === 1 || x === 2 ? (y < 2 || y > 13 ? 'g' : 'y') : '.')),
    // Unclipped: the rope hangs in a loop from its post.
    ENCLAVE_GATE_OPEN: grid(16, 10, (x, y) => (x === 15 && y < 2 ? 'g' : Math.abs(Math.hypot(x - 15, y - 1) - 7) < 0.8 && x > 8 ? 'y' : '.')),
    ENCLAVE_GATE_FRONT: grid(16, 20, (x, y) => vitrine(x, y, false)),
    ENCLAVE_GATE_FRONT_OPEN: grid(16, 20, (x, y) => vitrine(x, y, true)),
  };
};
