// Arcane Tower: the Suzerain's summoning circle chalked on the flagstones, a glowing teal ring in its halo, a violet
// inner ring, twelve runes between them and a gold star at its heart (no riser: it lies on the floor); the link an
// arcane thread with sparks, its end a violet sigil.
import { grid, across, down, ellipse } from './kit.mjs';

// Runes, 3x3, one per hour of the circle.
const RUNES = ['#.#.#.#.#', '###.#..#.', '#..##.#..', '.#.###.#.', '##.#..###', '#.##.##.#'];

const circle = w => {
  const e = ellipse(w, 54), cx = w / 2, cy = 27;
  return grid(w, 54, (x, y) => {
    const r = e(x, y);
    if (r >= 1) return null;
    if (r > 0.88) return 'C'; // the halo
    if (r > 0.74) return r > 0.81 ? 'c' : 'O'; // the ring, lit inside
    if (r > 0.66) return 'C';
    for (let k = 0; k < 12; k++) { // a rune at each hour, between the rings
      const a = (k / 12) * 2 * Math.PI, rx = Math.round(cx + Math.cos(a) * (w / 2) * 0.62) - 1, ry = Math.round(cy + Math.sin(a) * 27 * 0.62) - 1;
      if (x >= rx && x < rx + 3 && y >= ry && y < ry + 3) return RUNES[k % RUNES.length][(y - ry) * 3 + (x - rx)] === '#' ? 'O' : null;
    }
    if (r > 0.42 && r < 0.48) return 'x'; // the violet inner ring
    const dx = Math.abs(x + 0.5 - cx), dy = Math.abs(y + 0.5 - cy);
    if (dx + dy * 1.4 < 4) return dx + dy < 1.5 ? 'F' : 'h'; // the gold star at its heart
    if ((dx < 1 && dy < 7) || (dy < 1 && dx < 9)) return 'G';
    return null;
  });
};

// The thread: a teal strand, its glow dotted, a spark every tile.
const thread = (a, c) => (c === 0 || c === 5 ? null : c === 1 || c === 4 ? ((a + c) % 2 ? 'C' : null) : a === 3 ? 'O' : c === 2 ? 'c' : 'C');

export default () => ({
  DAIS: circle(80),
  DAIS_C: circle(60),
  LINK_H: across(thread),
  LINK_V: down(thread),
  LINK_END: grid(10, 8, (x, y) => {
    const d = Math.abs(x - 4.5) / 4.5 + Math.abs(y - 3.5) / 3.5;
    return d > 1 ? null : d > 0.75 ? 'x' : d > 0.4 ? 'C' : 'O';
  }),
});
