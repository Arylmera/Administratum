// Depth pass ("2.5D" without new art, docs/superpowers/specs/2026-10-07-depth-2-5d-design.md): shadows under and
// cast by what stands on the floor, ambient occlusion where the floor meets a wall, and the Depth setting that
// turns them on. Lighting's part (light height, beam patches, depth of view) is in lighting.js. Nothing here knows
// the hall's rooms beyond a hallOf() object, so the desktop strip draws the same shadows.
import { RES } from './sprites.js';
import { T, onTheme } from './theme.js';

// The setting (adm.depth, adm.depthDov; settings.js): off draws exactly what the hall drew before depth.
const LEVELS = { off: [], subtle: ['contact', 'ao', 'motion'], full: ['contact', 'ao', 'motion', 'cast', 'height', 'parallax'] };
export const EFFECTS = ['contact', 'ao', 'motion', 'cast', 'height', 'parallax', 'dov'];
export const depth = { level: 'subtle', dov: false };
export const on = effect => (effect === 'dov' ? depth.level === 'full' && depth.dov : LEVELS[depth.level].includes(effect));
const listeners = new Set();
export const onDepth = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export function setDepth(level, dov) {
  level = level in LEVELS ? level : 'subtle';
  if (level === depth.level && !!dov === depth.dov) return;
  Object.assign(depth, { level, dov: !!dov });
  for (const f of listeners) f(depth);
}

export const FLY_H = 12; // logical px between a flying servo-skull and its shadow on the floor

// The opaque span of a frame's bottom 3 art rows (where it touches the floor), logical px from its left; null if empty.
export function footOf(map) {
  let lo = Infinity, hi = -1;
  for (const row of map.slice(-3)) for (let i = 0; i < row.length; i++) if (row[i] !== '.') { lo = Math.min(lo, i); hi = Math.max(hi, i); }
  return hi < 0 ? null : { x0: lo / RES, w: (hi - lo + 1) / RES };
}
// The contact shadow under a frame blitted at (x, y): an ellipse a little wider than its footprint, a third as tall,
// centred on the frame's bottom line.
export function shadowOf(map, x, y) {
  const f = footOf(map);
  if (!f) return null;
  const rx = f.w / 2 + 1.5;
  return { cx: x + f.x0 + f.w / 2, cy: y + map.length / RES, rx, ry: rx / 3 };
}

// Stamps, made on first use (node runs the pure part only): a soft ellipse in the theme's shadow colour.
let soft = null;
onTheme(() => { soft = null; });
function softStamp() {
  if (soft) return soft;
  soft = document.createElement('canvas');
  soft.width = soft.height = 64;
  const x = soft.getContext('2d'), grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(${T.light.shadow},1)`);
  grad.addColorStop(0.55, `rgba(${T.light.shadow},.8)`);
  grad.addColorStop(1, `rgba(${T.light.shadow},0)`);
  x.fillStyle = grad;
  x.fillRect(0, 0, 64, 64);
  return soft;
}
export function contactShadow(g, e, alpha) {
  if (!e || alpha <= 0) return;
  const a0 = g.globalAlpha, s0 = g.imageSmoothingEnabled;
  g.globalAlpha = a0 * alpha; g.imageSmoothingEnabled = true;
  g.drawImage(softStamp(), e.cx - e.rx, e.cy - e.ry, 2 * e.rx, 2 * e.ry);
  g.globalAlpha = a0; g.imageSmoothingEnabled = s0;
}

// A sprite canvas's silhouette in the shadow colour, once per canvas (a theme change makes new sprite canvases).
let silhouettes = new WeakMap();
onTheme(() => { silhouettes = new WeakMap(); });
export function silhouette(cv) {
  let s = silhouettes.get(cv);
  if (!s) silhouettes.set(cv, s = silhouette.make(cv));
  return s;
}
silhouette.make = cv => {
  const s = document.createElement('canvas');
  s.width = cv.width; s.height = cv.height;
  const x = s.getContext('2d');
  x.drawImage(cv, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = `rgb(${T.light.shadow})`;
  x.fillRect(0, 0, s.width, s.height);
  return s;
};
// The silhouette of cv (drawn at box {x, y, w, h}) laid on the floor from its feet (the box's bottom centre), away
// from the point `from`: flattened to 40 %, skewed sideways by how far the light stands to the side, falling north
// of the feet when the light is south of them, south when it is north.
export function castShadow(g, cv, box, from, alpha) {
  if (alpha <= 0) return;
  const fx = box.x + box.w / 2, fy = box.y + box.h, dx = fx - from.x, dy = fy - from.y, d = Math.max(8, Math.hypot(dx, dy));
  const sy = dy < 0 ? 0.4 : -0.4, kx = (-dx / d) * 0.9 * Math.sign(sy);
  g.save();
  g.globalAlpha *= alpha;
  g.translate(fx, fy);
  g.transform(1, 0, kx, sy, 0, 0);
  g.drawImage(silhouette(cv), box.x - fx, box.y - fy, box.w, box.h);
  g.restore();
}

// Ambient occlusion: a dark band on the floor along every wall foot (side: where the wall is). Rects in the hall's
// logical px; the rooms as scene.js drawStatic lays them out (scriptorium 0..sw, east wall sw..rx, right column rx..w
// with the refectorium above split - 10 and the sanctum below split + 30).
const AO = 8;
export function aoBands(hall) {
  const { w, h, sw, rx, split, baseH, dy } = hall, right = w - rx;
  const bands = [
    { x: 0, y: 40, w: sw, h: AO, side: 'n' }, // the scriptorium's back wall
    { x: sw - AO, y: 40, w: AO, h: h - 43, side: 'e' }, // its east wall
    { x: 0, y: h - 3 - AO, w: sw, h: AO, side: 's' }, // its bottom wall (the gate's)
    { x: rx, y: 40, w: right, h: AO, side: 'n' }, // the refectorium's back wall
    { x: rx, y: 40, w: AO, h: split - 50, side: 'w' },
    { x: rx, y: split - 10 - AO, w: right, h: AO, side: 's' }, // the wall between refectorium and sanctum
    { x: rx, y: split + 30, w: right, h: AO, side: 'n' }, // the sanctum's back wall
    { x: rx, y: split + 30, w: AO, h: baseH - split - 30, side: 'w' },
  ];
  if (dy) bands.push({ x: rx, y: baseH - AO, w: right, h: AO, side: 's' }); // the sanctum's bottom wall, bays below
  return bands;
}
const GRAD = { n: [0, 0, 0, 1], s: [0, 1, 0, 0], w: [0, 0, 1, 0], e: [1, 0, 0, 0] }; // from the wall into the room
export function drawAO(g, hall, alpha = 0.45) {
  for (const b of aoBands(hall)) {
    const [x0, y0, x1, y1] = GRAD[b.side];
    const grad = g.createLinearGradient(b.x + x0 * b.w, b.y + y0 * b.h, b.x + x1 * b.w, b.y + y1 * b.h);
    grad.addColorStop(0, `rgba(${T.light.shadow},${alpha})`);
    grad.addColorStop(1, `rgba(${T.light.shadow},0)`);
    g.fillStyle = grad;
    g.fillRect(b.x, b.y, b.w, b.h);
  }
}
