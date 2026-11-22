// Neon Grid: one module of the cyber cogitator. A black rack slab under a glyph marquee, slatted rack sides with a
// status LED each, a fan in the left rack, a cable bundle falling from a connector under the screen, a magenta edge line.
import { sym, patch, frames } from './kit.mjs';

const off = patch(sym([
  '................',
  '........kkkkkkkk',
  '........kMMMMMMM',
  '........kMMMMMMM',
  '........kMMMMMMM',
  '........kkkkkkkk',
  '.kkkkkkkkkkkkkkk',
  '.kMMMMMMMMMMMMMM',
  '.kMmmmmnMkCCCCCC',
  '.kMMMMMMMkCCCCCC',
  '.kMmmmmnMkCCCCCC',
  '.kMMMMMMMkCCCCCC',
  '.kMmmmmnMkCCCCCC',
  '.kMMMMMMMkCCCCCC',
  '.kMmmmmnMkCCCCCC',
  '.kMMMMMMMkCCCCCC',
  '.kMmmmmnMkkkkkkk',
  '.kMMMMMMMMMkllkM',
  '.kMmmmmnMMMMxgMM',
  '.kMMMMMMMMMMxMgM',
  '.kMmmmmnMMMMxMgM',
  '.kkkkkkkkkkkkkkk',
  'kxxxxxxxxxxxxxxx',
  'kkkkkkkkkkkkkkkk',
]), [
  [2, 9, [ // the fan
    'MkkkkkM',
    'kxlMlxk',
    'klMmMlk',
    'kMmnmMk',
    'klMmMlk',
    'kxlMlxk',
    'MkkkkkM',
  ]],
]);

export default () => frames(off, [
  [9, 2, [ // the marquee's glyphs
    'x.x.xxx.x.xx',
    'xxx..x..xx.x',
    'x.x.xxx.x.xx',
  ]],
  [10, 8, [
    '............',
    '.cccc.cc....',
    '............',
    '..ccc.cccc..',
    '............',
    '.cc.c.c.c.c.',
    '............',
    '.cccccc.....',
  ]],
  [24, 8, ['g', '.', 'g', '.', 'g', '.', 'g', '.', 'g']], // the right rack's LEDs
  [7, 18, ['g', '.', 'g']],
]);
