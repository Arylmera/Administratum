// Green Code: a CRT box. A rounded case with a bulging top, the screen with its corners rounded off, two knobs and a
// power LED under it, a bundle of cables falling from its right side to the floor.
import { sym, patch, frames } from './kit.mjs';

const off = patch(sym([
  '................',
  '................',
  '................',
  '.....kkkkkkkkkkk',
  '....kmmmmmmmmmmm',
  '...kmlllllllllll',
  '...kmMMMMMMMMMMM',
  '...kmMMMkkkkkkkk',
  '...kmMMMMkkCCCCC',
  '...kmMMMMkCCCCCC',
  '...kmMMMMkCCCCCC',
  '...kmMMMMkCCCCCC',
  '...kmMMMMkCCCCCC',
  '...kmMMMMkCCCCCC',
  '...kmMMMMkCCCCCC',
  '...kmMMMMkkCCCCC',
  '...kmMMMMMkkkkkk',
  '...kmMMMMMMMMMMM',
  '...kmMlMMlMMMMMM',
  '...kmMMMMMMMMMMM',
  '...kmmmmmmmmmmmm',
  '...kkkkkkkkkkkkk',
  '..kMMMMMMMMMMMMM',
  '..kkkkkkkkkkkkkk',
]), [
  [18, 18, ['MMMMMMMMn']], // the right side has no knobs, a power LED
  [28, 9, [ // the cables
    '.kk.',
    'kZXk',
    'kZXk',
    '.kZX',
    '.kZX',
    '.kZX',
    'kZXk',
    'kZXk',
    'kZXk',
    'kXZk',
    'kXZk',
    'kXZk',
    'kXZk',
    'kkkk',
  ]],
]);

export default () => frames(off, [
  [10, 8, [ // the falling code
    '...c........',
    'c..O..c...c.',
    'c..c..O...c.',
    'O..c..c.c.O.',
    'c.....c.c.c.',
    'c..c..c.O.c.',
    '...O....c...',
    '...c....c...',
  ]],
  [26, 18, ['c']],
]);
