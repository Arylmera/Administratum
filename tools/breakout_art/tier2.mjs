// Ordo Administratum's Menial Pen: a grated iron floor, a low brass-capped rail on iron balusters, a red-latched gate
// with a slate tally board.
const row = (w, f) => Array.from({ length: w }, (_, x) => f(x)).join('');
const grid = (w, h, f) => Array.from({ length: h }, (_, y) => row(w, x => f(x, y)));
const edge = (x, w) => x === 0 || x === w - 1;

export default () => {
  const rail = grid(16, 10, (x, y) => (y < 2 ? 'g' : y === 2 ? 'G' : y === 9 ? 'k' : y === 8 ? 'M' : x % 4 === 1 ? 'm' : x % 4 === 2 ? 'M' : '.'));
  const frame = (x, y) => (y < 2 ? 'g' : y === 2 ? 'G' : x < 2 || x > 13 ? (edge(x, 16) ? 'k' : 'm') : null);
  return {
    BREAKOUT_FLOOR: grid(16, 16, (x, y) => (x % 4 === 0 || y % 4 === 0 ? 'm' : 'M')),
    BREAKOUT_RAIL: rail,
    BREAKOUT_SIDE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y % 4 === 3 ? 'G' : 'g')),
    BREAKOUT_POST: grid(6, 14, (x, y) => (y === 0 ? (edge(x, 6) ? '.' : 'k') : edge(x, 6) ? 'k' : y < 3 ? 'g' : y === 13 ? 'M' : x < 3 ? 'm' : 'M')),
    BREAKOUT_GATE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y === 7 || y === 8 ? 'x' : y % 4 === 3 ? 'G' : 'g')),
    BREAKOUT_GATE_OPEN: rail.map((r, y) => (y === 5 ? row(16, x => (x % 4 === 1 ? 'm' : 'x')) : r)),
    BREAKOUT_GATE_FRONT: grid(16, 20, (x, y) => frame(x, y) ?? (y >= 6 && y <= 11 && x >= 4 && x <= 11
      ? (y === 6 || y === 11 || x === 4 || x === 11 ? 'k' : y > 7 && y < 10 && (x + y) % 3 === 0 ? 'p' : 'n')
      : x % 3 === 1 ? 'm' : '.')),
    BREAKOUT_GATE_FRONT_OPEN: grid(16, 20, (x, y) => frame(x, y) ?? '.'),
  };
};
