// The back wall's slow life (Settings > Appearance > Liveliness; spec 2026-11-23-liveliness, round two): the tall hangings
// sway an art px, a cloud's light drifts over the window glass. Both lie over the cached background: an art px of the
// still cloth left at an edge reads as its outline. Flat coords (39°: scene39.js sets the wall's plane first).
import { MAPS, RES, SHEET_OF, blit } from './sprites.js';
import { T, hexA } from './theme.js';
import { WIN_Y, wallArt } from './wallart.js';
import { rnd } from './liveliness.js';

// The art that moves, by the world that drew it ('' the default art): a hanging of cloth (Neon Grid's are signs, others
// posters), a window on a sky (no cloud in orbit or under a vault). A pack's own art stays still.
const CLOTH = ['', 'tower/'], SKY = ['', 'tower/', 'cyber/', 'darwin/'];
const drawnBy = n => (SHEET_OF[n] ?? '?').replace(/[^/]*$/, '');
// A hanging's frame in a sway pose (1..POSES - 1; 0 is the still frame): each row an art px left or right by a wave
// running down the cloth, the rod still; a row that would lose a pixel stays. Kept per frame.
export const POSES = 8;
const ROD = 8, WAVE = 46; // art rows: the rod's; the wave's length
const swayed = new WeakMap();
export function swayMap(map, pose) {
  if (!pose) return map;
  const by = swayed.get(map) ?? swayed.set(map, []).get(map);
  return by[pose] ??= map.map((r, y) => {
    const dx = Math.round(0.9 * Math.min(1, (y - ROD) / 30) * Math.sin(2 * Math.PI * (pose / POSES - y / WAVE)));
    return dx > 0 && r.at(-1) === '.' ? `.${r.slice(0, -1)}` : dx < 0 && r[0] === '.' ? `${r.slice(1)}.` : r;
  });
}
// The pose at t: gusts of GUST_S every CALM_S or so, still between them.
const CALM_S = 14, GUST_S = 6;
export function poseAt(x, t) {
  const u = (t + CALM_S * rnd(`hanging ${x}`)) % CALM_S;
  return u < GUST_S ? Math.floor(u / GUST_S * 2 * POSES) % POSES : 0;
}

// The hangings that can sway: the tall ones, each with the props drawn over it (their boxes meeting its own).
export function hangingsOf(props) {
  const art = wallArt();
  if (!art.tallHang || !CLOTH.includes(drawnBy('HANGING'))) return [];
  const box = ([name, x, y]) => [x, y, x + MAPS[name][0].length / RES, y + MAPS[name].length / RES];
  return props.flatMap((p, i) => {
    if (p[0] !== 'HANGING') return [];
    const [a, b, c, d] = box(p);
    const over = props.slice(i + 1).filter(q => MAPS[q[0]] && q[0] !== 'HANGING' && (([e, f, g, h]) => e < c && g > a && f < d && h > b)(box(q)));
    return [{ x: p[1], y: p[2], map: p[3] ? art.hangB : MAPS.HANGING, over }];
  });
}
// covered: whether a hanging under another prop sways too, that prop redrawn over it (flat; in 39° it is a volume: no).
export function drawHangings(g, props, t, k, covered = true) {
  if (k) for (const H of hangingsOf(props)) {
    const pose = poseAt(H.x, t * (k < 1 ? 0.5 : 1));
    if (!pose || (H.over.length && !covered)) continue;
    blit(g, swayMap(H.map, pose), H.x, H.y);
    for (const [name, x, y] of H.over) blit(g, MAPS[name], x, y);
  }
}

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
export function drawClouds(g, windows, t, day, k) {
  const { win, winDx } = wallArt(), mask = k && SKY.includes(drawnBy('WINDOW')) ? maskOf(win) : null;
  if (!mask) return;
  const w = mask.width, h = mask.height;
  if (pane?.width !== w || pane?.height !== h) { pane = document.createElement('canvas'); pane.width = w; pane.height = h; }
  const p = pane.getContext('2d'), ink = T.ink.windowDay.u ?? T.px.u;
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
