// Sunset Drive: an arcade cabinet. A marquee glowing in sunset bands with a half sun, a cabinet narrower than the panel,
// the screen in a dark bezel, a control panel jutting out with a stick and buttons, a neon stripe down low.
import { sym, patch, frames } from './kit.mjs';

const off = patch(sym([
  '....kkkkkkkkkkkk',
  '....kMMMMMMMMMMM',
  '....kMMMMMMMMMMM',
  '....kMMMMMMMMMMM',
  '....kkkkkkkkkkkk',
  '.....kwwwwwwwwww',
  '.....kwkkkkkkkkk',
  '.....kwkMMMMMMMM',
  '.....kwkMkCCCCCC',
  '.....kwkMkCCCCCC',
  '.....kwkMkCCCCCC',
  '.....kwkMkCCCCCC',
  '.....kwkMkCCCCCC',
  '.....kwkMkCCCCCC',
  '.....kwkMkCCCCCC',
  '.....kwkMkCCCCCC',
  '.....kwkMMMMMMMM',
  '..kkkkkkkkkkkkkk',
  '..kLLLLLLLLLLLLL',
  '..kkkkkkkkkkkkkk',
  '.....kwwwwwwwwww',
  '.....kXXXXXXXXXX',
  '.....kwwwwwwwwww',
  '.....kkkkkkkkkkk',
]), [
  [8, 16, ['aa']], [9, 17, ['l']], [13, 18, ['n.n....n.n.n']], // the stick, the buttons
]);

export default () => frames(off, [
  [5, 1, [
    'xxxxxxxxxxxFFFFxxxxxxxxxxx',
    'ggggggggggFFFFFFgggggggggg',
    'ccccccccccFFFFFFcccccccccc',
  ]],
  [10, 8, [ // the sun going down on a grid road
    '....gggg....',
    '...gggggg...',
    '..cccccccc..',
    'xxxxxxxxxxxx',
    '.x..x..x..x.',
    'x...x..x...x',
    '...x....x...',
    '..x......x..',
  ]],
  [13, 18, ['x.c....c.x.c']],
]);
