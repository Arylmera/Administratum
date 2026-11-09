// Breaking Bad (the flat superlab): the board of the week is a steel clipboard, its clip standing proud over the top
// edge, a pale grey lab sheet under it, the title on a light green band and each mark on a white cell (the overlay's
// text is dark in this theme); signs: a blue crystal, an Erlenmeyer flask, a Bunsen flame, a steel drum. Flat: one
// outline colour, no shading.
import { TITLE, ROW, part, rounded, ringOf, pic, plaque } from './kit.mjs';

const board = rounded(2, 4, 69, 93, 3);
const clip = (x, y) => x >= 27 && x <= 44 && y >= 0 && y <= 6;

const body = (x, y) => {
  if (clip(x, y)) return x === 27 || x === 44 || y === 0 || y === 6 || (y === 3 && x >= 31 && x <= 40) ? 'k' : 'h';
  if (!board(x, y)) return ringOf(board, x, y) ? 'k' : null;
  const sheet = part([5, 6, 62, 85], x, y);
  if (!sheet) return 'm';
  if (sheet === 'edge') return 'k';
  const t = part(TITLE, x, y);
  if (t) return t === 'edge' ? 'k' : ')';
  for (let i = 0; i < 4; i++) { const r = part(ROW(i), x, y); if (r) return r === 'edge' ? 'k' : 'p'; }
  return 'w';
};

const icons = [
  pic([
    '.....kk.....',
    '....kook....',
    '...kouuok...',
    '..kouuuuok..',
    '..kuuuuuuk..',
    '.kouuuuuuok.',
    '.kuuuuuuuuk.',
    '..kuuuuuuk..',
    '..kouuuuok..',
    '...kuuuuk...',
    '....kuuk....',
    '.....kk.....',
  ]),
  pic([
    '....kkkk....',
    '....kwwk....',
    '....kwwk....',
    '....kwwk....',
    '...kwwwwk...',
    '...kwwwwk...',
    '..kwwwwwwk..',
    '..kffffffk..',
    '.kffffffffk.',
    '.kffoffoffk.',
    'kffffffffffk',
    'kkkkkkkkkkkk',
  ]),
  pic([
    '.....kk.....',
    '....kfk.....',
    '...kffk.....',
    '...kfOfk....',
    '..kfOOfk....',
    '..kfOOOfk...',
    '..kffOffk...',
    '...kffffk...',
    '....kmmk....',
    '....kmmk....',
    '..kkmmmmkk..',
    '..kkkkkkkk..',
  ]),
  pic([
    '..kkkkkkkk..',
    '.kmmmmmmmmk.',
    '.kkkkkkkkkk.',
    '.khhhhhhhhk.',
    '.khhhhhhhhk.',
    '.kuuuuuuuuk.',
    '.kuuuuuuuuk.',
    '.khhhhhhhhk.',
    '.khhhhhhhhk.',
    '.kkkkkkkkkk.',
    '.kmmmmmmmmk.',
    '..kkkkkkkk..',
  ]),
];

export default () => ({ HONOURS: plaque(body, icons) });
