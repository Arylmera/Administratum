// Orbital Station's Quarantine Bay: a dark airlock deck with an orange-and-black hazard band, white-framed glass
// partitions with cyan glints on a hazard-striped kick plate, white bulkhead posts with a red quarantine lamp, and an
// airlock hatch under a red lamp that turns green when it slides open.
const row = (w, f) => Array.from({ length: w }, (_, x) => f(x)).join('');
const grid = (w, h, f) => Array.from({ length: h }, (_, y) => row(w, x => f(x, y)));
const edge = (x, w) => x === 0 || x === w - 1;
const hazard = (x, y) => (((x + y) >> 1) & 1 ? 'X' : 'k'); // airlock stripes, 2 px wide, slanted
const glass = (x, y) => ((x + y) % 7 === 0 ? 'c' : (x + y) % 7 === 1 ? 'O' : '!'); // tinted pane with a glint

// Bulkhead post: a red quarantine lamp in a white housing, an orange hazard band, a dark foot.
const POST = [
  '.kkkk.',
  'kaaaak',
  'kaFaak',
  'kkkkkk',
  'kpppPk',
  'kpppPk',
  'kXkXkk',
  'kkXkXk',
  'kXkXkk',
  'kpppPk',
  'kpppPk',
  'kpppPk',
  'kmmmMk',
  'kVVVVk',
];

export default () => {
  // Glass partition: a white top frame, the pane, a frame bar, a hazard-striped kick plate.
  const rail = grid(16, 10, (x, y) => (y === 0 ? 'F' : y === 1 ? 'p' : y === 2 ? 'P' : y < 6 ? glass(x, y)
    : y === 6 ? 'P' : y === 9 ? 'k' : hazard(x, y)));
  // Airlock frame: a lamp bar over white jambs striped with hazard paint.
  const frame = (lamp) => (x, y) => (y === 0 ? 'k' : y === 1 ? (x >= 6 && x <= 9 ? lamp : 'p') : y === 2 ? 'P'
    : x < 2 || x > 13 ? (edge(x, 16) ? 'k' : hazard(x, y)) : y === 19 ? 'k' : null);
  return {
    // Deck plates with rivets and a seam, an airlock hazard band along the bottom of each tile.
    BREAKOUT_FLOOR: grid(16, 16, (x, y) => {
      if (y >= 12) return y === 12 || y === 15 ? 'k' : hazard(x, y);
      if (x === 0 || y === 0) return 'k';
      if ((x === 2 || x === 14) && (y === 2 || y === 10)) return 'l';
      return x === 8 ? 'V' : 'M';
    }),
    BREAKOUT_RAIL: rail,
    // The partition from above: white frame edges round a thin glass core.
    BREAKOUT_SIDE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y % 8 === 0 ? 'P' : x === 1 ? 'p' : glass(x, y))),
    BREAKOUT_POST: POST,
    // Closed hatch from above: a hazard-striped leaf with a red lock lamp.
    BREAKOUT_GATE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y === 7 || y === 8 ? 'a' : hazard(x, y))),
    // Slid open: the striped leaf drawn into its pocket, a green go lamp, the threshold clear.
    BREAKOUT_GATE_OPEN: grid(16, 10, (x, y) => (y === 9 ? 'k' : x >= 12 ? (edge(x, 16) || x === 12 ? 'k' : y === 1 && x === 14 ? 'v' : hazard(x, y))
      : y === 0 || y === 8 ? 'P' : '.')),
    // The hatch: a pale panel with a porthole and a red quarantine lamp above.
    BREAKOUT_GATE_FRONT: grid(16, 20, (x, y) => frame('a')(x, y) ?? (y === 3 || x === 2 || x === 13 ? 'k'
      : y >= 6 && y <= 9 && x >= 5 && x <= 10 ? (y === 6 || y === 9 || x === 5 || x === 10 ? 'm' : glass(x, y))
      : y >= 14 && y <= 16 ? hazard(x, y) : x === 7 || x === 8 ? 'P' : 'p')),
    BREAKOUT_GATE_FRONT_OPEN: grid(16, 20, (x, y) => frame('v')(x, y) ?? (x === 2 || x === 13 ? 'P' : '.')),
  };
};
