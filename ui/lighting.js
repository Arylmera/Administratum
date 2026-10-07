import { RES } from './sprites.js';
import { T, onTheme } from './theme.js';

// Depth: a light's height z (0 floor, 1 desk, 2 wall; unset: wall above the wall foot, desk below) flattens its
// pool into an ellipse lying on the floor in perspective, the lower the flatter.
const FLAT = [0.7, 0.85, 1];
const flatOf = l => FLAT[l.z ?? (l.y < 44 ? 2 : 1)];

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
let layer = null, beam = null;
onTheme(() => { beam = null; });

// Darkness with light holes (destination-out), then additive glows, beams by day, vignette. w, h: the scene's
// logical size (hallOf); windows: the x of each window (scene.js propsOf), a beam falls from each by day.
export function drawLighting(g, lights, level, t, w, h, windows = []) {
  if (level.beams) {
    if (!beam) {
      beam = g.createLinearGradient(0, 26, 0, 116);
      beam.addColorStop(0, `rgba(${T.light.beam},.16)`);
      beam.addColorStop(1, `rgba(${T.light.beam},0)`);
    }
    g.fillStyle = beam;
    for (const bx of windows.map(x => x - 4)) {
      g.beginPath(); g.moveTo(bx + 9, 26); g.lineTo(bx + 21, 26); g.lineTo(bx + 30, 116); g.lineTo(bx, 116); g.closePath(); g.fill();
    }
    // where each beam meets the floor: a brighter patch, flat as the floor
    g.save();
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35; g.imageSmoothingEnabled = true;
    const patch = glowOf(`rgba(${T.light.beam},1)`);
    for (const x of windows) g.drawImage(patch, x - 4, 108, 30, 10); // the beam's foot spans x - 4 .. x + 26 at y 116
    g.restore();
  }
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
    if (r > 0) d.drawImage(hole, l.x - r, l.y - r * f, 2 * r, 2 * r * f);
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
