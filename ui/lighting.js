import { SCENE } from './layout.js';
import { RES } from './sprites.js';

let layer = null;

// Darkness with light holes (destination-out), then additive glows, beams by day, vignette.
export function drawLighting(g, lights, level, t) {
  const w = SCENE.w, h = SCENE.h;
  if (level.beams) {
    for (const bx of [74, 288]) {
      const grad = g.createLinearGradient(0, 26, 0, 116);
      grad.addColorStop(0, 'rgba(235,220,180,.16)');
      grad.addColorStop(1, 'rgba(235,220,180,0)');
      g.fillStyle = grad;
      g.beginPath(); g.moveTo(bx + 9, 26); g.lineTo(bx + 21, 26); g.lineTo(bx + 30, 116); g.lineTo(bx, 116); g.closePath(); g.fill();
    }
  }
  if (!layer) {
    layer = document.createElement('canvas');
    layer.width = w * RES; layer.height = h * RES;
    layer.getContext('2d').setTransform(RES, 0, 0, RES, 0, 0);
  }
  const d = layer.getContext('2d');
  d.globalCompositeOperation = 'source-over';
  d.clearRect(0, 0, w, h);
  d.fillStyle = `rgba(6,4,3,${level.dark})`;
  d.fillRect(0, 0, w, h);
  d.globalCompositeOperation = 'destination-out';
  for (const l of lights) {
    const r = l.r * (l.flicker ? 0.94 + 0.06 * Math.sin(t * 9 + l.x) : 1);
    const grad = d.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.45, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = grad;
    d.fillRect(l.x - r, l.y - r, 2 * r, 2 * r);
  }
  g.drawImage(layer, 0, 0, w, h);

  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = level.glow;
  for (const l of lights) {
    if (!l.color) continue;
    const r = l.r * (l.flicker ? 0.9 + 0.1 * Math.sin(t * 7 + l.y) : 1);
    const grad = g.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
    grad.addColorStop(0, l.color);
    grad.addColorStop(0.7, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(l.x - r, l.y - r, 2 * r, 2 * r);
  }
  g.restore();

  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.62);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, `rgba(0,0,0,${level.beams ? 0.35 : 0.7})`);
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
}
