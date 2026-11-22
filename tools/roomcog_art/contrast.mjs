// Ordo Hereticus: a pyre cogitator. A brazier on top (embers unlit, a flame while it works), chains hanging down each
// side, red trim round the cabinet, bone keys, a gold bezel, an amber screen.
import { sym, frames } from './kit.mjs';

const off = sym([
  '................',
  '................',
  '................',
  '...........kkkkk',
  '...........kgxxx',
  '............kggg',
  '.kkkkkkkkkkkkkkk',
  '.kxxxxxxxxxxxxxx',
  '.kxMllMMMgCCCCCC',
  '.kxlMMlMMgCCCCCC',
  '.kxlMMlMMgCCCCCC',
  '.kxMllMMMgCCCCCC',
  '.kxMllMMMgCCCCCC',
  '.kxlMMlMMgCCCCCC',
  '.kxlMMlMMgCCCCCC',
  '.kxMllMMMgCCCCCC',
  '.kxMllMMMggggggg',
  '.kxlMMlMMgMnMnMn',
  '.kxlMMlMMgMMMMMM',
  '.kxMllMMMgbBbBbB',
  '.kxxxxxxxxxxxxxx',
  '.kkkkkkkkkkkkkkk',
  'kGGGGGGGGGGGGGGG',
  'kkkkkkkkkkkkkkkk',
]);

export default () => frames(off, [
  [12, 0, [
    '...f.f..',
    '..fFf.f.',
    '.fFFFFf.',
    '.fFFFFf.',
    '..ffff..',
  ]],
  [10, 8, [
    '............',
    '.cc.c.ccc...',
    '............',
    '.c.ccc.cc.c.',
    '............',
    '.cccc.c.....',
    '............',
    '.c.c.cc.c...',
  ]],
  [10, 17, ['.f.f.aa.f.f.']],
]);
