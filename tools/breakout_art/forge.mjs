// Ordo Machinum's Servitor Pen: hazard-chevron deck plates, a fence of sagging power cables slung from brass clamps,
// amber-lamped cable pylons, a striped barrier gate bearing the Mechanicus cog.
const row = (w, f) => Array.from({ length: w }, (_, x) => f(x)).join('');
const grid = (w, h, f) => Array.from({ length: h }, (_, y) => row(w, x => f(x, y)));
const edge = (x, w) => x === 0 || x === w - 1;
const hazard = (x, y) => (x + y) % 6 < 3; // diagonal stripe, 3 px wide

// The cog sigil, 10x10 ('h' lit, 'g' brass, 'G' shade, 'n' its hub).
const COG = [
  '....hh....',
  '.h.hggg.G.',
  '..hgggggG.',
  '.hgg..ggG.',
  'hgg.nn.ggG',
  'hgg.nn.ggG',
  '.ggg..ggG.',
  '..gggggG..',
  '.g.GGGG.G.',
  '....GG....',
];

export default () => {
  // Cables: one catenary each, sag 0..2 px over the 16 px span between clamps.
  const sag = x => Math.round(2 * Math.sin((Math.PI * (x - 1)) / 15));
  const rail = grid(16, 10, (x, y) => {
    if (y === 0) return 'm';
    if (y === 1) return 'M';
    if (y === 2) return 'k';
    if (x === 0) return 'k';
    if (x === 1) return y === 9 ? 'k' : 'g';
    const a = 3 + sag(x), b = 6 + sag(x);
    if (y === a) return 'X';
    if (y === a + 1) return 'i';
    if (y === b) return 'x';
    if (y === b + 1) return 'n';
    return '.';
  });
  const frame = (x, y) => (y === 0 ? 'm' : y === 1 ? 'M' : y === 2 ? 'k' : x < 2 || x > 13 ? (edge(x, 16) ? 'k' : x < 2 ? 'g' : 'G') : null);
  return {
    BREAKOUT_FLOOR: grid(16, 16, (x, y) => {
      if (x === 0 || y === 0) return '2';
      if ((x === 2 || x === 14) && (y === 2 || y === 14)) return '3';
      return ((y + Math.abs(x - 7.5) + 0.5) & 7) < 3 ? 'G' : '1';
    }),
    BREAKOUT_RAIL: rail,
    BREAKOUT_SIDE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : (y & 7) === 0 ? (x === 1 ? 'g' : 'G') : x === 1 ? 'm' : 'M')),
    BREAKOUT_POST: grid(6, 14, (x, y) => {
      if (y === 0) return edge(x, 6) ? '.' : 'k';
      if (edge(x, 6)) return 'k';
      if (y < 3) return x === 2 && y === 1 ? 'O' : 'c';
      if (y === 3) return 'k';
      if (y === 13) return 'M';
      if (y === 9 || y === 10) return hazard(x, y) ? 'g' : 'k';
      return x < 3 ? 'm' : 'M';
    }),
    BREAKOUT_GATE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y >= 6 && y <= 9 ? (y === 6 || y === 9 ? 'g' : 'n') : hazard(x, y) ? 'g' : 'k')),
    BREAKOUT_GATE_OPEN: grid(16, 10, (x, y) => (y < 3 ? rail[y][x] : edge(x, 16) ? 'k' : y === 3 || y === 8 ? 'k' : y < 8 ? (hazard(x, y) ? 'g' : 'k') : y === 9 ? 'M' : '.')),
    BREAKOUT_GATE_FRONT: grid(16, 20, (x, y) => frame(x, y) ?? (x >= 3 && x <= 12 && y >= 5 && y <= 14 && COG[y - 5][x - 3] !== '.'
      ? COG[y - 5][x - 3]
      : y >= 16 && y <= 18 ? (hazard(x, y) ? 'g' : 'k') : y === 3 || y === 19 ? 'k' : x === 2 || x === 13 ? 'k' : 'M')),
    BREAKOUT_GATE_FRONT_OPEN: grid(16, 20, (x, y) => frame(x, y) ?? (y === 3 + sag(x) % 2 && x > 1 && x < 14 ? 'X' : '.')),
  };
};
