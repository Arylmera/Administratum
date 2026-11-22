// Ordo Malleus: a sealed reliquary cogitator. The Inquisition's I on top, dark iron panels framed in silver with a lock
// on each side, purity seals (red wax, parchment strips) hanging under the screen, a blue screen.
import { sym, frames } from './kit.mjs';

const off = sym([
  '............kkkk',
  '............kghh',
  '............kkkh',
  '..............kh',
  '............kkkh',
  '............kghh',
  '.kkkkkkkkkkkkkkk',
  '.kllllllllllllll',
  '.klMMMMMlkCCCCCC',
  '.klMMMMMlkCCCCCC',
  '.klMkkkMlkCCCCCC',
  '.klMkgkMlkCCCCCC',
  '.klMkkkMlkCCCCCC',
  '.klMMkMMlkCCCCCC',
  '.klMMMMMlkCCCCCC',
  '.klMMMMMlkCCCCCC',
  '.klMMMMMlkkkkkkk',
  '.klMMMMMlkaakMaa',
  '.klMMMMMlMpPMMpP',
  '.klMMMMMlMpPMMpP',
  '.kllllllllpPllpP',
  '.kkkkkkkkkkkkkkk',
  'kMMMMMMMMMMMMMMM',
  'kkkkkkkkkkkkkkkk',
]);

export default () => frames(off, [
  [10, 8, [
    '............',
    '.cc.ccc.c...',
    '............',
    '.c.cc.cccc..',
    '............',
    '.ccc.c.cc...',
    '............',
    '.c.cc.c.....',
  ]],
  [5, 11, ['h']], [26, 11, ['h']], // the locks catch the light
]);
