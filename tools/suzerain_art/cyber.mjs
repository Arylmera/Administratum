// Neon Grid (and every cyber accent): the Suzerain's netrunner plate, a black deck gridded in dim cyan inside a neon
// tube, pink corner brackets and a holo-ring at its front, a dark riser with a light strip; the link an optic fibre
// with data packets, its end a jack with a pink LED.
import { grid, slab, across, down, ellipse } from './kit.mjs';

const plate = w => {
  const T = 45, ring = ellipse(16, 12), cx = w / 2 - 8, cy = 27;
  return slab(w, 54, 9, {
    lit: 'M', shade: 'n', faceLit: 'c', faceShade: 'n',
    top: (x, y) => {
      const bx = Math.min(x - 2, w - 3 - x), by = Math.min(y - 2, T - 3 - y);
      const e = Math.min(bx, by);
      if (e === 1) return 'c'; // the neon tube
      if (e === 0 || e === 2) return 'G'; // its glow
      if ((bx === 4 || by === 4) && bx <= 8 && by <= 8) return 'x'; // pink corner brackets
      if ((bx === 5 || by === 5) && bx <= 7 && by <= 7) return 'Z';
      const r = ring(x - cx, y - cy);
      if (r < 1 && r > 0.55) return r > 0.8 ? 'x' : (x + y) % 3 ? 'Z' : 'O'; // the holo-ring
      if (r <= 0.3) return 'O';
      return (x - 3) % 8 === 0 && (y - 3) % 8 === 0 ? 'C' : (x - 3) % 8 === 0 || (y - 3) % 8 === 0 ? 'V' : 'n';
    },
    front: (x, y) => (y === 49 ? (x % 6 < 4 ? 'h' : 'c') : y === 50 ? 'G' : x % 12 === 6 && y === 52 ? 'x' : 'V'),
  });
};

// The fibre: a cyan core in its glow, a white packet every tile.
const fibre = (a, c) => (c === 0 || c === 5 ? 'k' : c === 1 || c === 4 ? 'G' : a < 2 ? (c === 2 ? 'O' : 'h') : c === 2 ? 'h' : 'c');

export default () => ({
  DAIS: plate(80),
  DAIS_C: plate(60),
  LINK_H: across(fibre),
  LINK_V: down(fibre),
  LINK_END: grid(10, 8, (x, y) => (x === 0 || x === 9 || y === 0 || y === 7 ? 'k' : y === 1 ? 'l' : y === 6 ? 'M'
    : x >= 4 && x <= 5 && y >= 3 && y <= 4 ? (y === 3 ? 'O' : 'x') : x === 2 || x === 7 ? 'c' : 'm')),
});
