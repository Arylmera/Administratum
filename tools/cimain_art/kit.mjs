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
export const beacon = ([L, Hi, S]) => SHAPE.map(r => r.replace(/L/g, L).replace(/H/g, Hi).replace(/S/g, S));

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
  return Object.fromEntries(NAMES.map(n => { const [L, Hi, S] = LIT[n]; return [n, shape.map(r => r.replace(/\*/g, L).replace(/\+/g, Hi).replace(/-/g, S))]; }));
}
