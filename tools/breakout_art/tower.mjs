// The Arcane Tower's Summoning Circle: warm sandstone flagstones with chalk rings drawn across their joints, a low
// kerb of coursed stone with violet runes glowing in it, rune-stone menhirs at the corners, an oak wicket on gold
// hinges with a chalk ward drawn on it.
const row = (w, f) => Array.from({ length: w }, (_, x) => f(x)).join('');
const grid = (w, h, f) => Array.from({ length: h }, (_, y) => row(w, x => f(x, y)));
const edge = (x, w) => x === 0 || x === w - 1;
const ring = (dx, dy, r) => Math.round(Math.hypot(dx, dy)) === r;

// The rune-stone: a rounded menhir, lit on its left, a violet rune glowing down its face, set in a dark socket.
const POST = [
  '..kk..',
  '.kbPk.',
  'kbbPPk',
  'kbP+Pk',
  'kb+!Pk',
  'kbP+Bk',
  'kbP!Pk',
  'kb+PBk',
  'kbP+Bk',
  'kbPPBk',
  'kPPBBk',
  'kkkkkk',
  'kQQQQk',
  'kWWWWk',
];

export default () => {
  // Kerb: a lit capstone, then two courses of stone blocks in dark mortar, one glowing rune per span, a dark foot.
  const course = (x, y) => {
    const bx = y < 6 ? x : (x + 4) % 16; // running bond
    if (x >= 6 && x <= 8 && y >= 3 && y <= 7) return ['B+B', '+!+', 'B+B', '+B+', 'B+B'][y - 3][x - 6];
    if (y === 5 || bx % 8 === 0) return 'W';
    return bx % 8 === 1 || y === 3 || y === 6 ? 'P' : 'B';
  };
  const cap = y => (y === 0 ? 'b' : y === 1 ? 'P' : 'k');
  const rail = grid(16, 10, (x, y) => (y < 3 ? cap(y) : y === 8 ? 'Q' : y === 9 ? 'k' : course(x, y)));
  // Gate frame: the capstone over two stone jambs, a rune glowing on each.
  const frame = (x, y) => (y < 3 ? cap(y) : x < 2 || x > 13
    ? (edge(x, 16) ? 'k' : (y === 7 || y === 9) ? '+' : y === 8 ? '!' : y === 19 ? 'k' : x < 2 ? 'P' : 'B') : null);
  // Oak leaf: vertical planks, gold strap hinges across it.
  const oak = (x, y) => (y === 6 || y === 15 ? (x % 4 === 3 ? 'h' : 'g') : x % 4 === 0 ? 'W' : x % 4 === 1 ? 'L' : 'w');
  // Flagstones: 16x8 and 10+6 slabs in a broken bond, dark mortar, a lit lip; chalk rings centred on the tile corners
  // so each ring spans four tiles, with a chalk dot at every ring's heart.
  const floor = (x, y) => {
    const dx = Math.min(x, 16 - x), dy = Math.min(y, 16 - y);
    if (ring(dx, dy, 6) || (dx + dy <= 1 && dx * dy === 0)) return (x * 3 + y) % 7 === 0 ? 'b' : 'p';
    const sx = y < 8 ? x : (x + 10) % 16, lx = y < 8 ? sx : sx % 10, ly = y % 8;
    if (ly === 7 || (y >= 8 && (sx === 9 || sx === 15))) return 'W';
    if (ly === 0 || lx === 0) return 'B';
    return (x * 5 + y * 7) % 11 === 0 ? 'B' : 'Q';
  };
  return {
    BREAKOUT_FLOOR: grid(16, 16, floor),
    BREAKOUT_RAIL: rail,
    BREAKOUT_SIDE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y % 8 === 7 ? 'W' : y % 8 === 3 && x === 2 ? '+' : x === 1 ? 'b' : 'P')),
    BREAKOUT_POST: POST,
    BREAKOUT_GATE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y === 3 || y === 12 ? 'g' : y === 7 || y === 8 ? 'p' : x === 1 ? 'L' : 'w')),
    BREAKOUT_GATE_OPEN: grid(16, 10, (x, y) => (y < 3 ? cap(y) : edge(x, 16) || y === 9 ? 'k' : y === 4 || y === 7 ? 'g' : oak(x, 1))),
    BREAKOUT_GATE_FRONT: grid(16, 20, (x, y) => frame(x, y) ?? (y === 19 ? 'k' : y === 18 ? 'W'
      : ring(x - 7.5, y - 10.5, 4) || (x >= 7 && x <= 8 && y >= 10 && y <= 11) ? 'p' : oak(x, y))),
    // open: the doorway, a chalk sill drawn across the threshold
    BREAKOUT_GATE_FRONT_OPEN: grid(16, 20, (x, y) => frame(x, y) ?? (y === 19 ? 'k' : y === 18 && x % 2 ? 'p' : '.')),
  };
};
