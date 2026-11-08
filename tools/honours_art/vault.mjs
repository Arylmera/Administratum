// Vault 111 (every Fallout world): the Employee of the Week board, a riveted steel panel with chamfered corners in a
// Vault-Tec blue frame pinstriped yellow, its title on a blue band edged yellow, each mark a grey slot with a yellow
// tick, hazard stripes along its foot rail; signs: a thumbs-up, a wrench, a lightning bolt, an atom.
import { W, H, TITLE, ICON, ROW, part, depth, pic, plaque } from './kit.mjs';

const C = 6; // the chamfer
const panel = (x, y) => x >= 1 && x <= W - 2 && y >= 1 && y <= H - 4 && Math.min(x - 1, W - 2 - x) + Math.min(y - 1, H - 4 - y) >= C;

const body = (x, y) => {
  if (!panel(x, y)) return panel(x - 1, y) || panel(x + 1, y) || panel(x, y - 1) || panel(x, y + 1) ? 'k' : null;
  const d = depth(panel, x, y, 5);
  if (d <= 2 && y >= H - 6 && x > C && x < W - 1 - C) return ((x + y) >> 2) % 2 ? 'k' : 'g'; // hazard stripes along the foot
  if (d <= 2) return d === 1 ? 'R' : 'r';
  if (d === 3) return 'g'; // the yellow pinstripe
  if (d === 4) return 'r';
  if (d === 5) return 'M';
  if ((y === 9 || y === H - 12) && (x === 8 || x === W - 9)) return 'l'; // rivets
  const t = part(TITLE, x, y);
  if (t) return t === 'edge' ? 'g' : 'R';
  for (let i = 0; i < 4; i++) {
    const [rx, ry, , rh] = ROW(i);
    if (x === rx - 2 && y > ry + 3 && y < ry + rh - 3) return 'g';
    const r = part(ROW(i), x, y);
    if (r) return r === 'edge' ? (y === ry ? 'V' : 'l') : 'M';
    const [ix, iy] = ICON(i);
    if (x >= ix - 1 && x <= ix + 12 && y >= iy - 1 && y <= iy + 12) return x === ix - 1 || y === iy - 1 ? 'M' : 'm';
  }
  return x % 6 === 0 ? 'l' : x % 6 === 1 ? 'M' : 'm'; // ribbed steel
};

const icons = [
  pic([
    '.....kk.....',
    '....k::k....',
    '....k::k....',
    '....k::k....',
    '.kkkk::kkkk.',
    'kRRk:::::::k',
    'kRRk;:::::k.',
    'kRRk::::::;k',
    'kRRk;:::::k.',
    'kRRk::::::;k',
    'kRRkk;;;;;k.',
    '.kk..kkkkk..',
  ]),
  pic([
    '........ll..',
    '.......l..l.',
    '.......l...l',
    '......ll..l.',
    '.....lll.l..',
    '....lll.....',
    '...lll......',
    '..lll.......',
    '.lll........',
    'Mll.........',
    'MM..........',
    '............',
  ]),
  pic([
    '......ggg...',
    '.....ggg....',
    '....ggg.....',
    '...ggg......',
    '..ggggggg...',
    '.....ggg....',
    '....ggg.....',
    '...ggg......',
    '..gg........',
    '.gg.........',
    '.g..........',
    '............',
  ]),
  (x, y) => {
    const dx = x - 5.5, dy = y - 5.5;
    if (Math.hypot(dx, dy) < 1.2) return 'O';
    const orbit = a => { const u = dx * Math.cos(a) + dy * Math.sin(a), v = -dx * Math.sin(a) + dy * Math.cos(a); return Math.abs(Math.hypot(u / 5.5, v / 2) - 1) < 0.13; };
    return [0, Math.PI / 3, -Math.PI / 3].some(orbit) ? 'c' : null;
  },
];

export default () => ({ HONOURS: plaque(body, icons) });
