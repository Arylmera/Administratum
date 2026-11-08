// Arcane Tower (every fantasy world): the Roll of Laurels, an oak tablet under a round arch, its grain running down,
// a gold-leaf border inlaid inside its edge, a crescent moon in the arch, its title on a violet ribbon, each mark a dark
// slate with a gold dot at each end, a violet tassel hanging from its foot; signs: a rune seal, a sand-glass of teal
// sand, an owl feather, a star.
import { W, TITLE, ICON, ROW, part, depth, pic, plaque } from './kit.mjs';

const cx = 35.5, A = 14; // the arch: half an ellipse A px tall over the tablet's full width
const arch = (x, y) => x >= 2 && x <= W - 3 && y <= 86 && (y > A || ((x - cx) / 34) ** 2 + ((y - A - 0.5) / A) ** 2 <= 1);
const tassel = (x, y) => y > 86 && Math.abs(x - cx) <= (y < 89 ? 1 : 2 + (y - 89) / 2);
const moon = (x, y) => Math.hypot(x - 35.5, y - 4.5) <= 2.3 && Math.hypot(x - 36.6, y - 4) > 1.8;

const body = (x, y) => {
  if (tassel(x, y)) return y < 89 ? 'g' : y === 89 ? 'h' : (x + y) % 3 ? 'x' : 'r';
  if (!arch(x, y)) return arch(x - 1, y) || arch(x + 1, y) || arch(x, y - 1) || arch(x, y + 1) ? 'k' : null;
  const d = depth(arch, x, y, 4);
  if (d === 1) return 'L';
  if (d === 3) return y < 40 ? 'h' : 'g'; // the gold-leaf inlay
  if (moon(x, y)) return 'h';
  const t = part(TITLE, x, y);
  if (t) return t === 'edge' ? 'R' : 'r';
  for (let i = 0; i < 4; i++) {
    const [rx, ry, rw, rh] = ROW(i), mid = ry + (rh >> 1);
    if ((x === rx - 2 || x === rx + rw + 1) && (y === mid || y === mid - 1)) return 'h';
    const r = part(ROW(i), x, y);
    if (r) return r === 'edge' ? 'k' : 'W';
  }
  return (x * 3 + (y >> 3)) % 7 === 0 ? 'L' : (x * 5) % 11 === 0 ? 'W' : 'w'; // oak grain, running down
};

const icons = [
  (x, y) => {
    const dx = x - 5.5, dy = y - 5.5, dd = Math.hypot(dx * 1.1, dy);
    if (dd > 5.8) return null;
    if (dd > 5) return 'k';
    const rune = (Math.abs(dx) < 0.6 && Math.abs(dy) < 3.5) || (Math.abs(dx + dy * 0.6) < 0.7 && dy < 0 && dy > -3.5) || (Math.abs(dx - dy * 0.6) < 0.7 && dy > 0 && dy < 3.5);
    return rune ? ')' : dx + dy < -3 ? ')' : dx + dy > 3 ? '[' : '(';
  },
  pic([
    'GhhhhhhhhhhG',
    '.G........G.',
    '..PccccccP..',
    '..PCccccCP..',
    '...PCccCP...',
    '....PccP....',
    '....P..P....',
    '...P.cc.P...',
    '..P.cccc.P..',
    '..PccccccP..',
    '.G........G.',
    'GhhhhhhhhhhG',
  ]),
  pic([
    '.........bb.',
    '.......bbbBk',
    '......bbBBk.',
    '.....bBbBk..',
    '....bBbBk...',
    '...bBBbk....',
    '..bBbBk.....',
    '..BbBk......',
    '..BBk.......',
    '.wk.........',
    'wk..........',
    '............',
  ]),
  pic([
    '.....h......',
    '.....h......',
    '....hFh.....',
    '....hFh.....',
    'hhhhhFhhhhh.',
    '.hhFFFFFhh..',
    '..hhFFFhh...',
    '...hFhFh....',
    '..hFh.hFh...',
    '..hh...hh...',
    '.h.......h..',
    '............',
  ]),
];

export default () => ({ HONOURS: plaque(body, icons) });
