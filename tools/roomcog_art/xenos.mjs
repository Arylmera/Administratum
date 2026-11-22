// Ordo Xenos: an auspex scanner. An antenna fork on top, an oval scope with a sweep and blips, a level meter down each
// side of it, a specimen tube standing at each end of the plinth, a row of signal pips.
import { sym, frames } from './kit.mjs';

const off = sym([
  '.............O..',
  '.............l..',
  '..............l.',
  '..............kl',
  '.............kgg',
  '...........kkggg',
  '....kkkkkkkkkkkk',
  '....khhhhhhhhhhh',
  '....kgmmmgggkkkk',
  '.kkkkgmnmggkCCCC',
  '.kvkkgmnmgkCCCCC',
  '.kvkkgmnmgkCCCCC',
  '.kvkkgmnmgkCCCCC',
  '.kvkkgmnmgkCCCCC',
  '.kvkkgmnmggkCCCC',
  '.kvkkgmmmgggkkkk',
  '.kvkkggggggggggg',
  '.kvkkgnggnggnggn',
  '.kvkkggggggggggg',
  '.kvkkgmmmmmmmmmm',
  '.kvkkggggggggggg',
  '.kkkkkkkkkkkkkkk',
  'kGGGGGGGGGGGGGGG',
  'kkkkkkkkkkkkkkkk',
]);

export default () => frames(off, [
  [10, 8, [
    '............',
    '............',
    '..c.....O...',
    '...cc.......',
    '.....cc.....',
    '.O.....c....',
    '............',
    '............',
  ]],
  [7, 12, ['c', 'c', 'c']], [24, 11, ['c', 'c', 'c', 'c']], // the meters' levels
  [2, 13, ['c', '.', 'c']], [29, 15, ['c', '.', 'c']], // bubbles in the tubes
  [10, 17, ['c..c..c..c..']],
]);
