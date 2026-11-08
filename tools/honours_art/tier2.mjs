// Ordo Administratum (every 40k world): the Roll of Honour, an iron slab under an ogee point, framed in brass and
// studded, each mark in a sunk iron panel with its sign (a wax seal, an hourglass, a quill, a votive candle), two
// purity seals with their parchment strips hanging from its foot.
import { W, TITLE, ICON, ROW, part, depth, pic, plaque } from './kit.mjs';

const top = 11; // the point's height over the slab's shoulders
const slab = (x, y) => x >= 2 && x <= W - 3 && y <= 88 && y >= top * (Math.abs(x - 35.5) / 34) ** 1.4;
const seals = [14, 57];
const seal = (x, y) => seals.some(cx => Math.hypot(x - cx, y - 89) <= 4.2);
const strip = (x, y) => y >= 92 && seals.some(cx => x >= cx - 2 && x <= cx + 2 && !(y === 95 && (x + y) % 2));

const body = (x, y) => {
  if (seal(x, y)) {
    const cx = seals.find(c => Math.hypot(x - c, y - 89) <= 4.2), dx = x - cx, dy = y - 89;
    if (Math.hypot(dx, dy) > 3.6) return 'k';
    return dx + dy < -2 ? ')' : dx + dy > 2 ? '[' : Math.abs(dx) < 0.6 || Math.abs(dy) < 0.6 ? '[' : '(';
  }
  if (strip(x, y)) return x % 5 === (seals[0] + 2) % 5 || x === seals[1] + 2 ? 'P' : y === 93 && x % 2 ? ']' : 'p';
  if (!slab(x, y)) return slab(x - 1, y) || slab(x + 1, y) || slab(x, y - 1) || slab(x, y + 1) ? 'k' : null;
  const d = depth(slab, x, y, 4);
  if (d === 1) return x < 36 && y < 60 ? 'h' : 'g';
  if (d === 2) return 'G';
  if (d === 3) return y < 44 || x < 6 ? 'l' : 'M';
  // brass studs down both sides, one by each mark
  if ((x === 5 || x === W - 6) && [16, 31, 48, 65, 82].includes(y)) return 'h';
  if ((x === 5 || x === W - 6) && [17, 32, 49, 66, 83].includes(y)) return 'U';
  const t = part(TITLE, x, y);
  if (t) return t === 'edge' ? (y === TITLE[1] ? 'V' : 'U') : 'M';
  if (y === 20 && x > 6 && x < W - 7) return (x % 6 === 3) ? 'h' : 'G'; // a brass rule under the title
  for (let i = 0; i < 4; i++) {
    const r = part(ROW(i), x, y), [ix, iy] = ICON(i);
    if (r) return r === 'edge' ? (y === ROW(i)[1] || x === ROW(i)[0] ? 'n' : 'l') : 'V'; // sunk: dark rim above, lit below
    if (x >= ix - 1 && x <= ix + 12 && y >= iy - 1 && y <= iy + 12) return x === ix - 1 || y === iy - 1 ? 'M' : 'm';
  }
  return (x * 7 + y * 3) % 23 === 0 ? 'M' : 'm'; // pitted iron
};

const icons = [
  // the wax seal: a disc, lit to the north-west, the Inquisition's I pressed into it
  (x, y) => {
    const dx = x - 5.5, dy = y - 5.5, d = Math.hypot(dx, dy);
    if (d > 5.6) return null;
    if (d > 4.8) return 'k';
    if (Math.abs(dx) < 1 && Math.abs(dy) < 3.2 || Math.abs(dy) > 2.2 && Math.abs(dy) < 3.2 && Math.abs(dx) < 2.5) return '[';
    return dx + dy < -3 ? ')' : '(';
  },
  pic([
    '.hhhhhhhhhh.',
    '.GGGGGGGGGG.',
    '..lFFFFFFl..',
    '..lfFFFFfl..',
    '...lffffl...',
    '....lffl....',
    '....l.fl....',
    '...l..f.l...',
    '..l...f..l..',
    '..l.ffff.l..',
    '.hhhhhhhhhh.',
    '.GGGGGGGGGG.',
  ]),
  pic([
    '.........ppp',
    '........ppPk',
    '.......ppPk.',
    '......ppPk..',
    '.....ppPk...',
    '....ppPk....',
    '...pPPk.....',
    '...PPk......',
    '..hGk.......',
    '..Gk........',
    '.gk.........',
    'k...........',
  ]),
  pic([
    '.....F......',
    '....FfF.....',
    '....fFf.....',
    '.....f......',
    '.....n......',
    '....bbB.....',
    '....bbB.....',
    '....bbB.....',
    '...bbbBB....',
    '..hhhhhhG...',
    '..GGGGGGG...',
    '...GUUUG....',
  ]),
];

export default () => ({ HONOURS: plaque(body, icons) });
