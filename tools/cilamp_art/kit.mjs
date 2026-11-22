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
export const lamp = ([L, Hi, S]) => SHAPE.map(r => r.replace(/L/g, L).replace(/H/g, Hi).replace(/S/g, S));
