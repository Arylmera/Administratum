// Ordo Xenos' Containment Cell: a black deck under a glowing teal grid, rails of humming stasis field slung between
// silver emitter bars, stasis-field pylons with a lit core, a field gate sealed by the Inquisitorial I.
const row = (w, f) => Array.from({ length: w }, (_, x) => f(x)).join('');
const grid = (w, h, f) => Array.from({ length: h }, (_, y) => row(w, x => f(x, y)));
const edge = (x, w) => x === 0 || x === w - 1;
const shimmer = (x, y) => (x + 2 * y) % 5 === 0; // slanted flicker lines through a live field

// The Inquisitorial I, 6x11 ('O' glint, 'k' its outline).
const SEAL = [
  'kkkkkk',
  'kOOOOk',
  'kkOOkk',
  '.kOOk.',
  'kkOOkk',
  'kOOOOk',
  'kkOOkk',
  '.kOOk.',
  'kkOOkk',
  'kOOOOk',
  'kkkkkk',
];

export default () => {
  // Field rail: a lit emitter bar on top, the field pane, a dark emitter bar below.
  const field = (x, y) => (y === 4 || y === 6 ? (((x + y) >> 1) & 1 ? 'c' : '+') : shimmer(x, y) ? '!' : 'C');
  const rail = grid(16, 10, (x, y) => (y === 0 ? 'c' : y === 1 ? 'g' : y === 2 ? 'k' : y === 8 ? 'G' : y === 9 ? 'k' : field(x, y)));
  // Gate frame: the emitter bar over two silver jambs with field nodes.
  const frame = (x, y) => (y === 0 ? 'c' : y === 1 ? 'g' : y === 2 ? 'k'
    : x < 2 || x > 13 ? (edge(x, 16) ? 'k' : y % 5 === 0 ? 'c' : x < 2 ? 'g' : 'G') : null);
  return {
    BREAKOUT_FLOOR: grid(16, 16, (x, y) => {
      if (x === 0 && y === 0) return '+';
      if (x === 0 || y === 0) return '!';
      if ((x === 8 || y === 8) && (x + y) % 2 === 0) return 'C';
      return 'E';
    }),
    BREAKOUT_RAIL: rail,
    BREAKOUT_SIDE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y % 8 === 0 ? 'O' : x === 1 ? 'c' : '!')),
    BREAKOUT_POST: grid(6, 14, (x, y) => {
      if (y === 0) return edge(x, 6) ? '.' : 'k';
      if (edge(x, 6)) return 'k';
      if (y === 1) return x === 2 ? 'O' : 'c';
      if (y === 2) return 'h';
      if (y === 3 || y === 12) return 'k';
      if (y === 13) return 'M';
      if (x === 1) return 'g';
      if (x === 4) return 'G';
      return (y + x) % 3 === 0 ? 'O' : 'c'; // the lit stasis core
    }),
    BREAKOUT_GATE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y === 6 || y === 9 ? 'g' : y === 7 || y === 8 ? 'O' : (x + y) % 2 ? 'c' : '+')),
    BREAKOUT_GATE_OPEN: grid(16, 10, (x, y) => (y < 3 ? rail[y][x] : y === 9 ? 'k' : edge(x, 16) ? 'k' : y === 8 ? 'G' : shimmer(x, y) ? '!' : 'C')),
    BREAKOUT_GATE_FRONT: grid(16, 20, (x, y) => frame(x, y) ?? (x >= 5 && x <= 10 && y >= 5 && y <= 15 && SEAL[y - 5][x - 5] !== '.'
      ? SEAL[y - 5][x - 5]
      : y === 3 || y === 19 ? 'k' : y === 18 ? 'G' : shimmer(x, y) ? 'c' : 'C')),
    BREAKOUT_GATE_FRONT_OPEN: grid(16, 20, (x, y) => frame(x, y) ?? (y === 3 && x % 3 === 0 ? '!' : '.')),
  };
};
