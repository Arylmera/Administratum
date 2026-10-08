import { RES } from './sprites.js';
import { T, onTheme } from './theme.js';
import { WALL } from './layout.js';
import { wallArt } from './wallart.js';
import { view, toScreen } from './view.js';

// Depth: a light's height z (0 floor, 1 desk, 2 wall; unset: wall above the wall foot, desk below) flattens its
// pool into an ellipse lying on the floor in perspective, the lower the flatter.
const FLAT = [0.7, 0.85, 1];
const heightOf = l => l.z ?? (l.y < WALL + 4 ? 2 : 1);
const flatOf = l => l.f ?? FLAT[heightOf(l)];
// The 39° view: a light through the projection (view.js toScreen); a pool on the floor lies flatter (the floor's depth
// is foreshortened about 2:1), one on the wall stays round. A floor light is its floor point, a wall light its point on
// the wall plane. A desk-height light's flat point is drawn h px above a floor point d px south of it (flat 3/4 shows
// height as y): its glow at that height, its pool (px, py: the hole in the dark) flat on the floor under it.
// ponytail: one height for every desk-level light (desk candle flame 20, slate 16, console screen 7, a flying skull 12);
// per-light heights would need the light lists (scene.js) to carry h and d.
export const lift39 = { h: 18, d: 10 };
const FLAT39 = [0.5, 0.5, 1];
const project = l => {
  const k = heightOf(l);
  if (k !== 1) { const [x, y] = toScreen(l.x, l.y); return { ...l, x, y, f: FLAT39[k] }; }
  const yf = l.y + lift39.d, [x, y] = toScreen(l.x, yf, lift39.h), [px, py] = toScreen(l.x, yf);
  return { ...l, x, y, px, py, f: FLAT39[k] };
};
// A beam's trapezoid for the window slot x: its top spans the glass inside the frame (wallArt), its foot is 7 px
// wider each side, 76 px out on the floor; c is its centre line.
function beamOf(x) {
  const { win, winDx, winBottom } = wallArt(), gl = x + winDx + 1, gr = x + winDx + win[0].length / RES - 1;
  const y0 = winBottom - 1, y1 = WALL + 76;
  return { y0, y1, c: (gl + gr) / 2, pts: [[gl, y0], [gr, y0], [gr + 7, y1], [gl - 7, y1]] };
}
const beams = new Map(); // the beams' gradients, by their projected ends (a window's x, the hall's size, the view)

// Every gradient is pre-rendered once: a light is a stamp (a radial gradient on a small canvas) drawn scaled to its
// radius with drawImage, the vignette a canvas per scene size and phase. No gradient is built per frame.
const STAMP = 128;
function stamp(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = STAMP;
  const x = c.getContext('2d'), grad = x.createRadialGradient(STAMP / 2, STAMP / 2, 0, STAMP / 2, STAMP / 2, STAMP / 2);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  x.fillStyle = grad;
  x.fillRect(0, 0, STAMP, STAMP);
  return c;
}
let hole = null;
const glows = new Map(); // light colour -> its glow stamp (the colours are a fixed set of literals)
const glowOf = color => glows.get(color) ?? glows.set(color, stamp([[0, color], [0.7, 'rgba(0,0,0,0)']])).get(color);
const vignettes = new Map(); // `${w}x${h}:${beams}` -> full-scene canvas
function vignette(w, h, beams) {
  const k = `${w}x${h}:${beams}`;
  let c = vignettes.get(k);
  if (!c) {
    if (vignettes.size > 3) vignettes.clear(); // the hall changed size: drop the old ones
    c = document.createElement('canvas');
    c.width = w * RES; c.height = h * RES;
    const x = c.getContext('2d');
    x.setTransform(RES, 0, 0, RES, 0, 0);
    const v = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, `rgba(0,0,0,${beams ? 0.35 : 0.7})`);
    x.fillStyle = v;
    x.fillRect(0, 0, w, h);
    x.fillStyle = farOf(x, h, '0,0,0'); x.fillRect(0, 0, w, h); // depth of view: the far end a little darker
    vignettes.set(k, c);
  }
  return c;
}
// Depth of view: 8 % at the back wall (the top), 0 at the bottom aisle.
const farOf = (x, h, rgb) => {
  const grad = x.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, `rgba(${rgb},.08)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  return grad;
};
let grey = null; // ...and greyer: a grey layer drawn with the saturation blend, per scene size
function greyOf(w, h) {
  if (grey?.width !== w * RES || grey?.height !== h * RES) {
    grey = document.createElement('canvas');
    grey.width = w * RES; grey.height = h * RES;
    const x = grey.getContext('2d');
    x.setTransform(RES, 0, 0, RES, 0, 0);
    x.fillStyle = farOf(x, h, '128,128,128');
    x.fillRect(0, 0, w, h);
  }
  return grey;
}
let layer = null;
onTheme(() => beams.clear());

// By day, a beam from each window: beamOf through the projection (view.js toScreen: as is in Flat), fading from the
// glass to the floor, and a brighter patch where it meets the floor, flat as the floor (thinner in 39°, the floor
// foreshortened). windows: the x of each window slot (scene.js propsOf).
function drawBeams(g, windows) {
  const patch = glowOf(`rgba(${T.light.beam},1)`), ph = view.mode === '39' ? 5 : 10;
  for (const x of windows) {
    const b = beamOf(x), [ax, ay] = toScreen(b.c, b.y0), [ex, ey] = toScreen(b.c, b.y1), k = `${ax},${ay},${ex},${ey}`;
    let grad = beams.get(k);
    if (!grad) {
      if (beams.size > 32) beams.clear();
      grad = g.createLinearGradient(ax, ay, ex, ey);
      grad.addColorStop(0, `rgba(${T.light.beam},.16)`);
      grad.addColorStop(1, `rgba(${T.light.beam},0)`);
      beams.set(k, grad);
    }
    g.fillStyle = grad;
    g.beginPath(); b.pts.forEach(([px, py], i) => (i ? g.lineTo : g.moveTo).call(g, ...toScreen(px, py))); g.closePath(); g.fill();
    const fw = b.pts[2][0] - b.pts[3][0]; // the foot's width
    g.save();
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35; g.imageSmoothingEnabled = true;
    g.drawImage(patch, ex - fw / 2, ey - ph * 0.75, fw, ph);
    g.restore();
  }
}

// Darkness with light holes (destination-out), then additive glows, beams by day, vignette. w, h: the scene's
// logical size (hallOf); windows: the x of each window (scene.js propsOf).
export function drawLighting(g, lights, level, t, w, h, windows = []) {
  if (level.beams) drawBeams(g, windows);
  if (view.mode === '39') lights = lights.map(project);
  if (!layer || layer.width !== w * RES || layer.height !== h * RES) {
    layer = document.createElement('canvas');
    layer.width = w * RES; layer.height = h * RES;
    layer.getContext('2d').setTransform(RES, 0, 0, RES, 0, 0);
  }
  hole ??= stamp([[0, 'rgba(0,0,0,1)'], [0.45, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
  const d = layer.getContext('2d');
  d.globalCompositeOperation = 'source-over';
  d.clearRect(0, 0, w, h);
  d.fillStyle = `rgba(${T.light.night},${level.dark})`;
  d.fillRect(0, 0, w, h);
  d.globalCompositeOperation = 'destination-out';
  for (const l of lights) {
    const r = l.r * (l.flicker ? 0.94 + 0.06 * Math.sin(t * 9 + l.x) : 1), f = flatOf(l);
    if (r > 0) d.drawImage(hole, (l.px ?? l.x) - r, (l.py ?? l.y) - r * f, 2 * r, 2 * r * f); // px, py: 39° pool
  }
  g.drawImage(layer, 0, 0, w, h);

  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = level.glow;
  g.imageSmoothingEnabled = true; // the stamps scale smoothly (the scene itself is drawn pixelated)
  for (const l of lights) {
    if (!l.color) continue;
    const r = l.r * (l.flicker ? 0.9 + 0.1 * Math.sin(t * 7 + l.y) : 1), f = flatOf(l);
    if (r > 0) g.drawImage(glowOf(l.color), l.x - r, l.y - r * f, 2 * r, 2 * r * f);
  }
  g.restore();

  g.save(); g.globalCompositeOperation = 'saturation'; g.drawImage(greyOf(w, h), 0, 0, w, h); g.restore();
  g.drawImage(vignette(w, h, level.beams), 0, 0, w, h);
}
