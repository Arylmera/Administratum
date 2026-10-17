// Orbital Station: the Suzerain's command deck, white deck panels inside a blue LED rail, a docking ring with a cyan
// light at its front, a riser in orange-and-black hazard stripes; the link a white umbilical hose clamped every tile,
// its end a docking port.
import { grid, slab, across, down, ellipse, stones } from './kit.mjs';

const deck = w => {
  const T = 45, ring = ellipse(14, 12), cx = w / 2 - 7, cy = 27;
  return slab(w, 54, 9, {
    lit: 'p', shade: 'P', faceLit: 'k', faceShade: 'k',
    top: (x, y) => {
      const bx = Math.min(x - 2, w - 3 - x), by = Math.min(y - 2, T - 3 - y);
      const e = Math.min(bx, by);
      if (e === 1) return (x + y) % 4 === 0 ? 'h' : 'g'; // the LED rail
      if (e === 0 || e === 2) return 'P';
      const r = ring(x - cx, y - cy);
      if (r < 1) return r > 0.7 ? (y < cy ? 'l' : 'm') : r > 0.5 ? 'M' : r > 0.2 ? 'c' : 'O'; // the docking ring
      return stones(x, y, 5, 5, (w - 10) / 4, 12, { joint: 'P', lit: 'p', shade: 'B', fill: 'b' });
    },
    front: (x, y) => (((x + y) >> 2) % 2 ? 'k' : 'x'), // hazard stripes
  });
};

// The umbilical: a white hose, lit on its north, a steel clamp at the start of each tile.
const hose = (a, c) => (c === 0 || c === 5 ? 'k' : a < 2 ? (c === 1 ? 'l' : c === 4 ? 'M' : 'm') : c === 1 ? 'p' : c === 4 ? 'P' : 'b');

export default () => ({
  DAIS: deck(80),
  DAIS_C: deck(60),
  LINK_H: across(hose),
  LINK_V: down(hose),
  LINK_END: grid(10, 8, (x, y) => {
    const r = ellipse(10, 8)(x, y);
    return r >= 1 ? '.' : r > 0.6 ? (y < 4 ? 'l' : 'M') : r > 0.25 ? 'm' : 'c';
  }),
});
