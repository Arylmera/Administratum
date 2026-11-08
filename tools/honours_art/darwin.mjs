// Darwin (the Victorian laboratory): the Fellows' Board, a mahogany case under a carved pediment with a rosette, its
// title on a brass nameplate, each mark on dark green baize behind a brass slip, two carved corbels under its foot;
// signs: a finch, a pocket watch, a magnifying glass, an oil lamp.
import { W, TITLE, ICON, ROW, part, depth, pic, plaque } from './kit.mjs';

const ped = 9; // the pediment's height over the case
const caseOf = (x, y) => x >= 2 && x <= W - 3 && y <= 89 && y >= ped * Math.abs(x - 35.5) / 34 - 0.5;
const corbel = (x, y) => y >= 90 && y <= 94 && [[6, 14], [W - 15, W - 7]].some(([a, b]) => x >= a + (y - 90) && x <= b - (y - 90));
const rosette = (x, y) => Math.hypot(x - 35.5, y - 3.5) <= 2.2;

const body = (x, y) => {
  if (corbel(x, y)) return y === 90 ? 'L' : x % 3 ? 'w' : 'W';
  if (!caseOf(x, y)) return caseOf(x - 1, y) || caseOf(x + 1, y) || caseOf(x, y - 1) || caseOf(x, y + 1) ? 'k' : null;
  if (rosette(x, y)) return Math.hypot(x - 35.5, y - 3.5) < 1 ? 'h' : 'g';
  const d = depth(caseOf, x, y, 4);
  if (d === 1) return 'L';
  if (d === 2) return 'w';
  if (d === 3) return y < ped + 2 ? 'W' : 'G'; // the pediment's shadow line, then a thin brass bead round the case
  const t = part(TITLE, x, y);
  if (t) return t === 'edge' ? 'h' : 'G';
  if (y === ped + 1 || y === ped + 2) return y === ped + 1 ? 'L' : 'W'; // the cornice under the pediment
  for (let i = 0; i < 4; i++) {
    const [rx, ry, rw, rh] = ROW(i);
    if (y === ry + rh && x >= rx && x < rx + rw) return 'g'; // the brass slip under the baize
    const r = part(ROW(i), x, y);
    if (r) return r === 'edge' ? 'k' : (x * 3 + y * 7) % 17 ? 'v' : 'C';
    const [ix, iy] = ICON(i);
    if (x >= ix - 1 && x <= ix + 12 && y >= iy - 1 && y <= iy + 12) return x === ix - 1 || y === iy - 1 ? 'W' : 'p';
  }
  return (x + (y >> 2)) % 9 === 0 ? 'L' : (x * 7 + y) % 13 === 0 ? 'W' : 'w'; // mahogany figure
};

const icons = [
  pic([
    '............',
    '....BBB.....',
    '...BbkbB....',
    '..yBbbbBB...',
    '...BxxbbBB..',
    '...xxxbbbBB.',
    '....xxbbbBBB',
    '.....bbbBB..',
    '......w.w...',
    '......w.w...',
    '....wwwwwww.',
    '............',
  ]),
  pic([
    '.....gg.....',
    '....g..g....',
    '....gggg....',
    '..gggggggg..',
    '.gppppppppg.',
    '.gpppkppppg.',
    'gppppkpppppg',
    'gppppkkkpppg',
    'gpppppppppPg',
    '.gppppppppg.',
    '..gPPPPPPg..',
    '...gggggg...',
  ]),
  pic([
    '..gggg......',
    '.g....g.....',
    'g.llll.g....',
    'g.lOll.g....',
    'g.llll.g....',
    'g.llll.g....',
    '.g....g.....',
    '..ggggW.....',
    '......WW....',
    '.......WW...',
    '........WW..',
    '.........W..',
  ]),
  pic([
    '.....F......',
    '....FfF.....',
    '....fFf.....',
    '...ppfpp....',
    '..pp.f.pp...',
    '..p..f..p...',
    '..pp...pp...',
    '...ppppp....',
    '...ggggg....',
    '..gGGGGGg...',
    '.ggggggggg..',
    '..GGGGGGG...',
  ]),
];

export default () => ({ HONOURS: plaque(body, icons) });
