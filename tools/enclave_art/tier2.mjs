// The 40k worlds' custom room: a chapel annex. Bone flagstones with a sash-inlaid quatrefoil at every corner, a carved
// stone balustrade under a sash runner cloth, newel posts flying the room's banner, an arched oak door with the room's
// shield. y (the sash) is what the rule's colour dyes.
import { grid, edge } from '../breakout_art/kit.mjs';

// Flagstone: 8x8 flags in bone, a lit top-left lip, shadowed grout; the inlay diamond sits on the grout crossing.
const flag = (x, y) => {
  const fx = x % 8, fy = y % 8;
  if (fx === 0 || fy === 0) return 'B';
  if (fx === 1 || fy === 1) return 'p';
  return (x * 7 + y * 3) % 11 === 0 ? 's' : 'b';
};
const inlay = (x, y) => {
  const d = Math.abs(((x + 4) % 16) - 4) + Math.abs(((y + 4) % 16) - 4); // the corner crossing at (0, 0) mod 16
  return d <= 2 ? 'y' : d === 3 ? 'G' : null;
};

// Newel post: a moulded cap, a banner on a brass rod, the shaft below, a plinth.
const POST = [
  '.kkkk.',
  'kpbbBk',
  'kBBBBk',
  'gggggg',
  'kyyyyk',
  'kyGyyk',
  'kyyyyk',
  'kyyGyk',
  'kyyyyk',
  '.yGGy.',
  '.y..y.',
  'kbbBBk',
  'kBBBBk',
  'kkkkkk',
];

// The door: a pointed stone arch on two jambs, the opening (null) left to the caller.
const arch = (x, y) => {
  const cx = Math.abs(x - 7.5);
  if (y < 6) {
    const top = 6 - (7.5 - cx) * 0.9; // the pointed arch's crown at the centre
    if (y < top - 2) return '.';
    if (y < top) return cx > 5.5 ? 'b' : 'p';
    if (y < top + 1) return 'B';
  }
  if (x < 2 || x > 13) return edge(x, 16) ? 'k' : x < 2 ? 'b' : 'B';
  if (y === 19) return 'k';
  return null;
};
// The room's shield, 6x7, on the door.
const SHIELD = [
  'kkkkkk',
  'kyyyyk',
  'kyGGyk',
  'kyyyyk',
  'kyGGyk',
  '.kyyk.',
  '..kk..',
];

export default () => {
  // Balustrade: an oak handrail under the sash runner, vase balusters, a stone plinth.
  const rail = grid(16, 10, (x, y) => {
    if (y === 0) return 'L';
    if (y === 1) return 'w';
    if (y === 2) return x % 5 === 2 ? 'G' : 'y'; // the runner's woven stripe
    if (y === 9) return 'k';
    if (y === 8) return 'B';
    const bx = x % 4, bulge = y === 5 || y === 6;
    return bx === 0 || bx === 1 || (bulge && bx === 2) ? (bx === 0 ? 'p' : 'b') : '.';
  });
  return {
    ENCLAVE_FLOOR: grid(16, 16, (x, y) => inlay(x, y) ?? flag(x, y)),
    ENCLAVE_RAIL: rail,
    // The balustrade from above: the oak handrail's edges, the runner along its top, a brass stud every 8.
    ENCLAVE_SIDE: grid(4, 16, (x, y) => (edge(x, 4) ? 'W' : y % 8 === 4 ? 'g' : 'y')),
    ENCLAVE_POST: POST,
    // The closed door from above: two oak leaves, iron strap hinges, the sash seal where they meet.
    ENCLAVE_GATE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y === 7 || y === 8 ? 'y' : y % 5 === 1 ? 'm' : 'w')),
    // The leaf swung open, seen edge-on against the rail: planks, iron straps, its sash tassel.
    ENCLAVE_GATE_OPEN: grid(16, 10, (x, y) => {
      if (x > 12) return y > 2 && y < 7 && x === 13 ? 'y' : '.';
      if (edge(y, 10) || x === 0 || x === 12) return 'k';
      if (y === 2 || y === 7) return 'm';
      return x % 4 === 3 ? 'W' : 'w';
    }),
    ENCLAVE_GATE_FRONT: grid(16, 20, (x, y) => arch(x, y) ?? (x >= 5 && x < 11 && y >= 8 && y < 15 ? (SHIELD[y - 8][x - 5] === '.' ? 'w' : SHIELD[y - 8][x - 5])
      : x === 7 || x === 8 ? 'W' : y % 6 === 3 && (x === 3 || x === 12) ? 'g' : 'w')),
    ENCLAVE_GATE_FRONT_OPEN: grid(16, 20, (x, y) => arch(x, y) ?? (y >= 6 && y < 11 && x >= 6 && x < 10 ? (y === 10 ? (x % 2 ? 'G' : '.') : 'y') : '.')),
  };
};
