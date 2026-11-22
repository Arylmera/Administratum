// Vault 111: the vault mainframe made small. A yellow 111 plate on top, a tape reel and a row of buttons each side, a
// green CRT, a punched card and keys under it, a hazard-striped plinth.
import { sym, frames } from './kit.mjs';

const off = sym([
  '................',
  '..........kkkkkk',
  '..........kgMggM',
  '..........kgMggM',
  '..........kgMggM',
  '..........kkkkkk',
  '.kkkkkkkkkkkkkkk',
  '.kllllllllllllll',
  '.kmkkkkkmkCCCCCC',
  '.kmkMlMkmkCCCCCC',
  '.kmklnlkmkCCCCCC',
  '.kmkMlMkmkCCCCCC',
  '.kmkkkkkmkCCCCCC',
  '.kmmmmmmmkCCCCCC',
  '.kmnmnmnmkCCCCCC',
  '.kmmmmmmmkCCCCCC',
  '.kmmmmmmmkkkkkkk',
  '.kmMMMMMmmmmmmmm',
  '.kmMpPpMmlklklkl',
  '.kmMMMMMmmmmmmmm',
  '.kmmmmmmmmmmmmmm',
  '.kkggkkggkkggkkg',
  'kggkkggkkggkkggk',
  'kkkkkkkkkkkkkkkk',
]);

export default () => frames(off, [
  [10, 8, [
    '............',
    '.ccc.cc.c...',
    '............',
    '.cc.cccc.c..',
    '............',
    '.c.ccc.cc...',
    '............',
    '.cccc.c.....',
  ]],
  [5, 10, ['g']], [26, 10, ['g']], // the reels' hubs
  [3, 14, ['c.a.c']], [24, 14, ['g.c.a']],
]);
