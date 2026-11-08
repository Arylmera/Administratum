// Orbital Station's custom room: a lab module. White deck plates with a sash wayfinding chevron, padded crash rails
// with a sash band, round-capped stanchions, a round pressure hatch ringed in the sash.
import { grid, edge } from '../breakout_art/kit.mjs';

const round = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) <= r;

export default () => {
  // Padded rail: a quilted cushion between two grey bumpers, the sash band through its middle; open below.
  const rail = grid(16, 10, (x, y) => {
    if (y === 0 || y === 6) return 'M';
    if (y === 3) return 'y';
    if (y > 0 && y < 6) return x % 4 === 0 ? 'B' : y === 1 ? 'p' : 'b';
    return x % 8 === 3 || x % 8 === 4 ? (y === 9 ? 'k' : 'm') : '.';
  });
  const hatch = (x, y, open) => {
    const cx = 7.5, cy = 10;
    if (!round(x, y, cx, cy, 7.6)) return x < 2 || x > 13 ? (y > 16 ? 'M' : '.') : y === 19 ? 'k' : '.';
    if (!round(x, y, cx, cy, 6.6)) return 'k';
    if (!round(x, y, cx, cy, 5.4)) return 'y';
    if (open) return '.';
    if (!round(x, y, cx, cy, 4.3)) return 'b';
    return round(x, y, cx - 1, cy - 1, 2) ? 'h' : 'u';
  };
  return {
    // Deck plate: white with grey seams, a sash chevron pointing the way along x.
    ENCLAVE_FLOOR: grid(16, 16, (x, y) => (x % 16 === 15 || y % 16 === 15 ? 'B' : Math.abs(y - 7.5) < 3 && Math.abs(x - 6 - Math.abs(y - 7.5)) < 1.5 ? 'y' : (x * y) % 13 === 5 ? 'P' : 'p')),
    ENCLAVE_RAIL: rail,
    ENCLAVE_SIDE: grid(4, 16, (x, y) => (edge(x, 4) ? 'M' : y % 4 === 0 ? 'B' : x === 1 ? 'y' : 'b')),
    // Stanchion: a round white cap, a sash collar, a grey pole, a round foot.
    ENCLAVE_POST: grid(6, 14, (x, y) => (y < 4 ? (round(x, y, 2.5, 1.8, 2.3) ? (y === 0 || x === 0 || x === 5 ? 'k' : 'p') : '.') : y === 4 ? (x > 0 && x < 5 ? 'y' : '.')
      : y > 10 ? (round(x, y, 2.5, 12.5, 2.6) ? (y === 13 ? 'k' : 'm') : '.') : x === 2 || x === 3 ? (x === 2 ? 'l' : 'm') : '.')),
    // The hatch from above: a thick door in its frame, the sash locking ring.
    ENCLAVE_GATE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y > 5 && y < 10 ? 'y' : 'b')),
    // Swung open: the round door seen edge-on, its sash ring a band.
    ENCLAVE_GATE_OPEN: grid(16, 10, (x, y) => (round(x, y * 1.6, 7.5, 7.5, 7.5) ? (y === 4 || y === 5 ? 'y' : x % 5 === 0 ? 'B' : 'b') : '.')),
    ENCLAVE_GATE_FRONT: grid(16, 20, (x, y) => hatch(x, y, false)),
    ENCLAVE_GATE_FRONT_OPEN: grid(16, 20, (x, y) => hatch(x, y, true)),
  };
};
