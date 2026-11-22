// Shared sizes and the beacon's shape for the department's main lamp (tools/cimain_art.mjs). Frames are rows of key.gpl
// chars, '.' clear. Art px; the hall draws it 7 x 14 logical (ui/cilamp.js MAIN_SIZE), larger than the scribe's CILAMP
// (5 x 10) and another shape, so the two never read as the same thing. The blink swaps `amber` and `amber_dim`.
export const W = 14, H = 28;
export const NAMES = ['CIMAIN.off', 'CIMAIN.amber', 'CIMAIN.amber_dim', 'CIMAIN.green', 'CIMAIN.red'];
export const SIZES = Object.fromEntries(NAMES.map(n => [n, [W, H]]));
// Foot (where it stands, bottom centre) and lens (its centre, where a light would sit), art px from the frame's top-left.
export const ANCHORS = { CIMAIN: { foot: [7, 28], lens: [7, 6] } };

// A beacon on a short post: a domed cap with a finial, a wide lantern with cage bars either side of one big lens
// (L main, H glint, S shade; the lens columns 4..9, rows 3..8), a collar, a thick banded post, a stepped plinth.
// lit: the lens chars [L, H, S] of a frame; housing, post and plinth in the iron slots (l m M V), k outline.
const SHAPE = [
  '......kk......',
  '....kkllkk....',
  '..kkllmmmmkk..',
  'kkmkMLLLLMkmkk',
  'kmlkLHHLLSkMmk',
  'kmlkLHLLLSkMmk',
  'kmlkLLLLLSkMmk',
  'kmlkLLLLSSkMmk',
  'kkmkMSSSSMkmkk',
  '.kkmmmmmmmMkk.',
  '..kVVVVVVVVk..',
  '...kkmlmMkk...',
  '....kmlmMk....',
  '....kmlmMk....',
  '....kmlmMk....',
  '....kmlmMk....',
  '...kkllmMMk...',
  '...kVVVVVVk...',
  '....kmlmMk....',
  '....kmlmMk....',
  '....kmlmMk....',
  '....kmlmMk....',
  '...kkmmmMkk...',
  '..kmllllmMMk..',
  '..kmmmmmmMMk..',
  '.kmllllllmMMk.',
  'kmmmmmmmmmmMMk',
  'kkkkkkkkkkkkkk',
];
// The lens's inner 4 x 4 block (columns 5..8, rows 4..7: every world's lens block, see frames()) per verdict, so pass and
// fail read without colour (a red/green colour-blind user): a pass a whole bright lens with a check cut in it (the
// glint char), a fail a dark X (k), unlit a flat dark glass; running keeps its own lens (glint and shade) and its blink.
// Each takes the frame's lens chars: main, glint.
export const INNER = {
  green: (L, Hi) => [L + L + L + L, L + L + L + Hi, Hi + L + Hi + L, L + Hi + L + L],
  red: L => ['k' + L + L + 'k', L + 'kk' + L, L + 'kk' + L, 'k' + L + L + 'k'],
  off: L => [L + L + L + L, L + L + L + L, L + L + L + L, L + L + L + L],
};
// rows `inner` laid over the 4 x 4 block of `rows` (x 5..8, y 4..7)
export const overLens = (rows, inner) => rows.map((r, y) => (y >= 4 && y <= 7 ? r.slice(0, 5) + inner[y - 4] + r.slice(9) : r));
export const beacon = ([L, Hi, S], inner) => { const rows = SHAPE.map(r => r.replace(/L/g, L).replace(/H/g, Hi).replace(/S/g, S)); return inner ? overLens(rows, inner) : rows; };

// The worlds' own GitHub main lamps (CIMAIN, spec 2026-11-22-ci-lamps-scribe-main-design.md section 3): each
// tools/cimain_art/<theme>.mjs draws one 14 x 28 shape and frames() turns it into the five frames. The lens is a 4 x 4
// block at columns 5..8, rows 4..7 (its centre the base sheet's lens anchor [7, 6]; the foot is [7, 28]), written with
// placeholders: '*' the lens, '+' its glint, '-' its shade. Each frame swaps them for that frame's lens chars, the same
// chars as the scribe's CILAMP (ui/cilamp.js LENS fixes their colours over the whole sprite, so the housing never uses
// any of them).
const LIT = { 'CIMAIN.off': ['n', 'M', 'k'], 'CIMAIN.amber': ['f', 'F', 'g'], 'CIMAIN.amber_dim': ['g', 'f', 'G'], 'CIMAIN.green': ['c', 'O', 'C'], 'CIMAIN.red': ['a', 'F', 'x'] };
// Every char some frame's LENS recolours: never in the housing.
export const LENS_CHARS = new Set(Object.values(LIT).slice(1).flat());

export function frames(shape, who) {
  if (shape.length !== H || shape.some(r => r.length !== W)) throw new Error(`${who}: want ${W} x ${H}, rows ${shape.map(r => r.length).join(',')}`);
  for (const [y, r] of shape.entries()) for (const [x, ch] of [...r].entries()) {
    const lens = x >= 5 && x <= 8 && y >= 4 && y <= 7;
    if (!lens && '*+-'.includes(ch)) throw new Error(`${who}: lens char '${ch}' outside the lens block at ${x},${y}`);
    if (LENS_CHARS.has(ch)) throw new Error(`${who}: housing char '${ch}' at ${x},${y} is a lens char`);
  }
  const INNERS = { 'CIMAIN.off': INNER.off('n'), 'CIMAIN.green': INNER.green('c', 'O'), 'CIMAIN.red': INNER.red('a') };
  return Object.fromEntries(NAMES.map(n => { const [L, Hi, S] = LIT[n]; const rows = shape.map(r => r.replace(/\*/g, L).replace(/\+/g, Hi).replace(/-/g, S)); return [n, INNERS[n] ? overLens(rows, INNERS[n]) : rows]; }));
}
