// The back wall's slow life (Settings > Appearance > Liveliness; spec 2026-11-23-liveliness, round two): a cloud's light
// drifts over the window glass, over the cached background. Flat coords (39°: scene39.js sets the wall's plane first).
import { RES, SHEET_OF } from './sprites.js';
import { T, hexA } from './theme.js';
import { WIN_Y, wallArt } from './wallart.js';
import { rnd } from './liveliness.js';

// The worlds whose windows look on a sky, by what drew them ('' the default art): no cloud in orbit or under a vault. A
// pack's own window stays still.
const SKY = ['', 'tower/', 'cyber/', 'darwin/'];
const drawnBy = n => (SHEET_OF[n] ?? '?').replace(/[^/]*$/, '');

// The cloud's light over a window's sky glass (the frame's `u` slots): a soft band crossing it every CLOUD_S. Its middle
// at t, in window widths from the west edge (-0.8 .. 1.8: in and out of sight).
const CLOUD_S = 34;
export const cloudAt = (x, t) => -0.8 + 2.6 * ((t / CLOUD_S + rnd(`window ${x}`)) % 1);
const masks = new WeakMap();
function maskOf(win) {
  if (!masks.has(win)) {
    const cv = document.createElement('canvas');
    cv.width = win[0].length; cv.height = win.length;
    const m = cv.getContext('2d');
    win.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'u') m.fillRect(x, y, 1, 1); }));
    masks.set(win, win.some(r => r.includes('u')) ? cv : null);
  }
  return masks.get(win);
}
let pane = null;
export const freshPane = () => { pane = null; }; // the tests' own canvas
export function drawClouds(g, windows, t, day, k) {
  const { win, winDx } = wallArt(), mask = k && SKY.includes(drawnBy('WINDOW')) ? maskOf(win) : null;
  if (!mask) return;
  const w = mask.width, h = mask.height;
  if (pane?.width !== w || pane?.height !== h) { pane = document.createElement('canvas'); pane.width = w; pane.height = h; }
  const p = pane.getContext('2d'), ink = /^#[0-9a-f]{6}$/i.test(T.ink.windowDay?.u) ? T.ink.windowDay.u : '#ffffff'; // a pack may write rgb(...): a white cloud
  for (const x of windows) {
    const c = cloudAt(x, t) * w, r = 0.7 * w, grad = p.createLinearGradient(c - r, 0, c + r, h * 0.35);
    grad.addColorStop(0, hexA(ink, 0)); grad.addColorStop(0.5, day ? `rgba(255,255,255,${0.4 * k})` : hexA(ink, 0.55 * k)); grad.addColorStop(1, hexA(ink, 0));
    p.globalCompositeOperation = 'source-over';
    p.clearRect(0, 0, w, h);
    p.fillStyle = grad; p.fillRect(0, 0, w, h);
    p.globalCompositeOperation = 'destination-in';
    p.drawImage(mask, 0, 0);
    g.drawImage(pane, x + winDx, WIN_Y, w / RES, h / RES);
  }
}
