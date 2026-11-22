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
