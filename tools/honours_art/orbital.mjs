// Orbital Station (every space world): the Crew Honours panel, a white composite board strapped to the wall by two
// velcro tabs, screwed at its corners, its title on a mission-blue band, each mark a dark display with a green status
// LED, an orange stripe along its foot; signs: a rocket, a mission clock, a dish antenna, the sun.
import { W, TITLE, ICON, ROW, part, rounded, depth, pic, plaque } from './kit.mjs';

const board = rounded(2, 3, W - 3, 92, 4);
const tab = (x, y) => y >= 0 && y < 7 && ((x >= 12 && x <= 19) || (x >= W - 20 && x <= W - 13));
const screws = [[6, 7], [W - 7, 7], [6, 88], [W - 7, 88]];

const body = (x, y) => {
  if (tab(x, y) && (y < 4 || !board(x, y))) return y === 0 || x === 12 || x === 19 || x === W - 20 || x === W - 13 ? 'k' : (x + y) % 2 ? 'B' : 'P';
  if (!board(x, y)) return board(x - 1, y) || board(x + 1, y) || board(x, y - 1) || board(x, y + 1) ? 'k' : null;
  const s = screws.find(([sx, sy]) => Math.hypot(x - sx, y - sy) <= 1.6);
  if (s) return x === s[0] || y === s[1] ? 'M' : 'l';
  const d = depth(board, x, y, 3);
  if (d === 1) return y < 48 ? 'p' : 'b';
  if (d === 2) return 'B';
  if (y >= 89 && y <= 90 && x > 9 && x < W - 10) return y === 89 ? 'Y' : 'x'; // the orange stripe
  const t = part(TITLE, x, y);
  if (t) return t === 'edge' ? 'h' : 'g';
  for (let i = 0; i < 4; i++) {
    const [rx, ry, rw] = ROW(i);
    if (x >= rx + rw && x <= rx + rw + 1 && (y === ry + 6 || y === ry + 7)) return i === 2 ? 'o' : 'c'; // status LED
    const r = part(ROW(i), x, y);
    if (r) return r === 'edge' ? 'M' : 'w';
    const [ix, iy] = ICON(i);
    if (x >= ix - 1 && x <= ix + 12 && y >= iy - 1 && y <= iy + 12) return x === ix - 1 || y === iy - 1 ? 'B' : 'p';
  }
  return (x + 2 * y) % 31 === 0 ? 'B' : 'b';
};

const icons = [
  pic([
    '.....pp.....',
    '....pxxp....',
    '....pbbp....',
    '....bccb....',
    '....bccb....',
    '....bbbb....',
    '...gbbbbg...',
    '..ggbbbbgg..',
    '..g.bMMb.g..',
    '....FffF....',
    '.....ff.....',
    '.....f......',
  ]),
  pic([
    '....MMMM....',
    '..MMppppMM..',
    '.MppppppppM.',
    '.Mppp.gpppM.',
    'Mpppp.gppppM',
    'Mpppp.gppppM',
    'Mpppp.ggggpM',
    'Mpppp.....pM',
    '.Mpppppppppm',
    '.MppppppppM.',
    '..MMppppMM..',
    '....MMMM....',
  ]),
  pic([
    '.ll.........',
    'lbbl........',
    'lbbbl...c...',
    '.lbbbl.c....',
    '..lbbblM....',
    '...lbbbl....',
    '....lbbbl...',
    '.....lll....',
    '.....M......',
    '....MMM.....',
    '...MMMMM....',
    '..MMMMMMM...',
  ]),
  pic([
    '.....F......',
    '..F..f..F...',
    '...f.f.f....',
    '....fff.....',
    '.Fffffffff..',
    '....fff.....',
    '...f.f.f....',
    '..F..f..F...',
    '.....F......',
    '............',
    '............',
    '............',
  ]),
];

export default () => ({ HONOURS: plaque(body, icons) });
