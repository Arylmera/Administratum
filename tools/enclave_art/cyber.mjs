// Neon Grid's custom room: a corporate pod. Dark carbon floor panels edged by a sash LED trim, frosted-glass partitions
// under a sash light strip, slim aluminium posts with a sash status ring, a sliding glass door with the room's logo bar.
import { grid, edge } from '../breakout_art/kit.mjs';

export default () => {
  // Frosted partition: the light strip on top, frosted glass with a diagonal sheen, a black foot.
  const glass = (x, y) => ((x + y) % 7 === 0 ? 'p' : (x + 2 * y) % 11 === 0 ? 'b' : 'P');
  const rail = grid(16, 10, (x, y) => (y === 0 ? 'y' : y === 1 ? 'l' : y === 9 ? 'k' : y === 8 ? 'M' : glass(x, y)));
  const frame = (x, y) => (y === 0 || y === 1 ? 'm' : y === 2 ? 'y' : x < 2 || x > 13 ? (edge(x, 16) ? 'k' : 'l') : y === 19 ? 'k' : null);
  return {
    // Carbon panel: dark weave, a sash LED trim along its top and west seams, a vent slot.
    ENCLAVE_FLOOR: grid(16, 16, (x, y) => (y === 0 || x === 0 ? 'y' : y === 1 || x === 1 ? 'k' : y === 11 && x > 4 && x < 11 ? 'M' : (x + y) % 4 === 0 ? 'w' : 'n')),
    ENCLAVE_RAIL: rail,
    ENCLAVE_SIDE: grid(4, 16, (x, y) => (x === 0 ? 'y' : x === 3 ? 'k' : glass(x, y))),
    // Aluminium post: a narrow column, a lit status ring, a weighted foot.
    ENCLAVE_POST: grid(6, 14, (x, y) => (y < 2 ? (x > 0 && x < 5 ? 'l' : '.') : y === 4 || y === 5 ? (x > 0 && x < 5 ? 'y' : '.') : y > 11 ? (y === 13 ? 'k' : 'M') : x === 2 ? 'l' : x === 3 ? 'm' : '.')),
    // The sliding door from above: a glass leaf in its track, the motion sensor lit.
    ENCLAVE_GATE: grid(4, 16, (x, y) => (edge(x, 4) ? 'M' : y === 7 || y === 8 ? 'y' : glass(x, y))),
    // Slid open: the leaf parked behind its neighbour, half as wide, its sensor strip still lit.
    ENCLAVE_GATE_OPEN: grid(16, 10, (x, y) => (x > 7 ? '.' : y === 0 ? 'y' : y === 9 ? 'k' : x === 0 || x === 7 ? 'l' : glass(x, y))),
    ENCLAVE_GATE_FRONT: grid(16, 20, (x, y) => frame(x, y) ?? (y === 6 && x > 3 && x < 12 ? 'y' : x === 7 || x === 8 ? 'k' : x === 10 && y > 9 && y < 13 ? 'l' : glass(x, y))),
    ENCLAVE_GATE_FRONT_OPEN: grid(16, 20, (x, y) => frame(x, y) ?? '.'),
  };
};
