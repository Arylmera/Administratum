// Green Code's Construct: the loading program's bare white void (a faint dotted grid, nothing else), floating white
// light-bar rails on thin struts, white monolith posts with a blinking green cursor, and a plain white door that
// opens onto green code rain, the one place the black-and-green world shows through.
const row = (w, f) => Array.from({ length: w }, (_, x) => f(x)).join('');
const grid = (w, h, f) => Array.from({ length: h }, (_, y) => row(w, x => f(x, y)));
const edge = (x, w) => x === 0 || x === w - 1;

// Code rain: falling columns, a bright head, a fading trail, black between.
const rain = (x, y) => {
  const head = [0, 0, 9, 0, 3, 0, 14, 0, 6, 0, 1, 0, 11, 0][x] ?? 0, t = (y - head + 32) % 16;
  return x % 2 ? 'n' : t === 0 ? 'O' : t < 3 ? 'c' : t < 6 ? 'x' : t < 8 ? 'C' : 'n';
};

// White monolith: a glinting cap, soft shading down the east face, a green cursor near the top, outlined.
const POST = [
  '.kkkk.',
  'kOOppk',
  'kpppbk',
  'kpcpbk',
  'kpppbk',
  'kpppbk',
  'kpppbk',
  'kpppbk',
  'kpppbk',
  'kpppbk',
  'kpppbk',
  'kpppbk',
  'kbbbqk',
  'kqqqqk',
];

export default () => {
  // Door frame: a white header and jambs, outlined, a soft-grey threshold.
  const frame = (x, y) => (y === 0 ? 'k' : y === 1 ? 'O' : y === 2 ? 'p' : y === 3 ? 'k'
    : x < 2 || x > 13 ? (edge(x, 16) ? 'k' : x < 2 ? 'p' : 'b') : y === 19 ? 'k' : null);
  return {
    // The void: bare white, a faint loading grid dot every 8 px.
    BREAKOUT_FLOOR: grid(16, 16, (x, y) => (x % 8 === 4 && y % 8 === 4 ? 'b' : 'p')),
    // A floating bar of white light: glint, body, soft underside, then thin struts down to a dark base line.
    BREAKOUT_RAIL: grid(16, 10, (x, y) => (y === 0 ? 'O' : y < 3 ? 'p' : y === 3 ? 'b' : y === 4 ? 'k' : y === 9 ? 'k'
      : x % 8 === 3 ? 'p' : x % 8 === 4 ? 'q' : '.')),
    // The bar from above: outlined, a glint line, a seam every 8 px.
    BREAKOUT_SIDE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y % 8 === 7 ? 'b' : x === 1 ? 'O' : 'p')),
    BREAKOUT_POST: POST,
    // The closed door from above: a white leaf, a green keyhole light.
    BREAKOUT_GATE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y === 7 || y === 8 ? 'c' : x === 1 ? 'O' : 'b')),
    // Swung open: the leaf folded back against the jamb, green code spilling across the threshold.
    BREAKOUT_GATE_OPEN: grid(16, 10, (x, y) => (y === 9 ? 'k' : x >= 12 ? (edge(x, 16) || x === 12 ? 'k' : x === 13 ? 'O' : 'b')
      : y === 0 || y === 8 ? (x % 3 === 1 ? 'c' : 'C') : '.')),
    // A plain white door: two recessed panels, a green-lit keyhole.
    BREAKOUT_GATE_FRONT: grid(16, 20, (x, y) => frame(x, y) ?? (x === 12 && y === 11 ? 'c'
      : x >= 4 && x <= 10 && (y >= 5 && y <= 9 || y >= 12 && y <= 17)
        ? (x === 4 || y === 5 || y === 12 ? 'q' : x === 10 || y === 9 || y === 17 ? 'O' : 'p')
        : 'p')),
    // Open: through the doorway, the black-and-green code world.
    BREAKOUT_GATE_FRONT_OPEN: grid(16, 20, (x, y) => frame(x, y) ?? rain(x, y)),
  };
};
