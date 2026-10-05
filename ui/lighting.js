import { SCENE } from './layout.js';
import { RES } from './sprites.js';

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
const vignettes = new Map(); // `${h}:${beams}` -> full-scene canvas
function vignette(w, h, beams) {
  const k = `${h}:${beams}`;
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
    vignettes.set(k, c);
  }
  return c;
}
let layer = null, beam = null;

// Darkness with light holes (destination-out), then additive glows, beams by day, vignette. h: the scene's
// logical height (it grows with the hall's bays).
export function drawLighting(g, lights, level, t, h = SCENE.h) {
  const w = SCENE.w;
  if (level.beams) {
    if (!beam) {
      beam = g.createLinearGradient(0, 26, 0, 116);
      beam.addColorStop(0, 'rgba(235,220,180,.16)');
      beam.addColorStop(1, 'rgba(235,220,180,0)');
    }
    g.fillStyle = beam;
    for (const bx of [74, 288]) {
      g.beginPath(); g.moveTo(bx + 9, 26); g.lineTo(bx + 21, 26); g.lineTo(bx + 30, 116); g.lineTo(bx, 116); g.closePath(); g.fill();
    }
  }
  if (!layer || layer.height !== h * RES) {
    layer = document.createElement('canvas');
    layer.width = w * RES; layer.height = h * RES;
    layer.getContext('2d').setTransform(RES, 0, 0, RES, 0, 0);
  }
  hole ??= stamp([[0, 'rgba(0,0,0,1)'], [0.45, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
  const d = layer.getContext('2d');
  d.globalCompositeOperation = 'source-over';
  d.clearRect(0, 0, w, h);
  d.fillStyle = `rgba(6,4,3,${level.dark})`;
  d.fillRect(0, 0, w, h);
  d.globalCompositeOperation = 'destination-out';
  for (const l of lights) {
    const r = l.r * (l.flicker ? 0.94 + 0.06 * Math.sin(t * 9 + l.x) : 1);
    if (r > 0) d.drawImage(hole, l.x - r, l.y - r, 2 * r, 2 * r);
  }
  g.drawImage(layer, 0, 0, w, h);

  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = level.glow;
  g.imageSmoothingEnabled = true; // the stamps scale smoothly (the scene itself is drawn pixelated)
  for (const l of lights) {
    if (!l.color) continue;
    const r = l.r * (l.flicker ? 0.9 + 0.1 * Math.sin(t * 7 + l.y) : 1);
    if (r > 0) g.drawImage(glowOf(l.color), l.x - r, l.y - r, 2 * r, 2 * r);
  }
  g.restore();

  g.drawImage(vignette(w, h, level.beams), 0, 0, w, h);
}
