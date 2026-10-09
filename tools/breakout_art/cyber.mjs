// Neon Grid's Sandbox: a void floor under a cyan wireframe mesh, hot-pink laser beams strung between chrome emitter
// posts with lit lenses, a gate of stacked lasers locked by a cyan padlock glyph that powers down when it opens.
const row = (w, f) => Array.from({ length: w }, (_, x) => f(x)).join('');
const grid = (w, h, f) => Array.from({ length: h }, (_, y) => row(w, x => f(x, y)));
const edge = (x, w) => x === 0 || x === w - 1;

// The padlock glyph on its glass panel, 8x9 ('c' lit, 'C' panel, 'k' bezel).
const LOCK = [
  'kkkkkkkk',
  'kCCccCCk',
  'kCcCCcCk',
  'kCcCCcCk',
  'kcccccck',
  'kcccCcck',
  'kcccCcck',
  'kcccccck',
  'kkkkkkkk',
];

// Emitter post: a cyan status LED on a chrome housing, two pink lenses where the beams leave it, a dark foot.
const POST = [
  '.kkkk.',
  'kmccmk',
  'kMhcMk',
  'kmlMMk',
  'kX)XMk',
  'kZXZMk',
  'kmlMMk',
  'kmlMMk',
  'kX)XMk',
  'kZXZMk',
  'kmlMMk',
  'kmlMMk',
  'kMMMMk',
  'kVVVVk',
];

export default () => {
  // Laser rail: two beams (a pale pink core in a deep pink glow) over a low chrome track.
  const beam = (x, y) => (y === 1 || y === 5 ? ((x * 5 + y) % 7 === 0 ? 'O' : ')') : y === 0 || y === 2 || y === 4 || y === 6 ? 'Z' : null);
  const rail = grid(16, 10, (x, y) => beam(x, y) ?? (y === 8 ? (x % 4 === 0 ? 'c' : 'm') : y === 9 ? 'k' : '.'));
  // Gate frame: an emitter bar with a cyan LED strip, chrome jambs with a pink lens at each beam.
  const frame = (x, y) => (y === 0 || y === 3 ? 'k' : y === 1 ? (x % 3 === 0 ? 'h' : 'c') : y === 2 ? 'm'
    : x < 2 || x > 13 ? (edge(x, 16) ? 'k' : y % 3 === 1 ? 'X' : x < 2 ? 'l' : 'M') : null);
  return {
    // Wireframe mesh: grid lines every 8 px with one diagonal per cell, bright vertices, on the void.
    BREAKOUT_FLOOR: grid(16, 16, (x, y) => {
      const gx = x % 8 === 0, gy = y % 8 === 0;
      if (gx && gy) return 'c';
      if (gx || gy) return 'G';
      if (x % 8 === y % 8) return 'u';
      return '@';
    }),
    BREAKOUT_RAIL: rail,
    BREAKOUT_SIDE: grid(4, 16, (x, y) => (edge(x, 4) ? 'Z' : (y * 3 + x) % 7 === 0 ? 'O' : ')')),
    BREAKOUT_POST: POST,
    BREAKOUT_GATE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y === 7 || y === 8 ? 'c' : y % 2 ? ')' : 'Z')),
    // Powered down: the emitter bar dark, the beams gone but for a dotted ghost line.
    BREAKOUT_GATE_OPEN: grid(16, 10, (x, y) => (y === 0 ? 'k' : y === 1 ? (x % 3 === 0 ? 'G' : 'M') : y === 9 ? 'k' : y === 8 ? 'M'
      : edge(x, 16) ? 'k' : (y === 3 || y === 6) && x % 4 === 2 ? 'Z' : '.')),
    BREAKOUT_GATE_FRONT: grid(16, 20, (x, y) => frame(x, y) ?? (x >= 4 && x < 12 && y >= 6 && y < 15 ? LOCK[y - 6][x - 4]
      : y === 19 ? 'k' : y === 18 ? 'm' : y % 3 === 1 ? ')' : y % 3 === 0 ? 'Z' : '.')),
    BREAKOUT_GATE_FRONT_OPEN: grid(16, 20, (x, y) => frame(x, y) ?? (y === 19 ? 'k' : y === 18 ? 'm' : y % 3 === 1 && x % 4 === 2 ? 'Z' : '.')),
  };
};
