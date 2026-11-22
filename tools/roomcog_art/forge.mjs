// Ordo Machinum: a forge machine, not a scriptorium's. Two exhaust stacks either side of a Mechanicus cog with a red
// optic, copper pipes down each side with a flange and a brass valve wheel, an iron cap, an amber screen, a copper plinth.
import { sym, frames } from './kit.mjs';

const off = sym([
  '...kkk......kk.k',
  '...kYk......khgk',
  '...kXk......kgGG',
  '...kXk......kgGn',
  '..kkXkk.....kgGG',
  '..kZZZk.....kkgG',
  '.kkkkkkkkkkkkkkk',
  '.kllllllllllllll',
  '.kmkYXkmkmCCCCCC',
  '.kmkYXkmkmCCCCCC',
  '.kkZZZZkkmCCCCCC',
  '.kmkYXkmkmCCCCCC',
  '.kmkYXkmkmCCCCCC',
  '.kmkYXkmkmCCCCCC',
  '.kkhkkhkkmCCCCCC',
  '.kkkhhkkkmCCCCCC',
  '.kkhkkhkkmmmmmmm',
  '.kmkYXkmkmmnmnmn',
  '.kmkYXkmkmmmmmmm',
  '.kmkYXkmklklklkl',
  '.kmkYXkmkmmmmmmm',
  '.kkkkkkkkkkkkkkk',
  'kXXXXXXXXXXXXXXX',
  'kkkkkkkkkkkkkkkk',
]);

export default () => frames(off, [
  [10, 8, [
    '............',
    '..c......c..',
    '.c.c....c.c.',
    'c...c..c...c',
    '.....cc.....',
    '............',
    '............',
    '.cc.cc.cc.c.',
  ]],
  [15, 3, ['aa']], // the cog's optic
  [3, 0, ['.f.']], [26, 0, ['.f.']], // embers at the stacks' mouths
  [10, 17, ['.f.f.aa.f.f.']],
]);
