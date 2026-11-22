// Orbital Station: a station module. White panels with their seams and two status LEDs a side, a dish on a short mast,
// a round porthole screen in a metal ring (a planet on it while it works), an orange stripe, a vent under it.
import { sym, frames } from './kit.mjs';

const off = sym([
  '...........kk...',
  '............kl..',
  '.............kll',
  '..............kk',
  '..............km',
  '.............kmm',
  '.kkkkkkkkkkkkkkk',
  '.kpppppppppppppp',
  '.kpbbbBbbbpplkkk',
  '.kpbbbBbbbplkCCC',
  '.kpbbbBbbblkCCCC',
  '.kpBBBBBBBlkCCCC',
  '.kpbbbBbbblkCCCC',
  '.kpbnbBbnblkCCCC',
  '.kpbbbBbbbplkCCC',
  '.kpbbbBbbbpplkkk',
  '.kpppppppppppppp',
  '.kxxxxxxxxxxxxxx',
  '.kpppppppppppppp',
  '.kpBBBpppkMlMlMl',
  '.kpppppppppppppp',
  '.kkkkkkkkkkkkkkk',
  'kMMMMMMMMMMMMMMM',
  'kkkkkkkkkkkkkkkk',
]);

export default () => frames(off, [
  [10, 8, [
    '............',
    '...ccccc....',
    '..cuuuvvc...',
    '..cuvvvuuc..',
    '..cuuvvvuc..',
    '..cvvuuuuc..',
    '...cuuvc....',
    '............',
  ]],
  [4, 13, ['c...x']], [23, 13, ['x...c']], // the LEDs
  [15, 3, ['OO']], // the dish's feed
]);
