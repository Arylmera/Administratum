// Strip only: every sprite gets a 1 art px dark outline so it reads on any wallpaper (blit() in sprites.js draws
// outlined(cv) while outline.on). No art change: the outline is computed from each loaded frame, cached per canvas.
import { T, onTheme } from './theme.js';

export const outline = { on: false };

// alpha: the sprite's alpha channel (w x h); returns a (w + 2) x (h + 2) mask: 1 where a transparent pixel touches
// a solid one (alpha >= 128) on a side. Faint pixels neither get nor make an outline.
export function outlineMask(alpha, w, h) {
  const W = w + 2, H = h + 2, m = new Uint8Array(W * H);
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && alpha[y * w + x] >= 128;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = x - 1, sy = y - 1;
    if (!solid(sx, sy) && (solid(sx - 1, sy) || solid(sx + 1, sy) || solid(sx, sy - 1) || solid(sx, sy + 1))) m[y * W + x] = 1;
  }
  return m;
}

let cache = new WeakMap();
onTheme(() => { cache = new WeakMap(); });
// cv with its outline, 1 art px larger on every side (draw it 1 art px up-left of cv's place).
export function outlined(cv) {
  let o = cache.get(cv);
  if (o) return o;
  const { width: w, height: h } = cv, d = cv.getContext('2d').getImageData(0, 0, w, h).data;
  const alpha = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = d[4 * i + 3];
  const m = outlineMask(alpha, w, h);
  o = document.createElement('canvas'); o.width = w + 2; o.height = h + 2;
  const g = o.getContext('2d'), img = g.createImageData(w + 2, h + 2), [r, gg, b] = hex(T.ink.outline);
  for (let i = 0; i < m.length; i++) if (m[i]) img.data.set([r, gg, b, 255], 4 * i);
  g.putImageData(img, 0, 0);
  g.drawImage(cv, 1, 1);
  cache.set(cv, o);
  return o;
}
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); // '#rrggbb'
