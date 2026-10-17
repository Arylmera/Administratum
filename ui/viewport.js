// The view: the scene's scale and size for the window, the stage's pan (drag, glide, coast, arrow keys), the back wall's parallax lag.
import { SCENE, MAX_W } from './layout.js';
import { STRIP_H } from './strip.js';
import { RES } from './sprites.js';
import { view as scaleSetting } from './settings.js';
import { stripScale } from './stripwin.js';

let canvas, overlay, scene, iso, strip, at, relayout, setMouse; // app.js's (initViewport)
export let scale = 2;
export let size = { ...SCENE }; // the scene's logical size, from the window and the Scale setting (fit)

const FRAME = 12; // CSS px kept around the scene for the brass frame
const FREE_W = 1920; // ponytail: an explicit Scale's widest scene (canvas cost); past it the stage is centred, scale kept
// The window decides the room, the Scale setting the pixel size: the scene is as many logical px as the window
// holds at that scale (never below the minimum SCENE). Auto: the scale of the original look at the default
// 700x500 window (~1.93), kept while the window resizes, and never wider than MAX_W: an ultra-wide window gets
// bigger pixels instead. An explicit Scale is honoured exactly (up to FREE_W wide). Smaller than the minimum, or
// with bays below the window, the stage shows a view of the scene that pans (drag, arrow keys, edge arrows;
// double-click recentres). The 39° view at Auto: the scale shrinks until the whole projected hall fits the window
// (the same logical hall, smaller pixels), so nothing is off-screen; an explicit Scale pans there as in the flat view.
let autoScale = 0;
export let stage; let world; // #stage, #world (initViewport)
export const pan = { x: 0, y: 0, vx: 0, vy: 0, to: null }; // world offset in the stage (CSS px, <= 0), inertia (px/ms), glide target
export let viewW = 0, viewH = 0; // the stage, CSS px
export const pannable = () => { const S = scene(); return viewW < S.w * scale - 1 || viewH < S.h * scale - 1; };
const clampPan = (x, y) => { const S = scene(); return { x: Math.min(0, Math.max(viewW - S.w * scale, x)), y: Math.min(0, Math.max(viewH - S.h * scale, y)) }; };
function setPan(x, y) {
  Object.assign(pan, clampPan(x, y));
  world.style.transform = `translate(${Math.round(pan.x)}px, ${Math.round(pan.y)}px)`;
}
const panTo = (x, y) => { pan.to = clampPan(x, y); pan.vx = pan.vy = 0; };
// Depth: while the view pans, the back wall (y < WALL) trails the floor a little (0.92 of its speed), then
// catches up: lag is that offset in logical px, 0 at rest so nothing is ever misaligned once the pan stops.
const PARALLAX = 0.08;
export const LAG_MAX = 1.5, lag = { x: 0, y: 0 };
function panStep(x, y) { // a pan the user makes (drag, glide, coast), as opposed to a resize re-centring the view
  const { x: x0, y: y0 } = pan;
  setPan(x, y);
  const clampLag = v => Math.max(-LAG_MAX, Math.min(LAG_MAX, v));
  lag.x = clampLag(lag.x - PARALLAX * (pan.x - x0) / scale); lag.y = clampLag(lag.y - PARALLAX * (pan.y - y0) / scale);
}
export function settleLag(ms) {
  const k = 0.85 ** (ms / 16);
  lag.x = Math.abs(lag.x * k) < 0.05 ? 0 : lag.x * k; lag.y = Math.abs(lag.y * k) < 0.05 ? 0 : lag.y * k;
}
export const centreOn = (lx, ly) => panTo(viewW / 2 - lx * scale, viewH / 2 - ly * scale); // a logical point, gliding there
let viewCentre = null; // the logical point at the view's centre, kept through a resize (null: the scene's centre)
export function fit(floor) { // floor: a floor point to centre on (a view switch), else the view keeps its logical centre
  if (strip()) { // the window's whole width, one strip high; nothing to pan
    scale = stripScale();
    const next = { w: Math.floor(innerWidth / scale), h: STRIP_H };
    if (next.w !== size.w || next.h !== size.h) { size = next; relayout(); }
    viewCentre = null;
    const S = scene();
    applySize(S.w * scale, S.h * scale);
    setPan(0, 0);
    return;
  }
  // The laid-out viewport, floored: on a fractional display (125 %) innerWidth/innerHeight are rounded and can
  // be half a px larger than the page, enough to overflow it.
  const vp = document.documentElement.getBoundingClientRect(), head = document.querySelector('header').getBoundingClientRect().bottom;
  const W = Math.max(1, Math.floor(vp.width) - 2 * FRAME), H = Math.max(1, Math.floor(vp.height - head) - 2 * FRAME);
  if (viewW && !floor) viewCentre = { x: (viewW / 2 - pan.x) / scale, y: (viewH / 2 - pan.y) / scale };
  // ponytail: fractional scale; pixelated rendering keeps it crisp enough at any size.
  autoScale ||= Math.min((700 - 2 * FRAME) / SCENE.w, (500 - head - 2 * FRAME) / SCENE.h);
  const auto = scaleSetting.scale === 'auto', maxW = auto ? MAX_W : FREE_W;
  scale = auto ? autoScale : +scaleSetting.scale;
  if (auto && W / scale > MAX_W) scale = Math.max(scale, Math.min(W / MAX_W, H / SCENE.h)); // ultra-wide: bigger pixels
  const next = { w: Math.min(maxW, Math.max(SCENE.w, 2 * Math.floor(W / scale / 2))), h: Math.max(SCENE.h, Math.floor(H / scale)) };
  if (next.w !== size.w || next.h !== size.h) { size = next; relayout(); }
  if (auto && iso()) { const S = scene(); scale = Math.min(scale, W / S.w, H / S.h); }
  if (floor) { scene(); const [x, y] = at(...floor); viewCentre = { x, y }; } // scene(): the 39° offset, fresh
  applySize(W, H);
}
// The stage and the scene's CSS size for the window's W x H (CSS px), the view kept on its logical centre.
function applySize(W, H) {
  const S = scene(), cx = viewCentre?.x ?? S.w / 2, cy = viewCentre?.y ?? S.h / 2;
  viewW = Math.floor(Math.min(S.w * scale, W)); viewH = Math.floor(Math.min(S.h * scale, H));
  stage.style.width = `${viewW}px`; stage.style.height = `${viewH}px`;
  for (const el of [canvas, overlay]) { el.style.width = `${S.w * scale}px`; el.style.height = `${S.h * scale}px`; }
  pan.to = null;
  setPan(viewW / 2 - cx * scale, viewH / 2 - cy * scale);
  const root = document.documentElement.style;
  root.setProperty('--k', Math.min(2.5, Math.max(1, scale / 2)).toFixed(3)); // label/plaque text grows with the scene
  root.setProperty('--px', `${scale}px`); // one logical px (the strip's handle)
  root.setProperty('--tile', `${40 * scale / RES}px`);
}
// app.js's few writes into this state (leaving the strip and a resize forget the view's centre; a click after a pan).
export const setViewW = w => { viewW = w; };
export const setDragged = d => { dragged = d; };
// Each animation frame (ms since the last): glide to a target, else coast on the drag's inertia.
export function stepPan(ms) {
  if (pan.to) {
    const { x, y } = pan.to, k = Math.min(1, ms / 90);
    panStep(pan.x + (x - pan.x) * k, pan.y + (y - pan.y) * k);
    if (Math.abs(x - pan.x) < 0.5 && Math.abs(y - pan.y) < 0.5) { panStep(x, y); pan.to = null; }
  } else if (!drag?.on && Math.abs(pan.vx) + Math.abs(pan.vy) > 0.02) {
    const { x, y } = pan;
    panStep(x + pan.vx * ms, y + pan.vy * ms);
    const f = 0.88 ** (ms / 16);
    pan.vx = pan.x === x ? 0 : pan.vx * f; pan.vy = pan.y === y ? 0 : pan.vy * f; // stops at the scene's edge
  }
}

export let drag = null, dragged = false;
export let coarse; // matchMedia('(pointer: coarse)') (initViewport)
export function initViewport(o) {
  ({ canvas, overlay, scene, iso, strip, at, relayout, setMouse } = o);
  stage = document.getElementById('stage'); world = document.getElementById('world');
  addEventListener('scroll', () => scrollTo(0, 0)); // the page never scrolls, only the stage's pan (index.html: overflow clip)
  // Click-and-hold drag pans once the pointer moves more than 4 px; a shorter move stays a click.
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    drag = { x0: e.clientX, y0: e.clientY, px: pan.x, py: pan.y, lx: e.clientX, ly: e.clientY, t: performance.now(), on: false };
    dragged = false; pan.vx = pan.vy = 0; pan.to = null;
  });
  // Touch (tap = click, one-finger drag = pan; #scene has touch-action: none): a wider slop and hit pad, and the
  // tooltip follows the tapped character instead of a hover.
  coarse = matchMedia('(pointer: coarse)');
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') setMouse(e);
    if (!drag) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.on && Math.hypot(dx, dy) > (coarse.matches ? 10 : 4) && pannable()) { drag.on = true; try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ } canvas.style.cursor = 'grabbing'; }
    if (!drag.on) return;
    const t = performance.now(), dt = Math.max(1, t - drag.t);
    pan.vx = (e.clientX - drag.lx) / dt; pan.vy = (e.clientY - drag.ly) / dt;
    Object.assign(drag, { lx: e.clientX, ly: e.clientY, t });
    panStep(drag.px + dx, drag.py + dy);
  });
  const endDrag = () => {
    if (drag?.on) { dragged = true; if (performance.now() - drag.t > 80) pan.vx = pan.vy = 0; } // held still before letting go: no coast
    drag = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', () => { endDrag(); dragged = false; });
  canvas.ondblclick = () => { if (pannable()) { const S = scene(); centreOn(S.w / 2, S.h / 2); } };
  addEventListener('keydown', e => {
    const d = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (!d || !pannable() || e.target.closest?.('input, select, textarea, #chron, #prefs')) return;
    e.preventDefault();
    const from = pan.to ?? pan;
    panTo(from.x + d[0] * 60, from.y + d[1] * 60);
  });
}
