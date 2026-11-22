// Rain City: a worn street terminal. A sloped rain hood over the whole of it, an orange neon tube under the hood, a card
// slot and a speaker grille either side of a teal screen, a keypad, a wet base; one rust streak and a dent.
import { sym, patch, frames } from './kit.mjs';

const off = patch(sym([
  '................',
  '................',
  '......kkkkkkkkkk',
  '....kkMMMMMMMMMM',
  '..kkmmmmmmmmmmmm',
  '.kkkkkkkkkkkkkkk',
  '..kZZZZZZZZZZZZZ',
  '..kMMMMMMMMMMMMM',
  '..kMMMMMMkCCCCCC',
  '..kMkkkMMkCCCCCC',
  '..kMkpkMMkCCCCCC',
  '..kMkkkMMkCCCCCC',
  '..kMMMMMMkCCCCCC',
  '..kMlMlMMkCCCCCC',
  '..kMMMMMMkCCCCCC',
  '..kMlMlMMkCCCCCC',
  '..kMMMMMMkkkkkkk',
  '..kMMMMMMMlklklk',
  '..kMMMMMMMklklkl',
  '..kMMMMMMMlklklk',
  '..kmmmmmmmmmmmmm',
  '..kkkkkkkkkkkkkk',
  '.kSSSSSSSSSSSSSS',
  '.kkkkkkkkkkkkkkk',
]), [
  [4, 8, ['Z', 'Z', '.', '.', '.', 'Z', 'Z', 'Z']], // rust run from the hood
  [26, 12, ['m', 'M']], // a dent
]);

export default () => frames(off, [
  [3, 6, ['xxxxxxxxxxxxxxxxxxxxxxxxxx']], // the neon tube lit
  [10, 8, [
    '............',
    '.c.cccc.cc..',
    '............',
    '.cc.c.ccc...',
    '............',
    '.ccc.cc.c.c.',
    '............',
    '.c.cc.......',
  ]],
  [5, 10, ['g']], // the card slot's light
]);
