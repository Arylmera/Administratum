// Vault 111: an alarm beacon post, the lens in a round dome under a wire cage, a blue and yellow stripe band, a riveted steel post, a gear-shaped plate bolted at its foot.
import { frames } from './shape.mjs';

const SHAPE = [
  '.....kkkk.....',
  '....kmllmk....',
  '...kMkMMkMk...',
  '..kMnMnnMnMk..',
  '..kMnM**MnMk..',
  '..kMM*+*-MMk..',
  '..kMn***-nMk..',
  '..kMnM--MnMk..',
  '..kMMMMMMMMk..',
  '.kkkkkkkkkkkk.',
  '.kuuuuuuuuuuk.',
  '.khhhhhhhhhhk.',
  '.kkkkkkkkkkkk.',
  '.....kmMk.....',
  '.....klMk.....',
  '.....kmMk.....',
  '.....kmMk.....',
  '.....klMk.....',
  '.....kmMk.....',
  '.....kmMk.....',
  '.....klMk.....',
  '.....kmMk.....',
  '...k.kmMk.k...',
  '..khhhhhhhhk..',
  '.khhhhkkhhhhk.',
  '..khhhhhhhhk..',
  '...k.kkkk.k...',
  '..kkkkkkkkkk..',
];

export default () => frames(SHAPE, 'vault');
