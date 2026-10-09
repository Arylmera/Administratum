// Rain City's Back Alley: wet asphalt with a rain-ruffled puddle holding the sign's amber glow, a chain-link fence
// on galvanised pipe, galvanised posts with a rain cap, and a chain-link gate under a flickering neon OUT sign (one
// letter guttering while it is shut, the whole sign lit when it swings open).
const row = (w, f) => Array.from({ length: w }, (_, x) => f(x)).join('');
const grid = (w, h, f) => Array.from({ length: h }, (_, y) => row(w, x => f(x, y)));
const edge = (x, w) => x === 0 || x === w - 1;
const mesh = (x, y) => ((x + y) % 4 === 0 || (x - y + 64) % 4 === 0 ? 'l' : '.'); // chain-link diamonds, 4 px

// "OUT" in neon tubes, 11x5; the U is the guttering letter.
const OUT = ['###.#.#.###', '#.#.#.#..#.', '#.#.#.#..#.', '#.#.#.#..#.', '###.###..#.'];
const sign = (dim) => (x, y) => {
  if (y > 6) return null;
  if (y === 0 || y === 6 || edge(x, 16)) return 'k';
  const ch = x >= 3 && x <= 13 ? OUT[y - 1][x - 3] : '.';
  return ch === '#' ? (dim && x >= 7 && x <= 9 ? 'i' : 'x') : 'n';
};

// Galvanised post: a domed rain cap, two fence clamps, a dark foot.
const POST = [
  '.kkkk.',
  'kpllmk',
  'kllmMk',
  'kkkkkk',
  'klmmMk',
  'kBBBBk',
  'klmmMk',
  'klmmMk',
  'klmmMk',
  'kBBBBk',
  'klmmMk',
  'klmmMk',
  'kmmMMk',
  'kVVVVk',
];

export default () => {
  // Gate leaf in its pipe jambs: a top pipe, the mesh, a bottom pipe.
  const jambs = (x, y) => (x < 2 || x > 13 ? (edge(x, 16) ? 'k' : x < 2 ? 'l' : 'm') : y === 19 ? 'k' : y === 18 ? 'm' : null);
  return {
    // Wet asphalt: dark aggregate, a crack, a puddle (deep blue) with a rain ring and a streak of amber sign-glow.
    BREAKOUT_FLOOR: grid(16, 16, (x, y) => {
      const dx = (x - 9.5) / 4.6, dy = (y - 10.5) / 2.8, d = dx * dx + dy * dy;
      if (d < 1) {
        if (Math.abs(d - 0.35) < 0.12 && x !== 9) return 'L'; // ripple ring
        if (x === 9 && y >= 9 && y <= 12) return y === 10 ? 'X' : 'Z'; // reflection
        return 'u';
      }
      if (d < 1.35) return 'W'; // wet dark rim
      if ((x === 3 && y < 5) || (x === 4 && y >= 4 && y < 7) || (y === 2 && x >= 1 && x < 3)) return 'W'; // crack
      const n = (x * 7 + y * 13 + x * x * y) % 11;
      return n === 0 ? 'R' : n === 5 ? 'L' : n < 4 ? 'w' : 'r';
    }),
    // Chain-link fence: galvanised top pipe, the mesh, a tension wire.
    BREAKOUT_RAIL: grid(16, 10, (x, y) => (y === 0 ? 'p' : y === 1 ? 'l' : y === 8 ? 'm' : y === 9 ? 'k' : mesh(x, y))),
    // The top pipe from above, a tie clip every 8 px.
    BREAKOUT_SIDE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y % 8 === 3 ? 'B' : x === 1 ? 'p' : 'l')),
    BREAKOUT_POST: POST,
    // Shut from above: the leaf's top pipe, a chain and padlock wrapped round it.
    BREAKOUT_GATE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y >= 6 && y <= 9 ? (y === 7 || y === 8 ? 'X' : 'Z') : x === 1 ? 'p' : 'l')),
    // Swung open: the leaf folded back against the hinge jamb, the chain hanging loose on it.
    BREAKOUT_GATE_OPEN: grid(16, 10, (x, y) => (y === 9 ? 'k' : x >= 12 ? (edge(x, 16) || x === 12 ? 'k' : x === 13 ? 'p' : y === 4 ? 'Z' : 'l')
      : y === 0 || y === 8 ? 'm' : '.')),
    // The chain-link gate shut with a padlocked chain, the OUT sign above it with its U guttering.
    BREAKOUT_GATE_FRONT: grid(16, 20, (x, y) => sign(true)(x, y) ?? jambs(x, y) ?? (y === 7 ? 'p' : y === 8 ? 'l'
      : (x === 7 || x === 8) && y >= 12 && y <= 14 ? (y === 13 ? 'X' : 'Z') : mesh(x, y))),
    // Open: the doorway clear between the jambs, the sign fully lit.
    BREAKOUT_GATE_FRONT_OPEN: grid(16, 20, (x, y) => sign(false)(x, y) ?? jambs(x, y) ?? (y === 7 ? 'm' : '.')),
  };
};
