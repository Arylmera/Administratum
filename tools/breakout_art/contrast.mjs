// Ordo Hereticus' Penitent Cage: worn sandstone flagstones in black mortar, a cage of iron bars under a red-leaded
// crossbar studded with gold rivets, spiked iron posts, a barred gate with a red-bound tome chained across it.
const row = (w, f) => Array.from({ length: w }, (_, x) => f(x)).join('');
const grid = (w, h, f) => Array.from({ length: h }, (_, y) => row(w, x => f(x, y)));
const edge = (x, w) => x === 0 || x === w - 1;

// The chained tome, 8x9: red leather with a lit spine edge, gold corner bosses and clasp, the page block on the right.
const TOME = [
  'kkkkkkkk',
  'kgRRRRgk',
  'kRrrrrpk',
  'kRrggrpk',
  'kRrgUgpk',
  'kRrggrpk',
  'kRrrrrPk',
  'kgddddgk',
  'kkkkkkkk',
];

// The spiked iron post: a gold spike, a red-leaded collar, an iron shaft with a gold band, a red foot.
const POST = [
  '..kk..',
  '..hG..',
  '.khGk.',
  'kRrrdk',
  'kkkkkk',
  'klmmMk',
  'klmmMk',
  'kgGGUk',
  'klmmMk',
  'klmmMk',
  'klmmMk',
  'kRrrdk',
  'kkkkkk',
  'kMMMMk',
];

export default () => {
  // Crossbar: red-leaded iron with gold rivets every fourth pixel, a black underside.
  const cap = (x, y) => (y === 0 ? 'R' : y === 1 ? (x % 4 === 2 ? 'g' : 'r') : 'k');
  // Bars: two-pixel iron bars (lit left, shaded right) on a three-pixel pitch, threaded through a lower bar.
  const bars = (x, y) => (y === 8 ? 'M' : y === 9 ? 'k' : x % 3 === 1 ? 'l' : x % 3 === 2 ? 'M' : '.');
  const rail = grid(16, 10, (x, y) => (y < 3 ? cap(x, y) : bars(x, y)));
  // Gate frame: the crossbar over two iron jambs.
  const frame = (x, y) => (y < 3 ? cap(x, y) : x < 2 || x > 13 ? (edge(x, 16) ? 'k' : x < 2 ? 'l' : 'M') : null);
  const chain = (x, y) => (x + y) % 2 ? 'l' : 'M';
  // Flagstones: 8x8 slabs in running bond, lit on their top-left lip, a crack in some, black mortar between.
  const floor = (x, y) => {
    const sx = y < 8 ? x : (x + 4) % 16, lx = sx % 8, ly = y % 8, slab = (sx >> 3) + 2 * (y >> 3);
    if (lx === 0 || ly === 0) return 'k';
    if (lx === 1 || ly === 1) return 'B';
    if (slab === 1 && lx === ly + 1 && ly > 2 && ly < 6) return 'U'; // a crack
    if (slab === 2 && ly === 5 && lx > 2 && lx < 6) return 'U';
    return (x * 5 + y * 3) % 13 === 0 ? 'q' : 'Q';
  };
  return {
    BREAKOUT_FLOOR: grid(16, 16, floor),
    BREAKOUT_RAIL: rail,
    BREAKOUT_SIDE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : x === 1 ? (y % 4 === 2 ? 'g' : 'R') : 'r')),
    BREAKOUT_POST: POST,
    BREAKOUT_GATE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y >= 5 && y <= 10 ? (y === 5 || y === 10 ? 'k' : y === 7 || y === 8 ? 'g' : x === 1 ? 'R' : 'r')
      : y === 3 || y === 4 || y === 11 || y === 12 ? chain(x, y) : x === 1 ? 'l' : 'm')),
    BREAKOUT_GATE_OPEN: grid(16, 10, (x, y) => (y < 3 ? cap(x, y) : edge(x, 16) ? 'k' : bars(x, y))),
    BREAKOUT_GATE_FRONT: grid(16, 20, (x, y) => frame(x, y) ?? (x >= 4 && x <= 11 && y >= 8 && y <= 16 ? TOME[y - 8][x - 4]
      // two chains from the crossbar's corners down to the tome's top corners
      : (y >= 3 && y <= 7 && (x === y - 1 || x === 16 - y)) ? chain(x, y)
      : y === 18 ? 'M' : y === 19 ? 'k' : x % 3 === 1 ? 'l' : x % 3 === 2 ? 'M' : '.')),
    // open: the doorway, the broken chain hanging from the crossbar
    BREAKOUT_GATE_FRONT_OPEN: grid(16, 20, (x, y) => frame(x, y) ?? ((x === 3 && y < 9) || (x === 12 && y < 7) ? chain(x, y) : '.')),
  };
};
