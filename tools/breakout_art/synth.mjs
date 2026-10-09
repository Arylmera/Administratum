// Sunset Drive's Arcade Corner: a lilac-and-black checkered floor, magenta velvet ropes swagged between brass
// stanchions, and a marquee gate: a "PLAY" sign in a ring of chasing bulbs over brass jambs, the rope hooked across
// the doorway when closed and dropped to hang from the jamb when open.
const row = (w, f) => Array.from({ length: w }, (_, x) => f(x)).join('');
const grid = (w, h, f) => Array.from({ length: h }, (_, y) => row(w, x => f(x, y)));
const edge = (x, w) => x === 0 || x === w - 1;

// "PLAY", 14x5 ('#' lit neon).
const PLAY = [
  ['###', '#.#', '###', '#..', '#..'],
  ['#.', '#.', '#.', '#.', '##'],
  ['.#.', '#.#', '###', '#.#', '#.#'],
  ['#.#', '#.#', '.#.', '.#.', '.#.'],
];
const SIGN = [0, 1, 2, 3, 4].map(y => PLAY.map(g => g[y]).join('.'));

// Brass stanchion: a ball finial, the rope hook, a slim pole lit on the west, a weighted round foot.
const POST = [
  '.kkkk.',
  'khhgGk',
  'kghgGk',
  '.kGGk.',
  '.kxZk.',
  '.khGk.',
  '.khGk.',
  '.khGk.',
  '.khGk.',
  '.khGk.',
  '.khGk.',
  'kkhgkk',
  'khhggk',
  'kGGGUk',
];

// A velvet swag: its top row at x (0..15, hung from poles at x = 7..8, lowest midway between them).
const sag = x => 2 + Math.round(3 * ((x - 7.5) / 7.5) ** 2);
const rope = (x, y, top) => (y === top ? 'x' : y === top + 1 ? 'Z' : y === top + 2 ? 'i' : null);
// Chasing bulbs: lit cream and dim amber in turn.
const bulb = n => (n % 2 ? 'F' : 'G');

export default () => {
  // Marquee header (y 0..6): a bulb ring round the neon "PLAY" on the violet board.
  const marquee = (x, y) => {
    if (y === 0 || y === 6) return bulb(x);
    if (edge(x, 16)) return bulb(y + 1);
    return SIGN[y - 1][x - 1] === '#' ? 'x' : 'u';
  };
  const jamb = (x, y) => (y === 7 ? 'k' : x < 2 || x > 13 ? (edge(x, 16) ? 'k' : x < 2 ? 'h' : 'G') : y === 19 ? 'k' : null);
  return {
    // Arcade checks, 8 px: dusk violet and near black, a glint on each light square, a violet sheen on each dark one.
    BREAKOUT_FLOOR: grid(16, 16, (x, y) => {
      const light = ((x >> 3) + (y >> 3)) % 2 === 0, cx = x % 8, cy = y % 8;
      if (light) return cx === 1 && cy === 1 ? 'l' : cx === 7 || cy === 7 ? 'L' : 'm';
      return cx === 1 && cy === 1 ? 'u' : 'n';
    }),
    // A stanchion mid-tile, the rope swagging out to the next one each side.
    BREAKOUT_RAIL: grid(16, 10, (x, y) => {
      if (x === 7 || x === 8) {
        if (y === 0) return x === 7 ? 'h' : 'g';
        if (y === 9) return 'G';
        if (y === 2 || y === 3) return x === 7 ? 'x' : 'Z';
        return x === 7 ? 'h' : 'G';
      }
      if (y === 9 && (x === 6 || x === 9)) return 'U';
      return rope(x, y, sag(x)) ?? '.';
    }),
    // The rope from above, a stanchion's ball every 16 px.
    BREAKOUT_SIDE: grid(4, 16, (x, y) => (y >= 6 && y <= 9 ? ((y === 6 || y === 9) && edge(x, 4) ? '.' : edge(x, 4) || y === 6 || y === 9 ? 'k' : y === 7 && x === 1 ? 'h' : 'g')
      : x === 1 ? 'x' : x === 2 ? 'Z' : '.')),
    BREAKOUT_POST: POST,
    // The marquee from above, bulbs down its edge, the rope hooked across the middle.
    BREAKOUT_GATE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y === 7 || y === 8 ? (x === 1 ? 'x' : 'Z') : x === 1 ? bulb(y) : 'u')),
    // Open: the bulb-lined threshold clear, the rope unhooked and coiled against the north jamb's stanchion.
    BREAKOUT_GATE_OPEN: grid(16, 10, (x, y) => (y === 9 ? 'k' : y === 0 || y === 8 ? bulb(x)
      : x === 13 || x === 14 ? (y <= 2 ? (y === 1 && x === 13 ? 'h' : 'g') : x === 13 ? 'x' : 'Z') : '.')),
    // Closed: the rope hooked jamb to jamb, sagging across the doorway.
    BREAKOUT_GATE_FRONT: grid(16, 20, (x, y) => (y < 7 ? marquee(x, y) : jamb(x, y)
      ?? (y === 9 && (x === 2 || x === 13) ? 'g' : rope(x, y, 9 + Math.round(3 * (1 - ((x - 7.5) / 6) ** 2))) ?? '.'))),
    // Open: the rope dropped, hanging straight down the west jamb.
    BREAKOUT_GATE_FRONT_OPEN: grid(16, 20, (x, y) => (y < 7 ? marquee(x, y) : jamb(x, y)
      ?? (y === 9 && x === 2 ? 'g' : y >= 10 && y <= 17 && (x === 2 || x === 3) ? (x === 2 ? 'x' : 'Z') : '.'))),
  };
};
