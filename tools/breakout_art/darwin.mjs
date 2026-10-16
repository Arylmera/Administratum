// Darwin's Monkey House: straw over a plank floor, a bamboo fence of lashed canes, thick bamboo posts with a twine
// binding and a coconut cap, and a gate knocked together from banana crates under a placard with a banana on it, lit
// while the monkeys are shut in, dark when the gate stands open.
const row = (w, f) => Array.from({ length: w }, (_, x) => f(x)).join('');
const grid = (w, h, f) => Array.from({ length: h }, (_, y) => row(w, x => f(x, y)));
const edge = (x, w) => x === 0 || x === w - 1;
// A cane: lit edge, body, shade; a node (G) every 5 rows, offset per cane.
const cane = (x, y, i) => ((y + 2 * i) % 5 === 0 ? 'G' : x === 0 ? 'h' : x === 1 ? 'g' : 'G');

// The post: a thick cane under a coconut, nodes, a twine binding (W/w) where the rails meet it.
const POST = [
  '.kkkk.',
  'kWwwWk',
  'kwWWwk',
  'khggGk',
  'kGGGGk',
  'khggGk',
  'kWwWwk',
  'khggGk',
  'khggGk',
  'kGGGGk',
  'khggGk',
  'kWwWwk',
  'khggGk',
  'kkkkkk',
];

// The placard's banana (x 2..13 of rows 1..5).
const BANANA = [' #        # ', ' ##      ## ', '  ########  ', '   ######   ', '     #      '];

export default () => {
  // The fence from the front: canes three px apart, two lashed rails (L/w) at rows 2 and 6, a dark foot.
  const rail = grid(16, 10, (x, y) => (y === 9 ? 'k' : y === 2 || y === 6 ? (x % 3 === 1 ? 'W' : 'L') : y === 3 || y === 7 ? 'w'
    : x % 3 === 2 ? 'k' : cane(x % 3, y, Math.floor(x / 3))));
  // The placard (lit banana or dark) over bamboo jambs.
  const frame = (bg, ink) => (x, y) => (y === 0 || y === 6 ? 'k' : y < 6 ? (edge(x, 16) ? 'k' : BANANA[y - 1][x - 2] === '#' ? ink : bg)
    : x < 2 || x > 13 ? (edge(x, 16) ? 'k' : cane(x === 1 ? 0 : 2, y, x < 2 ? 0 : 1)) : y === 19 ? 'k' : null);
  return {
    // Planks under loose straw: walnut boards (w, W seams every 4 rows), straw strokes (o, f) scattered across them.
    BREAKOUT_FLOOR: grid(16, 16, (x, y) => {
      const d = (x - y + 16) % 16, a = (x + y) % 16; // straw: short strokes along both diagonals
      if ((d === 3 && a < 6) || (d === 11 && a > 9)) return 'o';
      if ((a === 5 && d > 6 && d < 10) || (a === 13 && d < 3)) return 'f';
      return y % 4 === 3 ? 'W' : (x + (y >> 2) * 5) % 16 === 0 ? 'W' : 'w';
    }),
    BREAKOUT_RAIL: rail,
    // The fence from above: the canes' cut tops in a row, the lashing every 8 px.
    BREAKOUT_SIDE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y % 8 === 0 ? 'W' : y % 3 === 0 ? 'k' : x === 1 ? 'h' : 'g')),
    BREAKOUT_POST: POST,
    // The crate gate shut, from above: its top plank, a banana-yellow band where the two crates meet.
    BREAKOUT_GATE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y === 7 || y === 8 ? 'o' : y % 4 === 0 ? 'W' : x === 1 ? 'L' : 'w')),
    // Swung open: the crate leaf edge-on beside the frame, its slats and a stencilled banana.
    BREAKOUT_GATE_OPEN: grid(16, 10, (x, y) => (y === 0 ? 'L' : y === 1 ? 'w' : y === 2 || y === 9 ? 'k' : edge(x, 16) ? 'k'
      : y >= 4 && y <= 6 && x >= 6 && x <= 9 ? (y === 5 || x === 7 || x === 8 ? 'o' : 'w') : y % 3 === 0 ? 'W' : x === 1 ? 'L' : 'w')),
    // The gate: the lit banana placard, two banana crates stacked as the leaf (slats, a stencilled banana), its rope latch.
    BREAKOUT_GATE_FRONT: grid(16, 20, (x, y) => frame('W', 'o')(x, y) ?? (y === 18 ? 'W'
      : y === 12 ? 'k' : y >= 9 && y <= 10 && x >= 5 && x <= 10 ? ((x + y) % 2 ? 'o' : 'f')
      : y >= 14 && y <= 15 && x >= 6 && x <= 9 ? 'o' : x === 2 ? 'L' : x === 13 ? 'W' : y % 3 === 1 ? 'W' : x === 11 && y === 13 ? 'f' : 'w')),
    // Open: the placard dark, the doorway clear.
    BREAKOUT_GATE_FRONT_OPEN: grid(16, 20, (x, y) => frame('e', 'G')(x, y) ?? '.'),
  };
};
