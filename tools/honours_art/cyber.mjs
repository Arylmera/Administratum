// Neon Grid (every cyber world): the Leaderboard, a black-glass screen hung on two cables, framed in a cyan neon tube,
// its title on a pink band, scanlines across it, each mark a dark slot with a pink cursor bar, three status LEDs on the
// bezel; signs: a branch graph, a lightning bolt, a stopwatch, a flame.
import { W, TITLE, ICON, ROW, part, rounded, depth, pic, plaque } from './kit.mjs';

const screen = rounded(1, 5, W - 2, 94, 6);
const cable = (x, y) => y < 6 && (x === 15 || x === W - 16);

const body = (x, y) => {
  if (cable(x, y)) return y === 4 ? 'l' : 'M';
  if (!screen(x, y)) return screen(x - 1, y) || screen(x + 1, y) || screen(x, y - 1) || screen(x, y + 1) ? 'k' : null;
  const d = depth(screen, x, y, 4);
  if (d === 1) return 'h';
  if (d === 2) return 'c';
  if (d === 3) return 'C';
  if (y >= 90) return [56, 60, 64].includes(x) && y === 91 ? (x === 64 ? 'a' : 'x') : 'k'; // the bezel's LEDs
  const t = part(TITLE, x, y);
  if (t) return t === 'edge' ? 'Y' : 'x';
  for (let i = 0; i < 4; i++) {
    const [rx, ry, , rh] = ROW(i);
    if (x === rx - 2 && y >= ry + 2 && y < ry + rh - 2) return 'o'; // the cursor bar
    const r = part(ROW(i), x, y);
    if (r) return r === 'edge' ? 'M' : 'n';
    const [ix, iy] = ICON(i);
    if (x >= ix - 1 && x <= ix + 12 && y >= iy - 1 && y <= iy + 12) return x === ix - 1 || x === ix + 12 || y === iy - 1 || y === iy + 12 ? 'G' : 'n';
  }
  if (y === 20 && x > 5 && x < W - 6) return x % 3 ? 'C' : 'c'; // a dashed rule under the title
  return y % 3 === 0 ? 'V' : 'n'; // scanlines
};

const icons = [
  pic([
    '..cc........',
    '..cc........',
    '..c.........',
    '..c....hh...',
    '..c....hh...',
    '..c...c.....',
    '..c..c......',
    '..c.c.......',
    '..cc........',
    '..c.........',
    '.hhh........',
    '.hhh........',
  ]),
  pic([
    '.......hh...',
    '......hh....',
    '.....hh.....',
    '....hh......',
    '...hhhhhh...',
    '.......hh...',
    '......hh....',
    '.....hh.....',
    '....hh......',
    '...hh.......',
    '...h........',
    '............',
  ]),
  pic([
    '.....oo.....',
    '....xxxx....',
    '..xx....xx..',
    '.x...o....x.',
    '.x...o....x.',
    'x....o.....x',
    'x....ooo...x',
    'x..........x',
    '.x........x.',
    '.x........x.',
    '..xx....xx..',
    '....xxxx....',
  ]),
  pic([
    '.....x......',
    '....xx......',
    '....xYx.....',
    '...xYYx..x..',
    '...xYYxx.xx.',
    '..xYYYYxxYx.',
    '..xYhhYYYYx.',
    '.xYhhhhYYYx.',
    '.xYhhhhhYYx.',
    '.xYYhhhhYYx.',
    '..xYYhhYYx..',
    '...xxxxxx...',
  ]),
];

export default () => ({ HONOURS: plaque(body, icons) });
