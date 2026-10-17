// Darwin's Monkey House, the laboratory's cage room: black-and-white tiles strewn with straw, iron cage bars between
// two rails, iron posts under brass finials, and a barred cage gate under an enamel plate with a banana on it, lit
// while the monkeys are shut in, dark when the gate stands open.
const row = (w, f) => Array.from({ length: w }, (_, x) => f(x)).join('');
const grid = (w, h, f) => Array.from({ length: h }, (_, y) => row(w, x => f(x, y)));
const edge = (x, w) => x === 0 || x === w - 1;
// An iron bar seen from the front, 2 px: lit left, shaded right; a bar every 4 px (x % 4 === 1, 2).
const bar = x => (x % 4 === 1 ? 'l' : x % 4 === 2 ? 'm' : null);

// The post: a brass finial ball, an iron shaft with a brass collar where the rails meet it, a foot.
const POST = [
  '..kk..',
  '.khgk.',
  '.kgGk.',
  '..kk..',
  '.klmk.',
  'khggGk',
  '.klmk.',
  '.klmk.',
  '.klmk.',
  '.klmk.',
  'khggGk',
  '.klmk.',
  'klmmMk',
  'kkkkkk',
];

// The plate's banana (x 2..13 of rows 1..5).
const BANANA = [' #        # ', ' ##      ## ', '  ########  ', '   ######   ', '     #      '];

export default () => {
  // The cage from the front: iron bars between a top rail (row 1) and a bottom rail (row 7), the floor tiles showing
  // between them, a dark foot.
  const rail = grid(16, 10, (x, y) => (y === 9 ? 'k' : y === 0 || y === 8 ? (x % 4 === 1 || x % 4 === 2 ? 'k' : '.')
    : y === 1 || y === 7 ? (y === 1 ? 'l' : 'm') : y === 2 ? 'M' : bar(x) ?? '.'));
  // The enamel plate (lit banana or dark) over iron jambs.
  const frame = (bg, ink, rim) => (x, y) => (y === 0 || y === 6 ? 'k' : y < 6 ? (edge(x, 16) ? 'k' : x === 1 || x === 14 ? rim
    : BANANA[y - 1][x - 2] === '#' ? ink : bg)
    : x < 2 || x > 13 ? (edge(x, 16) ? 'k' : x === 1 || x === 14 ? 'l' : 'M') : y === 19 ? 'k' : null);
  return {
    // Black-and-white tiles, 8 px, under loose straw (short strokes along both diagonals).
    BREAKOUT_FLOOR: grid(16, 16, (x, y) => {
      const d = (x - y + 16) % 16, a = (x + y) % 16;
      if ((d === 3 && a < 6) || (d === 11 && a > 9)) return 'h';
      if ((a === 5 && d > 6 && d < 10) || (a === 13 && d < 3)) return 'g';
      const white = ((x >> 3) + (y >> 3)) % 2 === 0;
      if (x % 8 === 7 || y % 8 === 7) return white ? 'P' : 'M'; // grout
      return white ? (x % 8 === 0 || y % 8 === 0 ? 'p' : 'b') : 'm';
    }),
    BREAKOUT_RAIL: rail,
    // The cage from above: the top rail, the bars' cut tops every 4 px.
    BREAKOUT_SIDE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y % 4 === 1 ? 'l' : y % 4 === 2 ? 'k' : x === 1 ? 'm' : 'M')),
    BREAKOUT_POST: POST,
    // The gate shut, from above: the iron leaf, a brass lock box across its middle.
    BREAKOUT_GATE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y === 7 || y === 8 ? (y === 7 ? 'h' : 'g') : y % 4 === 1 ? 'l' : x === 1 ? 'm' : 'M')),
    // Swung open: the barred leaf seen edge-on beside the frame, its brass lock box.
    BREAKOUT_GATE_OPEN: grid(16, 10, (x, y) => (y === 0 ? 'l' : y === 1 ? 'm' : y === 2 || y === 9 ? 'k' : edge(x, 16) ? 'k'
      : y >= 4 && y <= 6 && x >= 6 && x <= 9 ? (y === 4 ? 'h' : y === 6 ? 'G' : x === 7 ? 'k' : 'g') : y === 8 ? 'm' : bar(x) ?? 'M')),
    // The gate: the banana plate lit, a barred leaf between rails, a brass lock box and its keyhole.
    BREAKOUT_GATE_FRONT: grid(16, 20, (x, y) => frame('p', 'f', 'g')(x, y) ?? (y === 18 ? 'M' : y === 7 || y === 17 ? (y === 7 ? 'l' : 'm')
      : y >= 11 && y <= 13 && x >= 6 && x <= 9 ? (y === 11 ? 'h' : y === 13 ? 'G' : x === 7 ? 'k' : 'g')
      : bar(x) ?? 'e')),
    // Open: the plate dark, the doorway clear.
    BREAKOUT_GATE_FRONT_OPEN: grid(16, 20, (x, y) => frame('B', 'P', 'G')(x, y) ?? '.'),
  };
};
