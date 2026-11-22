// Darwin: a naturalist's specimen cabinet. A specimen jar on its cornice, wooden drawers with brass knobs either side, a
// pane of green glass in a brass frame (a leaf drawn on it while it works), a labelled drawer and a brass gauge under it.
import { sym, patch, frames } from './kit.mjs';

const off = patch(sym([
  '................',
  '................',
  '................',
  '................',
  '.kkkkkkkkkkkkkkk',
  '.kLLLLLLLLLLLLLL',
  'kwwwwwwwwwwwwwww',
  '.kwwwwwwwggggggg',
  '.kwkkkkkwgCCCCCC',
  '.kwkWWWkwgCCCCCC',
  '.kwkWgWkwgCCCCCC',
  '.kwkkkkkwgCCCCCC',
  '.kwwwwwwwgCCCCCC',
  '.kwkkkkkwgCCCCCC',
  '.kwkWgWkwgCCCCCC',
  '.kwkkkkkwgCCCCCC',
  '.kwwwwwwwggggggg',
  '.kwkkkkkwwwwwkkk',
  '.kwkpPpkwwwwkghh',
  '.kwkkkkkwwwwwkkk',
  '.kwwwwwwwwwwwwww',
  '.kkkkkkkkkkkkkkk',
  'kWgWWWWWWWWWWWWW',
  'kkkkkkkkkkkkkkkk',
]), [
  [3, 0, [ // the jar
    '.kkk.',
    'kbbbk',
    'kbvbk',
    'kvvbk',
  ]],
  [24, 1, ['.kk', 'kpk', 'kPk']], // a rolled label
  [16, 18, ['k']], // the gauge's needle at rest
]);

export default () => frames(off, [
  [10, 8, [ // a leaf on the lit glass
    'cccccccccccc',
    'cccccccCCccc',
    'cccccCCcCccc',
    'ccccCcCCcccc',
    'cccCcCCccccc',
    'cccCCcccccCc',
    'ccCcccccCccc',
    'cCcccccccccc',
  ]],
  [16, 18, ['h']], [17, 18, ['k']], // the needle swings
]);
