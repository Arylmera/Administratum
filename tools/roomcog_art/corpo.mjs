// Corpo Tower: a server pillar, narrower than the others. A red logo plate on top, chrome edges, vent slats either side
// of a glass front, server bays under it with their LEDs, a dark chrome foot.
import { sym, frames } from './kit.mjs';

const off = sym([
  '................',
  '................',
  '...........kkkkk',
  '...........kxxxx',
  '...........kxxhh',
  '...........kkkkk',
  '.....kkkkkkkkkkk',
  '.....khhhhhhhhhh',
  '.....kgmmkCCCCCC',
  '.....kgMMkCCCCCC',
  '.....kgmmkCCCCCC',
  '.....kgMMkCCCCCC',
  '.....kgmmkCCCCCC',
  '.....kgMMkCCCCCC',
  '.....kgmmkCCCCCC',
  '.....kgMMkCCCCCC',
  '.....kgmmkkkkkkk',
  '.....kgMMkMnMMnM',
  '.....kgmmkmmmmmm',
  '.....kgMMkMnMMnM',
  '.....kgmmkmmmmmm',
  '...kkkkkkkkkkkkk',
  '...kGGGGGGGGGGGG',
  '...kkkkkkkkkkkkk',
]);

export default () => frames(off, [
  [10, 8, [ // the quarter's figures, rising
    '............',
    '.........cc.',
    '......cc.cc.',
    '......cc.cc.',
    '...cc.cc.cc.',
    '...cc.cc.cc.',
    '.c.cc.cc.cc.',
    'cccccccccccc',
  ]],
  [11, 17, ['x..x....x..x', '............', 'x..x....x..x']],
]);
