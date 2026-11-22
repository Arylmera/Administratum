// Ordo Administratum (and the base every world without its own falls back to): the open-space cogitator made small. An
// iron cabinet under a brass cap, a gear-skull crest between two vents, a reel drum pair down each side, one green cant
// screen in a brass bezel, a row of six key lamps, a key bank, a brass plinth.
import { sym, frames } from './kit.mjs';

const off = sym([
  '.............k.k',
  '...........kkkgg',
  '...........kghbb',
  '...kkkkk..kkgbkb',
  '...kMlMk...kgbbB',
  '...kkkkk....kkgG',
  '.kkkkkkkkkkkkkkk',
  '.khhhhhhhhhhhhhh',
  '.kMMMMMMkgCCCCCC',
  '.kMMkkkMkgCCCCCC',
  '.kMkgGgkkgCCCCCC',
  '.kMkGnGkkgCCCCCC',
  '.kMkgGgkkgCCCCCC',
  '.kMMkkkMkgCCCCCC',
  '.kMMMMMMkgCCCCCC',
  '.kMMkkkMkgCCCCCC',
  '.kMkgGgkkggggggg',
  '.kMkGnGkkmmnmnmn',
  '.kMkgGgkkmmmmmmm',
  '.kMMkkkMklklklkl',
  '.kMMMMMMkmmmmmmm',
  '.kkkkkkkkkkkkkkk',
  'kggggggggggggggg',
  'kkkkkkkkkkkkkkkk',
]);

export default () => frames(off, [
  [10, 8, [
    '............',
    '.c.cc.ccc...',
    '............',
    '.cc.c..cc.c.',
    '............',
    '.ccc.c..c...',
    '............',
    '.c..cc.c....',
  ]],
  [5, 11, ['f']], [26, 11, ['f']], [5, 17, ['f']], [26, 17, ['f']], // the reels' hubs glow
  [10, 17, ['.f.c.aa.c.f.']],
]);
