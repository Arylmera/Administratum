// Vault 111's Test Chamber: white lab tiles with a yellow test-grid cross, Vault-Tec blue riveted frames holding dark
// observation glass over a yellow kick band, blue columns with a red "in progress" lamp, and a blue bulkhead under a
// red TEST placard lit while the experiment runs, dark when the door stands open.
const row = (w, f) => Array.from({ length: w }, (_, x) => f(x)).join('');
const grid = (w, h, f) => Array.from({ length: h }, (_, y) => row(w, x => f(x, y)));
const edge = (x, w) => x === 0 || x === w - 1;
const glass = (x, y) => ((x - y + 32) % 9 === 0 ? 'b' : (x - y + 32) % 9 === 1 ? 'l' : 'N'); // dark pane, a glint

// Vault-Tec column: a red test lamp on a yellow cap, riveted blue steel, a yellow band, a steel foot.
const POST = [
  '..kk..',
  '.kaak.',
  'khggGk',
  'kRrrdk',
  'kRlrdk',
  'kRrrdk',
  'khggGk',
  'kGGGGk',
  'kRrrdk',
  'kRlrdk',
  'kRrrdk',
  'klmmMk',
  'kMMMVk',
  'kkkkkk',
];

// TEST in 3x5 letters, 1 px apart (x 0..14 of the placard).
const TEST = ['### ### ### ###', ' #  #   #    # ', ' #  ##  ###  # ', ' #  #     #  # ', ' #  ### ###  # '];

export default () => {
  // Observation window: a blue frame cap, the dark pane, a riveted steel sill, a yellow kick band, a dark foot.
  const rail = grid(16, 10, (x, y) => (y === 0 ? 'R' : y === 1 ? 'r' : y === 2 ? 'd' : y < 6 ? (x === 0 ? 'd' : glass(x, y))
    : y === 6 ? (x % 4 === 2 ? 'l' : 'm') : y === 7 ? 'g' : y === 8 ? 'G' : 'k'));
  // Placard (lit or dark) over blue jambs.
  const frame = (bg, ink) => (x, y) => (y === 0 || y === 6 ? 'k' : y < 6 ? (TEST[y - 1][x] === '#' ? ink : bg)
    : x < 2 || x > 13 ? (edge(x, 16) ? 'k' : y === 13 ? 'g' : x < 2 ? 'R' : 'd') : y === 19 ? 'k' : null);
  return {
    // White lab tiles, 8 px, grey grout; a yellow test-grid cross where four floor tiles meet.
    BREAKOUT_FLOOR: grid(16, 16, (x, y) => {
      const dx = Math.min(x, 16 - x), dy = Math.min(y, 16 - y);
      if ((dx === 0 && dy <= 2) || (dy === 0 && dx <= 2)) return 'g';
      return x % 8 === 0 || y % 8 === 0 ? 'B' : (x % 8 === 1 || y % 8 === 1) ? 'l' : 'b';
    }),
    BREAKOUT_RAIL: rail,
    // The window from above: a blue frame round a thin glass core, a riveted mullion every 8 px.
    BREAKOUT_SIDE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y % 8 === 0 ? (x === 1 ? 'l' : 'r') : x === 1 ? 'R' : glass(x, y))),
    BREAKOUT_POST: POST,
    // Closed bulkhead from above: a blue leaf with a yellow stripe across its middle.
    BREAKOUT_GATE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y === 7 || y === 8 ? 'g' : y % 5 === 2 && x === 2 ? 'l' : x === 1 ? 'R' : 'r')),
    // Swung open: the blue leaf seen edge-on beside the frame, its porthole and yellow stripe.
    BREAKOUT_GATE_OPEN: grid(16, 10, (x, y) => (y === 0 ? 'R' : y === 1 ? 'r' : y === 2 || y === 9 ? 'k' : edge(x, 16) ? 'k'
      : y >= 4 && y <= 5 && x >= 6 && x <= 9 ? glass(x, y) : y === 7 ? 'g' : x === 1 ? 'R' : 'r')),
    // The bulkhead: a red TEST placard lit up, a blue leaf with a riveted porthole and a yellow band.
    BREAKOUT_GATE_FRONT: grid(16, 20, (x, y) => frame('x', 'F')(x, y) ?? (y === 18 ? 'd'
      : y >= 8 && y <= 12 && x >= 5 && x <= 10 ? (y === 8 || y === 12 || x === 5 || x === 10 ? 'm' : glass(x, y))
      : y === 15 || y === 16 ? (y === 15 ? 'g' : 'G') : x === 2 ? 'R' : x === 13 ? 'd' : x % 5 === 1 && y % 6 === 1 ? 'l' : 'r')),
    // Open: the placard dark, the doorway clear.
    BREAKOUT_GATE_FRONT_OPEN: grid(16, 20, (x, y) => frame('U', 'G')(x, y) ?? '.'),
  };
};
