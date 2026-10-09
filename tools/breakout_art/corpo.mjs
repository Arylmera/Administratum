// Corpo Tower's Temp Pool: grey carpet tiles laid in alternating pile, glass hot-desk partitions (frosted privacy band,
// a red brand stripe, an aluminium cap), aluminium posts with a red badge light, and a glass door with a "TEMPS"
// lanyard sign that swings out of the doorway when it opens.
const row = (w, f) => Array.from({ length: w }, (_, x) => f(x)).join('');
const grid = (w, h, f) => Array.from({ length: h }, (_, y) => row(w, x => f(x, y)));
const edge = (x, w) => x === 0 || x === w - 1;
const glass = (x, y) => ((x + y) % 9 === 0 ? 'c' : 'C'); // smoked pane with a glint

// "TEMPS" on the lanyard card, 12x5, letters alternating black and red so they read without gaps.
const LETTERS = [
  ['k', ['###', '.#.', '.#.', '.#.', '.#.']], // T
  ['x', ['##', '#.', '##', '#.', '##']], // E
  ['k', ['#.#', '###', '#.#', '#.#', '#.#']], // M
  ['x', ['##', '##', '#.', '#.', '#.']], // P
  ['k', ['##', '#.', '##', '.#', '##']], // S
];
const TEMPS = [0, 1, 2, 3, 4].map(y => LETTERS.map(([c, g]) => g[y].replaceAll('#', c)).join(''));

// Aluminium post: a red badge-reader light, two partition clamps, a dark foot.
const POST = [
  '.kkkk.',
  'khggGk',
  'khxxGk',
  'khggGk',
  'kmmmmk',
  'khggGk',
  'khggGk',
  'khggGk',
  'khggGk',
  'kmmmmk',
  'khggGk',
  'khggGk',
  'kGGGGk',
  'kVVVVk',
];

export default () => {
  // Hot-desk partition: aluminium cap, smoked glass, a frosted band with the red brand stripe, an aluminium foot.
  const rail = grid(16, 10, (x, y) => (y === 0 ? 'h' : y === 1 ? 'g' : x === 0 && y < 8 ? 'G'
    : y === 4 || y === 6 ? 'c' : y === 5 ? 'x' : y === 8 ? 'G' : y === 9 ? 'k' : glass(x, y)));
  // Door frame: a header with a badge light, aluminium jambs.
  const frame = (lamp) => (x, y) => (y === 0 || y === 3 ? 'k' : y === 1 ? (x >= 7 && x <= 8 ? lamp : 'h') : y === 2 ? 'g'
    : x < 2 || x > 13 ? (edge(x, 16) ? 'k' : x < 2 ? 'h' : 'G') : y === 19 ? 'k' : y === 18 ? 'G' : null);
  // The lanyard card: white with a pale rim, its cords run up to the header.
  const card = (x, y) => {
    if (y >= 8 && y <= 12 && x >= 2 && x <= 13) { const ch = TEMPS[y - 8][x - 2]; return ch === '.' ? 'p' : ch; }
    if (y >= 7 && y <= 13 && x >= 1 && x <= 14) return y === 7 || y === 13 || x === 1 || x === 14 ? 'P' : 'p';
    if (y === 6 && (x === 7 || x === 8)) return 'g'; // clip
    if (y >= 4 && y <= 6 && (x === 3 + y - 4 || x === 12 - (y - 4))) return 'x'; // red cords
    return null;
  };
  return {
    // Carpet tiles, 8 px, the pile turned a quarter between neighbours, dark seams, a few flecks.
    BREAKOUT_FLOOR: grid(16, 16, (x, y) => {
      if (x % 8 === 0 || y % 8 === 0) return 'w';
      if ((x * 7 + y * 5) % 23 === 0) return 'm';
      const across = ((x >> 3) + (y >> 3)) & 1;
      return (across ? y : x) % 2 ? 'R' : 'L';
    }),
    BREAKOUT_RAIL: rail,
    // The partition from above: the aluminium cap, a joint every panel.
    BREAKOUT_SIDE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y % 16 === 0 ? 'G' : x === 1 ? 'h' : 'g')),
    BREAKOUT_POST: POST,
    // Closed glass door from above: a smoked leaf with a red lock light.
    BREAKOUT_GATE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y === 7 || y === 8 ? 'x' : x === 1 ? 'c' : 'C')),
    // Swung open: the leaf folded back against the jamb, the badge light white, the doorway clear.
    BREAKOUT_GATE_OPEN: grid(16, 10, (x, y) => (y === 9 ? 'k' : x >= 12 ? (edge(x, 16) || x === 12 ? 'k' : y === 1 && x === 14 ? 'h' : x === 13 ? 'c' : 'C')
      : y === 0 || y === 8 ? 'g' : '.')),
    // The glass door with the TEMPS lanyard sign hung on it, a frosted kick band, a red badge light above; the card hangs over the jambs.
    BREAKOUT_GATE_FRONT: grid(16, 20, (x, y) => (y >= 7 && y <= 13 ? card(x, y) : null) ?? frame('x')(x, y) ?? card(x, y) ?? (y === 15 || y === 16 ? 'c' : x === 12 && y === 14 ? 'g' : glass(x, y))),
    BREAKOUT_GATE_FRONT_OPEN: grid(16, 20, (x, y) => frame('h')(x, y) ?? (x === 2 || x === 13 ? 'G' : '.')),
  };
};
