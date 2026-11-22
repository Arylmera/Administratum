// Shared sizes and the lamp's shape for the CI lamp (tools/cilamp_art.mjs). Frames are rows of key.gpl chars, '.' clear.
// Art px; the hall draws it 5 x 10 logical (ui/cilamp.js, scene.js). The blink swaps `amber` and `amber_dim`.
export const W = 10, H = 20;
export const NAMES = ['CILAMP.off', 'CILAMP.amber', 'CILAMP.amber_dim', 'CILAMP.green', 'CILAMP.red'];
export const SIZES = Object.fromEntries(NAMES.map(n => [n, [W, H]]));
// Foot (where it stands, bottom centre) and lens (its centre, where a light would sit), art px from the frame's top-left.
export const ANCHORS = { CILAMP: { foot: [5, 20], lens: [5, 5] } };

// A signal post: a housing with one round lens (L main, H glint, S shade; the lens columns 3..6), a pole, a footed base.
// lit: the lens chars [L, H, S] of a frame; housing and post in the iron slots, k outline.
const SHAPE = [
  '..kkkkkk..',
  '.kllllllk.',
  'kmmmmmmmmk',
  'kmMMLLMMmk',
  'kmMLHLSMmk',
  'kmMLLLSMmk',
  'kmMMSSMMmk',
  'kmMMMMMMmk',
  '.kmmmmmmk.',
  '..kkkkkk..',
  ...Array(7).fill('...kmMk...'),
  '..kmmMMk..',
  '.kmmmmMMk.',
  '.kkkkkkkk.',
];
// The lens's 4 x 4 block (columns 3..6, rows 3..6) per state, so the verdict reads without colour (a red/green
// colour-blind user): running keeps the round lens (M corners) with its glint and shade, and its blink; a pass is a
// square lens with a bright check cut in it; a fail a square lens with a dark X (k); unlit a flat dark glass.
// Each takes the frame's lens chars: main, glint, shade (the shade only on the round lens).
export const LENS_ROWS = {
  round: (L, Hi, S) => ['M' + L + L + 'M', L + Hi + L + S, L + L + L + S, 'M' + S + S + 'M'],
  pass: (L, Hi) => [L + L + L + L, L + L + L + Hi, Hi + L + Hi + L, L + Hi + L + L],
  fail: L => ['k' + L + L + 'k', L + 'kk' + L, L + 'kk' + L, 'k' + L + L + 'k'],
  off: L => ['M' + L + L + 'M', L + L + L + L, L + L + L + L, 'M' + L + L + 'M'],
};
export const lamp = rows => SHAPE.map((r, y) => (y >= 3 && y <= 6 ? r.slice(0, 3) + rows[y - 3] + r.slice(7) : r));
