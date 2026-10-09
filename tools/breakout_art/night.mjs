// Ordo Malleus' Warded Circle: slate flagstones each inlaid with a hexagrammic ward in blue, a silver warding bar hung
// with red-waxed purity seals, witch-candle posts burning pale violet on silver stands, a gate sealed by the hexagram.
const row = (w, f) => Array.from({ length: w }, (_, x) => f(x)).join('');
const grid = (w, h, f) => Array.from({ length: h }, (_, y) => row(w, x => f(x, y)));
const edge = (x, w) => x === 0 || x === w - 1;

// The hexagram around (cx, cy), radius r, drawn as two pixel triangles: 'tip' on its six points, 'line' on its edges.
const hexagram = (cx, cy, r) => {
  const h = Math.round(r / 2), hw = Math.round((r * Math.sqrt(3)) / 2);
  const tri = (apex, base, x, y) => {
    const d = (y - apex) / (base - apex); // 0 at the apex, 1 at the base
    if (d < 0 || d > 1) return null;
    if (y === base) return Math.abs(x - cx) <= hw ? 'line' : null;
    return Math.abs(x - cx) === Math.round(d * hw) ? (d === 0 ? 'tip' : 'line') : null;
  };
  return (x, y) => (Math.abs(y - cy) === h && Math.abs(x - cx) === hw ? 'tip' : tri(cy - r, cy + h, x, y) ?? tri(cy + r, cy - h, x, y));
};

// A purity seal, 4 wide: red wax disc over a parchment strip with a torn end.
const SEAL = ['.((.', '()(.', '.((.', '.pP.', '.pP.', '.pP.', '..P.'];

// The witch-candle post: a pale violet flame on an ivory candle, a silver drip-pan and stand.
const POST = [
  '...F..',
  '..fF..',
  '..fFf.',
  '.kFFk.',
  '.kppk.',
  '.kpPk.',
  'khhgGk',
  '.kgGk.',
  '..gG..',
  '.kgGk.',
  '.kgGk.',
  'khggGk',
  'kGGGGk',
  'kMMMMk',
];

export default () => {
  // Warding bar: a lit silver bar over a low silver chain bar, one purity seal hung between them per span.
  const bar = y => (y === 0 ? 'h' : y === 1 ? 'g' : y === 2 ? 'G' : 'k');
  const rail = grid(16, 10, (x, y) => (y < 4 ? bar(y) : y === 8 ? (x % 2 ? 'G' : 'g') : y === 9 ? 'k'
    : x >= 6 && x < 10 ? SEAL[y - 4][x - 6] : '.'));
  const frame = (x, y) => (y < 4 ? bar(y) : x < 2 || x > 13 ? (edge(x, 16) ? 'k' : x < 2 ? 'g' : 'G') : null);
  const floorWard = hexagram(8, 8, 7);
  const doorWard = hexagram(8, 10, 5);
  const ward = (w, x, y) => ({ tip: '+', line: '!' })[w(x, y)];
  return {
    BREAKOUT_FLOOR: grid(16, 16, (x, y) => (x === 0 || y === 0 ? 'E' : ward(floorWard, x, y) ?? ((x * 7 + y * 3) % 11 === 0 ? 'D' : 'N'))),
    BREAKOUT_RAIL: rail,
    BREAKOUT_SIDE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y % 8 === 3 ? '(' : y % 8 === 4 ? ')' : x === 1 ? 'h' : 'g')),
    BREAKOUT_POST: POST,
    BREAKOUT_GATE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y === 7 || y === 8 ? '+' : y === 6 || y === 9 ? '!' : y % 4 === 3 ? 'G' : 'g')),
    BREAKOUT_GATE_OPEN: grid(16, 10, (x, y) => (y < 4 ? bar(y) : edge(x, 16) || y === 9 ? 'k' : y === 8 ? 'G'
      : (y === 5 || y === 6) && x % 4 === 2 ? '+' : (y === 5 || y === 6) && x % 4 !== 0 ? '!' : 'D')),
    BREAKOUT_GATE_FRONT: grid(16, 20, (x, y) => frame(x, y) ?? (y === 19 ? 'k' : y === 18 ? 'G'
      : x === 2 || x === 13 ? 'k' : ward(doorWard, x, y) ?? 'D')),
    BREAKOUT_GATE_FRONT_OPEN: grid(16, 20, (x, y) => frame(x, y) ?? (x >= 6 && x < 10 && y < 11 ? SEAL[y - 4]?.[x - 6] ?? '.' : '.')),
  };
};
