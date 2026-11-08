// Vault 111's custom room: a department wing. Checkered linoleum with a dashed sash floor line, steel cubicle walls
// carrying a sash placard, square riveted steel posts, a steel office door with a wired-glass window and the room's
// placard over it.
import { grid, edge } from '../breakout_art/kit.mjs';

export default () => {
  // Cubicle wall: a lit steel cap, a riveted panel, the placard, a dark kick plate.
  const wall = (x, y) => (y === 0 ? 'l' : y === 9 ? 'k' : y === 8 ? 'M' : x > 4 && x < 11 && y > 2 && y < 7 ? (y === 3 || y === 6 || x === 5 || x === 10 ? 'k' : 'y')
    : (x === 1 || x === 14) && (y === 2 || y === 7) ? 'l' : 'm');
  const door = (x, y, open) => {
    if (y < 4) return x > 1 && x < 14 ? (y === 0 || y === 3 || x === 2 || x === 13 ? 'k' : 'y') : '.';
    if (x < 2 || x > 13) return edge(x, 16) ? 'k' : 'M';
    if (y === 4 || y === 19) return 'k';
    if (open) return '.';
    if (x > 4 && x < 11 && y > 6 && y < 11) return (x + y) % 3 === 0 ? 'l' : 'u';
    return x === 11 && y === 13 ? 'g' : 'm';
  };
  return {
    // Linoleum: cream and grey checks, the painted sash line dashed down the middle.
    ENCLAVE_FLOOR: grid(16, 16, (x, y) => (y === 7 || y === 8 ? (x % 8 < 5 ? 'y' : ((x >> 3) + (y >> 3)) % 2 ? 'B' : 's') : ((x >> 3) + (y >> 3)) % 2 ? 'B' : 's')),
    ENCLAVE_RAIL: grid(16, 10, wall),
    ENCLAVE_SIDE: grid(4, 16, (x, y) => (edge(x, 4) ? 'M' : y % 8 === 3 || y % 8 === 4 ? 'y' : 'l')),
    // Square steel post: a sash band at the top, rivets down the face, a dark foot.
    ENCLAVE_POST: grid(6, 14, (x, y) => (edge(x, 6) ? 'k' : y < 2 ? 'y' : y === 13 ? 'k' : y % 4 === 2 && (x === 1 || x === 4) ? 'l' : x < 3 ? 'm' : 'M')),
    ENCLAVE_GATE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y === 7 || y === 8 ? 'y' : 'm')),
    // Swung open: the steel leaf edge-on, its placard showing.
    ENCLAVE_GATE_OPEN: grid(16, 10, (x, y) => (x < 3 || x > 12 ? '.' : edge(y, 10) || x === 3 || x === 12 ? 'k' : y > 2 && y < 6 && x > 5 && x < 10 ? 'y' : 'm')),
    ENCLAVE_GATE_FRONT: grid(16, 20, (x, y) => door(x, y, false)),
    ENCLAVE_GATE_FRONT_OPEN: grid(16, 20, (x, y) => door(x, y, true)),
  };
};
