// Vault 111: the Overseer's platform, steel diamond plate inside a Vault-Tec blue band pinstriped yellow, the gear at
// its front, a riser in yellow-and-black hazard stripes; the link a yellow pipe bolted every tile, its end a red valve
// wheel.
import { grid, slab, across, down, cog, ringOf } from './kit.mjs';

const diamond = (x, y) => {
  const px = x % 4, py = y % 4, alt = ((x >> 2) + (y >> 2)) & 1;
  const dash = px >= 1 && px <= 2 && (alt ? px === py : px + py === 3);
  return dash ? 'l' : alt ? (px === py + 1 && px >= 2 ? 'M' : 'm') : (px + py === 4 && px >= 2 ? 'M' : 'm');
};

const platform = w => {
  const T = 45, cx = w / 2, cy = 30, inGear = (x, y) => !!cog(x, y, cx, cy, 8);
  return slab(w, 54, 9, {
    lit: 'R', shade: 'd', faceLit: 'h', faceShade: 'G',
    top: (x, y) => {
      const bx = Math.min(x - 2, w - 3 - x), by = Math.min(y - 2, T - 3 - y);
      if (Math.min(bx, by) === 2) return 'g'; // the yellow pinstripe
      if (bx < 4 || by < 4) return Math.min(bx, by) === 0 ? 'R' : 'r';
      if (Math.min(bx, by) === 4) return 'M';
      const c = cog(x, y, cx, cy, 8);
      if (c) return c === 'hub' ? (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < 1.6 ? 'k' : 'r') : x + y < cx + cy - 4 ? 'h' : x + y > cx + cy + 4 ? 'G' : 'g';
      if (ringOf(inGear, x, y)) return 'k';
      return diamond(x, y);
    },
    front: (x, y) => (((x + y) >> 2) % 2 ? 'k' : 'g'),
  });
};

// The pipe: yellow, lit on its north, a bolted steel collar at the start of each tile.
const pipe = (a, c) => (c === 0 || c === 5 ? 'k' : a < 2 ? (c === 1 ? 'l' : c === 4 ? 'M' : a === 0 && c === 2 ? 'l' : 'm')
  : c === 1 ? 'h' : c === 4 ? 'G' : 'g');

export default () => ({
  DAIS: platform(80),
  DAIS_C: platform(60),
  LINK_H: across(pipe),
  LINK_V: down(pipe),
  LINK_END: grid(10, 8, (x, y) => {
    const dx = x - 4.5, dy = (y - 3.5) * 1.25, d = Math.hypot(dx, dy);
    if (d > 4.6) return null;
    if (d > 3.4) return d > 4.1 ? 'k' : 'x'; // the wheel's rim
    if (d < 1.2) return 'l'; // the stem
    return Math.abs(dx) < 0.6 || Math.abs(dy) < 0.6 ? 'a' : 'k'; // spokes
  }),
});
