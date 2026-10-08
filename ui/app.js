import { SCENE, MAX_W, WALL, WALL_DY, lightLevel, planLayout, hallOf, layoutDepartments } from './layout.js';
import { STRIP_H, stripOf, layoutStrip } from './strip.js';
import { outline } from './outline.js';
import { drawStatic, drawScene, sceneBusy, propsOf } from './scene.js';
import { drawLighting } from './lighting.js';
import { RES, rankOf } from './sprites.js';
import { T, onTheme, setTheme, t } from './theme.js';
import './themes.js'; // registers the themes beyond Tier II
import { Cast, isStale, isQuestion, LAMP_S, FRESH_MS } from './actors.js';
import { initChronicon } from './chronicon.js';
import { settings, store, place, perf, view as scaleSetting, quiet, initSettings, renderSettings } from './settings.js';
import { view as viewMode, setView, onView, sceneSize, toScreen, toFloor, hallView } from './view.js';
import { buildHall39 } from './isohall.js';
import { drawScene39, actorAt39, spriteOf, feetOf } from './scene39.js';
import { quietAt, hhmmOf } from './quiet.js';
import { sunTimes, sunPhase } from './sun.js';
import { invoke, listen, tauri, REMOTE, remoteActions } from './bridge.js';

// The saved theme first: everything below draws in its colours and words (Settings changes it, adm.theme).
setTheme(store.get('adm.theme', 'tier2'));
// The saved view (adm.view): flat or 39°, switched live (caches dropped like a theme change). The strip waits for
// the backend's yes (strip_supported); the hall view draws meanwhile.
const saved = store.get('adm.view', 'flat');
setView(hallView(saved));
if (saved === 'strip' && !REMOTE) invoke('strip_supported').then(ok => ok && setView('strip'), () => {});
// The page follows the theme: its chrome colours (CSS variables, T.ui), its marked texts (data-t, data-t-title,
// data-t-aria), and the wording of the PC's toasts (main.rs set_toast_text).
let chromeSet = [];
function applyChrome() {
  const root = document.documentElement.style;
  for (const k of chromeSet) root.removeProperty(k);
  chromeSet = Object.keys(T.ui);
  for (const [k, v] of Object.entries(T.ui)) root.setProperty(k, v);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bar').trim());
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  for (const el of document.querySelectorAll('[data-t-title]')) el.title = t(el.dataset.tTitle);
  for (const el of document.querySelectorAll('[data-t-aria]')) el.setAttribute('aria-label', t(el.dataset.tAria));
  document.title = t('title');
  if (!REMOTE) invoke('set_toast_text', { petition: t('toast.petition'), question: t('toast.question'), stale: t('toast.stale'), needed: t('toast.needed'),
    limit: t('toast.limit'), limitMany: t('toast.limitMany'), failed: t('toast.failed') }).catch(() => {});
}
applyChrome();
onTheme(applyChrome);

const MODES = ['auto', 'full', 'candles'];
const state = { mode: store.get('adm.mode', 'auto'), muted: store.get('adm.muted', '0') === '1' };
// Quiet hours: chimes for new petitions, questions, long tasks and usage limits stay silent (stale ones still chime).
const quietNow = () => quietAt(quiet, new Date());
const quietEl = document.getElementById('quiet');
function renderQuiet() {
  const on = quietNow();
  quietEl.hidden = !on;
  quietEl.title = on ? `Quiet until ${hhmmOf(quiet.to)}` : '';
}

const canvas = document.getElementById('scene');
const g = canvas.getContext('2d'); // the strip needs a transparent canvas; the hall's background blit still covers every pixel
const overlay = document.getElementById('overlay');
let scale = 2;
let size = { ...SCENE }; // the scene's logical size, from the window and the Scale setting (fit)
let hall = hallOf(0); // hallOf(bays, size): the scene's logical height also grows with the layout's bays
// The canvas's logical size: the hall's own in the flat view, the projected hall's in the 39° view (view.js).
const scene = () => sceneSize(hall);
const iso = () => viewMode.mode === '39';
// The desktop strip (view.js): a transparent bar on the taskbar, its pixel size by the Strip size setting (Task 6).
const strip = () => viewMode.strip;
const stripScale = () => ({ S: 1.5, M: 2, L: 2.5 })[settings.stripSize] ?? 2;
const stripCss = () => Math.round(STRIP_H * stripScale()); // the strip's CSS height
// Where a floor point (x, y), up logical px above the floor, is drawn: itself in the flat view (up: straight up the
// screen), projected in the 39° view (view.js). Overlays and hit tests place themselves through it.
const at = (x, y, up = 0) => (iso() ? toScreen(x, y, up) : [x, y - up]);
// Where a character's feet are drawn on the floor: its position, a seated 39° scribe's shifted north (scene39.js).
const feet = a => (iso() ? feetOf(a, spriteOf(a)) : [a.x, a.y]);
function sizeCanvas() {
  const S = scene();
  canvas.width = S.w * RES;
  canvas.height = S.h * RES;
  g.setTransform(RES, 0, 0, RES, 0, 0);
  g.imageSmoothingEnabled = false;
}
sizeCanvas();

const bg = {};
function background(day) {
  const tag = `:${hall.w}x${hall.h}`, k = `${T.id}:${day ? 'day' : 'night'}${tag}`;
  if (!bg[k]) {
    for (const o in bg) if (!o.endsWith(tag) || !o.startsWith(`${T.id}:`)) delete bg[o]; // only this size and theme's day and night
    const c = document.createElement('canvas'), S = scene();
    c.width = S.w * RES; c.height = S.h * RES;
    const cg = c.getContext('2d');
    if (iso()) { // the 39° hall (isohall.js) on the backdrop colour: the canvas is opaque, its corners outside the hall too
      cg.fillStyle = T.ink.backdrop; cg.fillRect(0, 0, c.width, c.height);
      const h39 = buildHall39(hall, day);
      cg.drawImage(h39.canvas, 0, 0);
      c.anchors = h39.anchors; // where the dynamic layer slides the gate's leaves and the doors
    } else {
      cg.setTransform(RES, 0, 0, RES, 0, 0);
      cg.imageSmoothingEnabled = false;
      drawStatic(cg, day, hall);
    }
    bg[k] = c;
  }
  return bg[k];
}
// Desktop strip: the window ignores the cursor except over a hit target; the backend reports the cursor while it
// is over the strip (it gets no pointer events while ignoring them).
let through = null;
const HIT = '.lbl, .plaque, #card, #prefs, #chron, #strip-handle, #strip-menu';
function stripHit(x, y) {
  const el = document.elementFromPoint(x, y);
  return !!el?.closest(HIT) || !!actorAt({ clientX: x, clientY: y });
}
function setThrough(on) {
  if (on === through) return;
  through = on;
  invoke('set_click_through', { on }).catch(() => { through = null; });
}
// Into the strip: the window moves onto the taskbar (place_strip returns the hall's rect the first time, kept for the
// way back in adm.hallRect). Out: the hall's rect back (place_hall turns click-through off). The tray check follows.
let grownTo = 0; // the window's last asked CSS height in the strip (growStrip)
let bootStrip = saved === 'strip'; // started in the strip: the window's rect is the last session's strip, not a hall
async function enterStrip() {
  grownTo = stripCss();
  const r = await invoke('place_strip', { height: grownTo });
  if (r && !bootStrip) store.set('adm.hallRect', JSON.stringify(r));
  bootStrip = false;
  if (!strip()) return; // a leave was queued behind this enter: let it undo the move instead
  setThrough(true);
  invoke('set_strip_menu', { on: true }).catch(() => {});
  growStrip();
}
async function leaveStrip() {
  through = null; grownTo = 0;
  const r = store.get('adm.hallRect');
  await invoke('place_hall', { rect: r ? JSON.parse(r) : null });
  if (strip()) return; // a newer enter is queued behind this leave: let it redo the move instead
  invoke('set_strip_menu', { on: false }).catch(() => {});
}
// Enter/leave touch the OS window and a shared backend rect: serialised through one chain so a quick switch back
// and forth can't let a leave read a stale/missing hallRect mid-enter, or land its set_strip_menu after a newer enter's.
let switching = Promise.resolve();
// The strip's window grows upward while a panel (card, Settings, Chronicon, the handle's menu) is open above it, and
// shrinks back when they close; the stage stays pinned to the bottom (index.html). Also replays a Strip size change.
function growStrip() {
  if (!strip() || !tauri()) return;
  const open = [...document.querySelectorAll('#card, #prefs, #chron, #strip-menu')].filter(el => el.offsetParent);
  const h = stripCss() + Math.max(0, ...open.map(el => el.offsetHeight + 8));
  if (h !== grownTo) { grownTo = h; invoke('place_strip', { height: h }).catch(() => {}); }
}
{
  const panels = document.querySelectorAll('#card, #prefs, #chron, #strip-menu');
  const ro = new ResizeObserver(growStrip), mo = new MutationObserver(growStrip);
  for (const el of panels) { ro.observe(el); mo.observe(el, { attributes: true, attributeFilter: ['hidden', 'class'] }); }
}
// Strip <-> hall (the tray's check item, the handle's Hall view): back to the hall view it left (adm.hallView).
function toggleStrip() {
  const to = viewMode.strip ? store.get('adm.hallView', 'flat') : 'strip';
  if (to === 'strip') store.set('adm.hallView', viewMode.mode);
  store.set('adm.view', to); setView(to);
}
// The handle: a cog at the strip's left end (over the gate) opening a small menu above it.
const stripMenu = document.getElementById('strip-menu');
document.getElementById('strip-handle').onclick = () => { stripMenu.hidden = !stripMenu.hidden; };
stripMenu.onclick = e => {
  const act = e.target.closest('button')?.dataset.act;
  if (!act) return;
  stripMenu.hidden = true;
  if (act === 'hall') toggleStrip();
  else document.getElementById(act).click(); // the header's own buttons (hidden in the strip): prefs-open, chron-open, hide
};
addEventListener('click', e => { if (!e.target.closest('#strip-menu, #strip-handle')) stripMenu.hidden = true; });
// The view changed (adm.view, Settings): drop the cached background like a theme change, and re-fit (the 39°
// view's canvas is the projected hall's size: the next frame resizes it) on the floor point the old view centred.
onView((mode, prev) => {
  if (mode === 'strip' || prev === 'strip') { // another world: the cast starts over (walks in from the gate)
    document.documentElement.classList.toggle('strip', mode === 'strip');
    if (tauri()) switching = switching.then(() => (mode === 'strip' ? enterStrip() : leaveStrip())).catch(err => console.warn('strip switch', err));
    stripMenu.hidden = true;
    resetCast();
    for (const k in bg) delete bg[k];
    fit(); relayout();
    return;
  }
  const c = viewW ? toFloor((viewW / 2 - pan.x) / scale, (viewH / 2 - pan.y) / scale, WALL, prev) : null;
  for (const k in bg) delete bg[k];
  fit(c);
});

// Auto lighting follows the sun once a location is set: sun times recomputed once a day or when it changes.
let sun = null, sunDay = '';
function sunToday(now) {
  if (Number.isNaN(place.lat) || Number.isNaN(place.lon)) return null;
  if (sunDay !== now.toDateString()) { sunDay = now.toDateString(); sun = sunTimes(now, place.lat, place.lon); }
  return sun;
}
const autoPhase = now => { const s = sunToday(now); return s ? sunPhase(now, s) : undefined; };
const hhmm = d => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
const sunLine = s => (s.polar ? `Polar ${s.polar}` : `Sunrise ${hhmm(s.sunrise)} · Sunset ${hhmm(s.sunset)}`);

// The light level (phase granularity is a minute at most): recomputed here, every minute and on a mode change, not per frame.
let level = null;
function renderModes() {
  const now = new Date(), hour = now.getHours(), s = sunToday(now);
  level = lightLevel(state.mode, hour, autoPhase(now));
  for (const b of document.querySelectorAll('#modes button')) {
    b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
    if (b.dataset.mode === 'auto') {
      b.textContent = `Auto · ${String(hour).padStart(2, '0')}h ${lightLevel('auto', hour, autoPhase(now)).phase}`;
      b.title = s ? sunLine(s) : '';
    }
  }
  renderQuiet();
  renderSettings();
}
function setMode(m) { state.mode = m; store.set('adm.mode', m); renderModes(); }
function cycleMode() { setMode(MODES[(MODES.indexOf(state.mode) + 1) % MODES.length]); }
for (const b of document.querySelectorAll('#modes button')) b.onclick = () => setMode(b.dataset.mode);

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
const stage = document.getElementById('stage'), world = document.getElementById('world');
const pan = { x: 0, y: 0, vx: 0, vy: 0, to: null }; // world offset in the stage (CSS px, <= 0), inertia (px/ms), glide target
let viewW = 0, viewH = 0; // the stage, CSS px
const pannable = () => { const S = scene(); return viewW < S.w * scale - 1 || viewH < S.h * scale - 1; };
const clampPan = (x, y) => { const S = scene(); return { x: Math.min(0, Math.max(viewW - S.w * scale, x)), y: Math.min(0, Math.max(viewH - S.h * scale, y)) }; };
function setPan(x, y) {
  Object.assign(pan, clampPan(x, y));
  world.style.transform = `translate(${Math.round(pan.x)}px, ${Math.round(pan.y)}px)`;
}
const panTo = (x, y) => { pan.to = clampPan(x, y); pan.vx = pan.vy = 0; };
// Depth: while the view pans, the back wall (y < WALL) trails the floor a little (0.92 of its speed), then
// catches up: lag is that offset in logical px, 0 at rest so nothing is ever misaligned once the pan stops.
const PARALLAX = 0.08, LAG_MAX = 1.5, lag = { x: 0, y: 0 };
function panStep(x, y) { // a pan the user makes (drag, glide, coast), as opposed to a resize re-centring the view
  const { x: x0, y: y0 } = pan;
  setPan(x, y);
  const clampLag = v => Math.max(-LAG_MAX, Math.min(LAG_MAX, v));
  lag.x = clampLag(lag.x - PARALLAX * (pan.x - x0) / scale); lag.y = clampLag(lag.y - PARALLAX * (pan.y - y0) / scale);
}
function settleLag(ms) {
  const k = 0.85 ** (ms / 16);
  lag.x = Math.abs(lag.x * k) < 0.05 ? 0 : lag.x * k; lag.y = Math.abs(lag.y * k) < 0.05 ? 0 : lag.y * k;
}
const centreOn = (lx, ly) => panTo(viewW / 2 - lx * scale, viewH / 2 - ly * scale); // a logical point, gliding there
let viewCentre = null; // the logical point at the view's centre, kept through a resize (null: the scene's centre)
function fit(floor) { // floor: a floor point to centre on (a view switch), else the view keeps its logical centre
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
let resizing;
addEventListener('resize', () => { clearTimeout(resizing); resizing = setTimeout(fit, 150); });
addEventListener('scroll', () => scrollTo(0, 0)); // the page never scrolls, only the stage's pan (index.html: overflow clip)
// A new scene size: lay the hall out again (desks glide, scribes walk, the right rooms move with their actors).
function relayout() {
  hall = strip() ? stripOf(size.w) : hallOf(layout.bays ?? 0, size);
  onRoster(pending ?? roster);
}
// Each animation frame (ms since the last): glide to a target, else coast on the drag's inertia.
function stepPan(ms) {
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

// Click-and-hold drag pans once the pointer moves more than 4 px; a shorter move stays a click.
let drag = null, dragged = false;
canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  drag = { x0: e.clientX, y0: e.clientY, px: pan.x, py: pan.y, lx: e.clientX, ly: e.clientY, t: performance.now(), on: false };
  dragged = false; pan.vx = pan.vy = 0; pan.to = null;
});
// Touch (tap = click, one-finger drag = pan; #scene has touch-action: none): a wider slop and hit pad, and the
// tooltip follows the tapped character instead of a hover.
const coarse = matchMedia('(pointer: coarse)');
canvas.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') mouse = e;
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

// Riveted iron plates behind the scene instead of plain black (40x40 art px tile), redrawn per theme.
function backdrop() {
  const c = document.createElement('canvas'); c.width = c.height = 40;
  const t = c.getContext('2d'), r = (x, y, w, h, col) => { t.fillStyle = col; t.fillRect(x, y, w, h); }, I = T.ink;
  r(0, 0, 40, 40, I.backdrop); r(0, 0, 40, 1, I.backdropLit); r(0, 0, 1, 40, I.backdropEdge);
  r(0, 39, 40, 1, I.backdropDark); r(39, 0, 1, 40, I.backdropDark); r(1, 19, 38, 1, I.backdropSeam); r(1, 20, 38, 1, I.backdropSeamLit);
  for (const [x, y] of [[3, 3], [35, 3], [3, 35], [35, 35], [3, 16], [35, 16], [3, 23], [35, 23]]) { r(x, y, 2, 2, I.backdropRivet); r(x, y, 1, 1, I.backdropRivetLit); }
  document.body.style.backgroundImage = `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,.65)), url(${c.toDataURL()})`;
}
backdrop();
onTheme(backdrop);

// 30 fps while anything moves; at rest (nobody walking, no effect, glide, gate or pan, no petition) the idle
// rate (settings, 6-30 fps): only the slow ambient loops (flicker, cogitator, Zs) run then. Every animation is
// time-based (steps capped at 0.25 s, above a 6 fps frame), so only smoothness changes.
const FPS = 30;
function busy(now) {
  if (drag?.on || pan.to || Math.abs(pan.vx) + Math.abs(pan.vy) > 0.02 || lag.x || lag.y || gliding(now) || sceneBusy()) return true;
  for (const a of cast.actors.values()) {
    if (a.path.length || a.wait > 0 || a.fx?.length || a.burn || a.puff > 0 || (a.lamp && a.lamp.t < LAMP_S) || (!a.h && a.s.status === 'waiting')) return true;
  }
  return false;
}
let last = performance.now(), drawn = last, acc = 0, visible = true;
// Paused (setting on; minimised, in the tray or covered: WebView2 visibility or the backend's check): no frame is
// scheduled, CSS animations are frozen (html.paused), the roster is only kept (applied once on resume) and the
// minute/tithe timers skip. The backend fires the toasts; chimes still play. On resume everyone continues from
// where they stood and walks to their current seat (no teleport), the hall reflows in one glide.
const paused = () => perf.pauseHidden && (document.hidden || !visible);
let running = true, pending = null;
function wake() {
  const p = paused();
  document.documentElement.classList.toggle('paused', p);
  if (p) return;
  if (pending) { const r = pending; pending = null; onRoster(r); }
  if (running) return;
  running = true;
  last = drawn = performance.now(); acc = 0;
  renderModes(); refreshTithe?.();
  requestAnimationFrame(frame);
}
addEventListener('visibilitychange', wake);
function frame(now) {
  if (paused()) { running = false; document.documentElement.classList.add('paused'); return; } // wake() restarts the loop
  requestAnimationFrame(frame);
  const ms = Math.min(100, now - last);
  acc += ms / 1000;
  last = now;
  stepPan(ms);
  settleLag(ms);
  const step = 1 / (busy(now) ? FPS : perf.idleFps);
  // Keep the remainder (a 60 Hz pair of 16.6 ms vsyncs counts as one 1/30 step, not three), backlog capped at a step.
  if (acc < step - 0.004) return;
  acc = Math.min(acc - step, step);
  const dt = Math.min(0.25, (now - drawn) / 1000);
  drawn = now;
  cast.update(dt);
  const S = scene();
  if (canvas.width !== S.w * RES || canvas.height !== S.h * RES) { sizeCanvas(); fit(); } // a bay came or went, a resize, the view
  const back = strip() ? null : background(level.beams);
  if (!back) g.clearRect(0, 0, S.w, S.h);
  else g.drawImage(back, 0, 0, S.w, S.h);
  if (back && !iso() && (lag.x || lag.y)) g.drawImage(back, 0, 0, back.width, WALL * RES, lag.x, lag.y, hall.w, WALL); // the back wall, trailing the pan
  const view = glide(now);
  view.hall = hall;
  view.level = level;
  view.mode = viewMode.mode;
  view.anchors = back?.anchors;
  let lights;
  outline.on = strip(); // outlined sprites in the strip only: the hall and the sprite viewer draw without
  try { lights = iso() ? drawScene39(g, view, cast.actors, fillOf, now) : drawScene(g, view, cast.actors, fillOf, now); } finally { outline.on = false; }
  if (back) drawLighting(g, lights, level, now / 1000, S.w, S.h, propsOf(hall).windows);
  renderPlaques(view.blocks);
  syncLabels();
  syncTags(sealTags, 'sealed', sealText, 0, -18);
  syncTags(sheetTags, 'sheets', sheetText, 10, -2);
  syncHover();
  syncEdges();
}

renderModes();
setInterval(() => paused() || renderModes(), 60_000);

// Context window by model family, in tokens (settings panel). Fill = context.tokens / window.
const windowOf = model => 1000 * (/haiku/i.test(model ?? '') ? settings.ctxHaiku : settings.ctxOther);
const fillOf = ctx => (ctx ? ctx.tokens / windowOf(ctx.model) : 0);
const kM = n => (n >= 999_500 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
const contextLine = ctx => `Context · ${ctx ? `${kM(ctx.tokens)} / ${kM(windowOf(ctx.model))} (${Math.round(100 * fillOf(ctx))}%)` : '—'}`;
const modelName = model => { const m = /opus|sonnet|haiku|fable/i.exec(model ?? '')?.[0].toLowerCase(); return m ? m[0].toUpperCase() + m.slice(1) : model ?? 'unrecorded'; };
const rankLine = model => `${modelName(model)} · ${t(`rank.${rankOf(model)}`)}`;

const cast = new Cast();
const deptOrder = [];
const emptyLayout = () => ({ blocks: [], desks: [], seats: new Map(), consoles: [], consoleSeats: new Map(), overflow: 0, plan: [] });
let layout = emptyLayout();
// A switch into or out of the strip: nobody walks between worlds. The plan (desk keys) is geometry-free and stays.
function resetCast() {
  cast.actors.clear(); cast.naps.clear(); tweens.clear();
  layout = { ...emptyLayout(), plan: layout.plan };
}
// Harness only: ?grace=<s> shortens the empty-desk grace (blocks get 5/3 of it). The app's URL has no query.
const GRACE = (s => (s > 0 ? { desk: s * 1000, dept: s * 5000 / 3, shrink: s * 1000 } : {}))(+new URLSearchParams(location.search).get('grace'));
const consoleOrder = new Map(); // dept -> helper ids by console, null = free; a helper keeps its console while it lives
let roster = [];
let sel = null;
const colorOf = dept => T.sash[deptOrder.indexOf(dept) % T.sash.length];
const ago = ms => {
  if (!ms) return '—'; // missing statusUpdatedAt, not a huge elapsed time
  const m = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  return m < 1 ? '<1m' : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`;
};

function onRoster(next) {
  if (paused()) { pending = next; return; } // ponytail: the newest roster wins; wake() applies it
  roster = next;
  for (const s of roster) if (!deptOrder.includes(s.dept)) deptOrder.push(s.dept);
  const napping = cast.napping(roster, (strip() ? stripOf(size.w) : hallOf(0, size)).refectory);
  const depts = deptOrder
    .map(name => ({ name, color: colorOf(name), ids: roster.filter(s => s.dept === name && !napping.has(s.id)).map(s => s.id), helpers: consolesOf(name) }))
    .filter(d => d.ids.length || d.helpers.some(Boolean)); // a dozing scribe's adepts keep working at their consoles
  layout = planLayout(layout, depts, Date.now(), GRACE, size, strip() ? layoutStrip : layoutDepartments);
  hall = strip() ? stripOf(size.w) : hallOf(layout.bays, size);
  // ponytail: sessions past the largest hall's capacity are not drawn; toast + counter still cover their petitions.
  cast.sync(roster.filter(s => layout.seats.has(s.id) || napping.has(s.id)), layout.seats, colorOf, layout.consoleSeats, layout.blocks, hall);
  const n = roster.filter(s => s.status === 'waiting').length, nq = roster.filter(isQuestion).length;
  const count = document.getElementById('count');
  const qs = t('questions', { n: nq });
  count.textContent = n || !nq ? `${t('petitions', { n })}${nq ? ` · ${qs}` : ''}` : qs;
  count.classList.toggle('on', n > 0);
  count.classList.toggle('ask', !n && nq > 0);
  count.classList.toggle('alarm', roster.some(isStale));
  renderCard();
  if (answerable && roster.some(answerable)) probeActions();
}

// Reflows glide: rugs, desks and consoles ease from where they are drawn to their new place over GLIDE_MS;
// the scribes and adepts walk to their new seats on their own (Cast.sync re-routes them).
const GLIDE_MS = 800;
const tweens = new Map(); // key -> { from, to, t0 }, each {x, y, w, h}
const ease = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const XYWH = ['x', 'y', 'w', 'h'];
const same = (p, q) => p.x === q.x && p.y === q.y && p.w === q.w && p.h === q.h;
function tween(key, to, now) {
  let tw = tweens.get(key);
  if (!tw || !same(tw.to, to)) tweens.set(key, tw = { from: tw ? pose(tw, now) : to, to, t0: now });
  tw.to = to; // a fresh layout object with the same place
  tw.seen = now;
  return now - tw.t0 >= GLIDE_MS ? to : { ...to, ...pose(tw, now) }; // settled: no garbage
}
function pose({ from, to, t0 }, now) {
  const k = ease(Math.min(1, (now - t0) / GLIDE_MS)), r = {};
  for (const p of XYWH) if (to[p] != null) r[p] = from[p] + (to[p] - from[p]) * k;
  return r;
}
const gliding = now => { for (const tw of tweens.values()) if (now - tw.t0 < GLIDE_MS) return true; return false; };
function glide(now) {
  const view = {
    blocks: layout.blocks.map(b => tween(`b:${b.name}`, b, now)),
    desks: layout.desks.map(d => tween(`d:${d.key}`, d, now)),
    consoles: layout.consoles.map(c => tween(`c:${c.id}`, c, now)),
  };
  for (const [k, tw] of tweens) if (tw.seen !== now) tweens.delete(k); // gone from the layout
  return view;
}

function consolesOf(dept) {
  const live = roster.filter(s => s.dept === dept).flatMap(s => (s.helpers ?? []).map(h => `${s.id}|${h.id}`));
  const order = (consoleOrder.get(dept) ?? []).map(id => (live.includes(id) ? id : null));
  for (const id of live) if (!order.includes(id)) { const free = order.indexOf(null); if (free < 0) order.push(id); else order[free] = id; }
  while (order.length && order.at(-1) === null) order.pop();
  consoleOrder.set(dept, order);
  return order;
}

// A department's most recently active session: its cwd is what the plaque opens, its branch what the plaque shows.
const deptHead = name => roster.filter(s => s.dept === name).reduce((p, q) => (!p || q.sinceMs > p.sinceMs ? q : p), null);
const shownBranch = b => (b && b !== 'main' && b !== 'master' ? b : '');
function openDept(name) {
  const s = deptHead(name), el = plaques.get(`b:${name}`);
  if (!s || REMOTE) return;
  invoke('open_folder', { path: s.cwd }).catch(err => {
    if (!el) return;
    el.title = String(err); el.classList.add('err');
    setTimeout(() => { el.title = 'Open the folder'; el.classList.remove('err'); }, 5000);
  });
}

// Plaques follow the gliding blocks every frame; elements are kept by key and only touched when they change.
const plaques = new Map();
function renderPlaques(blocks) {
  const want = new Map(blocks.map(b => [`b:${b.name}`, ['plaque', b.name, ...at(b.x + 2, b.y + b.h - 7), b.color, b.w - 4, shownBranch(deptHead(b.name)?.branch)]]));
  if (layout.overflow) want.set('overflow', ['plaque', t('overflow', { n: layout.overflow }), ...at(120 + hall.dx, hall.y1 - 10), T.ink.overflowPlaque]);
  if (!roster.length) { // the empty hall's notice, centred on the scriptorium (its projected width in the 39° view)
    const y = 120 + WALL_DY + (hall.h - SCENE.h) / 2, [x0] = at(0, y), [x1] = at(hall.sw, y), [mx, my] = at(hall.sw / 2, y);
    want.set('empty', ['empty', t('empty'), mx - (x1 - x0) / 2, my, undefined, undefined, '', x1 - x0]);
  }
  for (const [k, el] of plaques) if (!want.has(k)) { el.remove(); plaques.delete(k); }
  for (const [k, [cls, text, x, y, color, maxWidth, branch = '', width]] of want) {
    let el = plaques.get(k);
    if (!el) {
      el = document.createElement('div'); el.className = cls; overlay.appendChild(el); plaques.set(k, el);
      if (k.startsWith('b:') && !REMOTE) { el.classList.add('open'); el.title = 'Open the folder'; el.onclick = () => openDept(k.slice(2)); }
    }
    const css = { left: `${x * scale}px`, top: `${y * scale}px`, maxWidth: maxWidth ? `${maxWidth * scale}px` : '', borderColor: color ?? '', color: color ?? '',
      width: width ? `${width * scale}px` : '' };
    if (el.dataset.text !== `${text}|${branch}`) {
      el.dataset.text = `${text}|${branch}`;
      const sub = document.createElement('span'); sub.className = 'branch'; sub.textContent = branch;
      el.replaceChildren(text, ...(branch ? [sub] : []));
    }
    for (const p in css) if (el.style[p] !== css[p]) el.style[p] = css[p];
  }
}

function renderCard() {
  const card = document.getElementById('card');
  if (cast.actors.get(sel)?.leaving ?? true) sel = null; // the selected character left the hall: deselect it
  const s = roster.find(r => r.id === sel), a = cast.actors.get(sel);
  if (a?.h) {
    card.hidden = false;
    const owner = roster.find(r => r.id === a.owner);
    card.querySelector('.name').textContent = t('adeptOf', { kind: a.h.kind, owner: owner?.name ?? '?' });
    card.querySelector('.title').hidden = true;
    card.querySelector('.meta').textContent = `Model: ${rankLine(a.h.model ?? a.h.context?.model)}`;
    card.querySelector('.ctx').textContent = contextLine(a.h.context);
    card.querySelector('.task').textContent = a.h.task || 'No task given';
    card.querySelector('.path').textContent = '';
    renderAsks(card, null);
    renderTurn(card, null);
    renderAnswer(card, null);
    renderLinks(card, owner);
    return;
  }
  card.hidden = !s;
  if (!s) return;
  card.querySelector('.name').textContent = `${s.name} · ${s.dept}`;
  const title = card.querySelector('.title');
  title.textContent = s.title ?? '';
  title.hidden = !s.title;
  const status = s.background ? t('status.background') : a?.target?.pose === 'nap' ? t('status.napping') : T.text.status[s.status] ? t(`status.${s.status}`) : s.status;
  card.querySelector('.meta').textContent = `${status}${s.waitingFor ? ` (${s.waitingFor})` : ''} · ${ago(s.sinceMs)}`;
  card.querySelector('.ctx').textContent = `${contextLine(s.context)} · ${rankLine(s.context?.model)}`;
  card.querySelector('.task').textContent = s.status === 'waiting' && s.asks ? `Asks to: ${s.asks}` : s.limit ? s.limit.text : s.task;
  card.querySelector('.path').textContent = s.cwd;
  renderAsks(card, s);
  renderTurn(card, s);
  renderAnswer(card, s);
  renderLinks(card, s);
}

// A question petition: what the scribe asks, in full (the label only says "question").
function renderAsks(card, s) {
  const el = card.querySelector('.asks'), q = s && isQuestion(s) ? s.question : '';
  el.hidden = !q;
  if (el.dataset.q === q) return;
  el.dataset.q = q;
  const b = document.createElement('b'); b.textContent = 'Asks: ';
  el.replaceChildren(b, q);
}

// The turn in progress (or the last one, frozen at its newest answer): length, tool calls, files changed (backend `turn`).
const expanded = new Set(); // session ids whose file list is shown in full
const span = ms => { const m = Math.floor(ms / 60000); return m < 1 ? '<1 min' : m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}`; };
const filesOf = tr => (tr ? tr.files.length + tr.moreFiles : 0);
function renderTurn(card, s) {
  const line = card.querySelector('.turn'), list = card.querySelector('.files'), tr = s?.turn;
  line.hidden = !tr;
  list.hidden = !filesOf(tr);
  if (!tr) return;
  const working = ['busy', 'shell', 'waiting'].includes(s.status), n = filesOf(tr);
  const took = tr.startedMs ? `${span((working ? Date.now() : tr.lastMs ?? Date.now()) - tr.startedMs)} · ` : '';
  line.textContent = `Turn · ${took}${tr.tools} tool${tr.tools === 1 ? '' : 's'} · ${n} file${n === 1 ? '' : 's'}`;
  const all = expanded.has(s.id), shown = all ? tr.files : tr.files.slice(0, 8);
  const key = `${s.id}|${all}|${tr.files.join('|')}|${tr.moreFiles}`;
  if (list.dataset.key === key) return;
  list.dataset.key = key;
  list.replaceChildren(...shown.map(f => { const li = document.createElement('li'); li.textContent = f; return li; }));
  const rest = n - shown.length;
  if (rest > 0) {
    const li = document.createElement('li');
    if (all) li.textContent = `+${rest} more`;
    else {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'more'; b.textContent = `+${rest} more`;
      b.onclick = () => { expanded.add(s.id); renderCard(); };
      li.appendChild(b);
    }
    list.appendChild(li);
  }
}

// Permission petitions in an Orca terminal can be answered from here: the backend checks the screen
// really shows the dialog before typing one option key. Free-text petitions only get "Open in Orca".
const answerable = s => s?.status === 'waiting' && !!s.orca && /approve|permission/i.test(s.waitingFor ?? '');
// Remote view: buttons only while the PC allows remote actions (probed every 10 s at most, and a 403 turns them off).
let actions = !REMOTE, probed = 0;
function probeActions() {
  if (!REMOTE || Date.now() - probed < 10_000) return;
  probed = Date.now();
  remoteActions().then(ok => { if (ok !== actions) { actions = ok; renderCard(); } });
}
const canAnswer = s => actions && answerable(s);
const episode = s => `${s.id}:${s.sinceMs}`;
const answerErr = new Map(), answering = new Set(); // by episode
function answer(s, choice) {
  const key = episode(s);
  if (answering.has(key)) return;
  answering.add(key); answerErr.delete(key); renderCard();
  invoke('answer_petition', { handle: s.orca, choice }).catch(err => {
    if (err === 'remote actions disabled') { actions = false; return; }
    answerErr.set(key, /no permission prompt|screen unavailable/.test(err) ? 'No permission prompt visible — open the terminal' : String(err));
    sel = s.id; // show the error in this scribe's card
  }).finally(() => { answering.delete(key); renderCard(); }); // success: the scribe leaves the queue on a coming roster tick
}
// While the card shows an answerable petition, peek at the dialog (at most every 3 s) so only the options it
// really offers get a button. Peeked labels are screen text: shown via textContent/title only.
let peeked = { key: null, at: 0, busy: false, p: undefined }; // p: undefined pending, null not visible, else {question, yes, always, no}
function peek(s) {
  const key = episode(s);
  if (peeked.key !== key) peeked = { key, at: 0, busy: false, p: undefined };
  const cur = peeked;
  if (cur.busy || Date.now() - cur.at < 3000) return cur.p;
  cur.busy = true; cur.at = Date.now();
  invoke('peek_petition', { handle: s.orca })
    .then(p => { cur.p = p; }, () => { cur.p = null; })
    .finally(() => { cur.busy = false; if (sel === s.id) renderCard(); });
  return cur.p;
}
function renderAnswer(card, s) {
  const row = card.querySelector('.answer'), err = card.querySelector('.err'), q = card.querySelector('.q');
  row.hidden = q.hidden = !canAnswer(s);
  const p = row.hidden ? undefined : peek(s);
  q.textContent = p?.question ?? (p === null ? 'Prompt not visible — buttons will check on click' : '');
  q.classList.toggle('hint', p === null);
  q.hidden ||= !q.textContent;
  card.querySelector('.noact').hidden = !(REMOTE && !actions && answerable(s));
  err.textContent = (s && answerErr.get(episode(s))) ?? '';
  err.hidden = !err.textContent;
  for (const b of row.querySelectorAll('button')) {
    const label = p?.[b.dataset.choice];
    b.hidden = p ? !label : b.dataset.choice === 'always'; // unknown dialog: Approve + Deny only
    b.title = label ?? '';
    b.disabled = !!s && answering.has(episode(s));
    b.onclick = () => answer(s, b.dataset.choice);
  }
}

function renderLinks(card, s) {
  const [orca, web] = card.querySelectorAll('.links button');
  orca.hidden = REMOTE || !s?.orca; web.hidden = !s?.web;
  card.querySelector('.links .note').hidden = !REMOTE || !s?.orca; // the terminal is on the PC's screen
  card.querySelector('.links').hidden = !s?.orca && web.hidden;
  orca.onclick = () => openTarget(`orca:${s.orca}`);
  web.onclick = () => openTarget(`web:${s.web}`);
}

function select(id) {
  sel = sel === id ? null : id;
  const s = roster.find(r => r.id === id);
  if (sel && s?.status === 'waiting') navigator.clipboard?.writeText(`${s.name} ${s.cwd}`).catch(() => {});
  renderCard();
}

// Petitioners keep a compact always-visible label (they must not be missed); everyone else is found by
// clicking/hovering the sprite itself.
const labels = new Map();
function syncLabels() {
  const petition = a => !a.h && !a.leaving && a.pose === 'queue' && (a.s.status === 'waiting' || isQuestion(a.s));
  for (const [id, el] of labels) if (!petition(cast.actors.get(id) ?? {})) { el.remove(); labels.delete(id); }
  for (const a of cast.actors.values()) {
    if (!petition(a)) continue;
    let el = labels.get(a.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'lbl petition';
      overlay.appendChild(el);
      labels.set(a.id, el);
    }
    const asks = isQuestion(a.s), want = asks ? 'question' : a.s.waitingFor ?? 'input needed';
    const key = [a.s.name, want, sel === a.id, ago(a.s.sinceMs), canAnswer(a.s), isStale(a.s)].join('|');
    if (el.dataset.key !== key) {
      el.dataset.key = key;
      el.classList.toggle('question', asks);
      el.classList.toggle('sel', sel === a.id);
      el.classList.toggle('stale', isStale(a.s));
      const who = document.createElement('button');
      who.className = 'who';
      who.onclick = () => pick(a.id);
      who.setAttribute('aria-label', t('petitionLabel', { name: a.s.name, want }));
      const line = (cls, text) => { const s = document.createElement('span'); if (cls) s.className = cls; s.textContent = text; who.appendChild(s); };
      line('', a.s.name);
      line('sub', `${want} · ${ago(a.s.sinceMs)}`);
      el.replaceChildren(who);
      if (canAnswer(a.s)) {
        const ans = document.createElement('div');
        ans.className = 'ans';
        for (const [text, choice, verb] of [['✓', 'yes', 'Approve'], ['✗', 'no', 'Deny']]) {
          const b = document.createElement('button');
          b.textContent = text; b.title = verb;
          b.setAttribute('aria-label', `${verb} ${a.s.name}`);
          b.onclick = () => answer(a.s, choice);
          ans.appendChild(b);
        }
        el.appendChild(ans);
      }
    }
    // Adjacent queue labels alternate height so their text doesn't overlap.
    const qOff = a.target?.queueIdx % 2 === 1 ? 30 : 18;
    const [lx, ly] = at(...feet(a), qOff);
    setStyle(el, { left: `${lx * scale}px`, top: `${ly * scale}px` });
  }
}

// Off-screen awareness: an arrow on each edge of the view that has characters beyond it, with their count; it
// blinks red when one of them petitions, and a click glides the view onto that petitioner (else the nearest one).
const edges = Object.fromEntries(Object.entries({ up: '▲', down: '▼', left: '◀', right: '▶' }).map(([dir, glyph]) => {
  const b = document.createElement('button'), g = document.createElement('span'), n = document.createElement('span');
  b.type = 'button'; b.className = `edge ${dir}`; b.hidden = true;
  g.textContent = glyph; g.setAttribute('aria-hidden', 'true');
  b.append(g, n);
  b.onclick = () => centreOn(...at(b.to.x, b.to.y, 8));
  stage.appendChild(b);
  return [dir, b];
}));
const setStyle = (el, css) => { for (const p in css) if (el.style[p] !== css[p]) el.style[p] = css[p]; };
function syncEdges() {
  const beyond = { up: [], down: [], left: [], right: [] };
  if (pannable()) for (const a of cast.actors.values()) {
    if (a.leaving) continue;
    const [mx, my] = at(a.x, a.y, 8), x = mx * scale + pan.x, y = my * scale + pan.y; // the sprite's middle, in the view
    const off = { left: -x, right: x - viewW, up: -y, down: y - viewH };
    const dir = Object.keys(off).reduce((p, q) => (off[q] > off[p] ? q : p));
    if (off[dir] > 0) beyond[dir].push({ a, x, y, d: off[dir] });
  }
  for (const [dir, b] of Object.entries(edges)) {
    const list = beyond[dir];
    if (b.hidden !== !list.length) b.hidden = !list.length; // an unchanged write still dirties the DOM
    if (b.hidden) continue;
    const pets = list.filter(o => !o.a.h && o.a.s.status === 'waiting');
    const o = pets[0] ?? list.reduce((p, q) => (q.d < p.d ? q : p)); // not t: that is the wording (theme.js)
    const flat = dir === 'up' || dir === 'down', inset = 16;
    const along = `${Math.round(Math.min((flat ? viewW : viewH) - 2 * inset, Math.max(2 * inset, flat ? o.x : o.y)))}px`;
    const edge = { up: inset, down: viewH - inset, left: inset, right: viewW - inset }[dir] + 'px';
    setStyle(b, flat ? { left: along, top: edge } : { left: edge, top: along });
    b.classList.toggle('alarm', pets.length > 0);
    if (b.lastChild.textContent !== String(list.length)) b.lastChild.textContent = list.length;
    const label = `${list.length} beyond the ${dir === 'up' ? 'top' : dir === 'down' ? 'bottom' : dir} edge${pets.length ? `, ${t('petitioning', { n: pets.length })}` : ''}`;
    if (b.title !== label) { b.title = label; b.setAttribute('aria-label', label); }
    b.to = o.a; // read by the click handler set once below
  }
}

// Small read-only tags over characters (a sealed scribe; Task 5's sheet count): one element per actor id, kept while
// textOf(actor) is non-empty, placed at the actor's feet + (dx, dy) logical px.
function syncTags(tags, cls, textOf, dx, dy) {
  for (const [id, el] of tags) { const a = cast.actors.get(id); if (!a || !textOf(a)) { el.remove(); tags.delete(id); } }
  for (const a of cast.actors.values()) {
    const text = textOf(a);
    if (!text) continue;
    let el = tags.get(a.id);
    if (!el) { el = document.createElement('div'); el.className = `lbl tag ${cls}`; overlay.appendChild(el); tags.set(a.id, el); }
    if (el.textContent !== text) el.textContent = text;
    const [fx, fy] = feet(a), [lx, ly] = at(fx + dx, fy, -dy);
    setStyle(el, { left: `${lx * scale}px`, top: `${ly * scale}px` });
  }
}
// A scribe stopped on a usage limit (backend `limit`): sealed until the reset hour.
const sealTags = new Map();
const sealText = a => (!a.h && !a.leaving && a.s.limit && !labels.has(a.id)
  ? (a.s.limit.resetMs ? t('limitLabel', { time: hhmm(new Date(a.s.limit.resetMs)) }) : t('limitSealed')) : '');

// A working scribe's files changed this turn, by its desk.
const sheetTags = new Map();
const sheetText = a => (!a.h && !a.leaving && a.pose === 'desk' && (a.s.status === 'busy' || a.s.status === 'shell') && filesOf(a.s.turn) ? `✎${filesOf(a.s.turn)}` : '');

listen('strip-cursor', ({ payload: p }) => {
  if (!strip()) return;
  if (!p) { mouse = null; setThrough(true); return; }
  mouse = { clientX: p.x, clientY: p.y, pointerType: 'mouse' }; // the hover tip works while clicks pass through
  setThrough(!stripHit(p.x, p.y));
});

// Hover is re-tested every frame from the last mouse position: characters walk under a still cursor.
const tip = document.getElementById('tip');
let mouse = null;
function syncHover() {
  if (strip() && mouse) setThrough(!stripHit(mouse.clientX, mouse.clientY)); // re-decided every frame: a still cursor, a walking scribe
  const h = mouse ? actorAt(mouse) : coarse.matches && sel ? cast.actors.get(sel) : null;
  setStyle(canvas, { cursor: drag?.on ? 'grabbing' : h ? 'pointer' : pannable() ? 'grab' : '' });
  const hide = !h || labels.has(h.id);
  if (tip.hidden !== hide) tip.hidden = hide;
  if (tip.hidden) return;
  tip.textContent = h.h ? h.h.kind : h.s.name;
  const [tx, ty] = at(...feet(h), h.h ? 15 : 18);
  setStyle(tip, { left: `${tx * scale}px`, top: `${ty * scale}px` });
}

// Canvas hit test on the sprite's logical rect (feet at a.x, a.y), padded by 1; the frontmost (largest y) wins. The 39°
// view tests the drawn frame's pixels at its projected place (scene39.js).
function actorAt(e) {
  const r = canvas.getBoundingClientRect(), px = (e.clientX - r.left) / scale, py = (e.clientY - r.top) / scale;
  if (iso()) return actorAt39(px, py, cast.actors.values(), coarse.matches ? 4 : 1);
  let best = null;
  for (const a of cast.actors.values()) {
    const pad = coarse.matches ? 5 : 1, hw = (a.h ? 6 : 8) + pad, ht = (a.h ? 14 : 17) + pad;
    if (!a.leaving && Math.abs(px - a.x) <= hw && py >= a.y - ht && py <= a.y + 1 && (!best || a.y >= best.y)) best = a;
  }
  return best;
}
const ownerOf = a => roster.find(r => r.id === (a.h ? a.owner : a.id));
function openTarget(target) {
  if (REMOTE) { if (target.startsWith('web:')) window.open(target.slice(4), '_blank', 'noopener'); return; } // on this device
  invoke('open_session', { target }).catch(err => console.warn('open_session', err));
}
// Select a character: its card, plus the scribe's (or the adept owner's) Orca terminal.
function pick(id) {
  const a = cast.actors.get(id), s = a && ownerOf(a);
  if (s?.orca) openTarget(`orca:${s.orca}`);
  select(id);
}
const closeCard = () => { if (sel) { sel = null; renderCard(); } };
canvas.onclick = e => {
  if (dragged) { dragged = false; return; } // the end of a pan, not a click
  const a = actorAt(e); if (a) pick(a.id); else closeCard();
};
// Any click outside the card (header, backdrop) closes it; canvas and petition labels handle their own.
addEventListener('click', e => { if (e.target !== canvas && !e.target.closest('#card, .lbl, .edge')) closeCard(); });
canvas.onpointerleave = () => { mouse = null; };
addEventListener('keydown', e => { if (e.key === 'Escape') closeCard(); });

let audio = null;
function chime(notes = [660, 990]) {
  if (state.muted) return;
  try {
    audio ??= new AudioContext();
    const t0 = audio.currentTime;
    notes.forEach((f, i) => {
      const o = audio.createOscillator(), v = audio.createGain(), at = t0 + i * 0.18;
      o.type = 'sine'; o.frequency.value = f;
      v.gain.setValueAtTime(0, at);
      v.gain.linearRampToValueAtTime(0.18, at + 0.02);
      v.gain.exponentialRampToValueAtTime(0.001, at + 0.5);
      o.connect(v).connect(audio.destination);
      o.start(at); o.stop(at + 0.55);
    });
  } catch { /* no audio device: the toast still fires */ }
}

// A browser only lets audio start from a gesture: the first tap or click unlocks the chime.
if (REMOTE) {
  const unlock = () => {
    audio ??= new AudioContext();
    audio.resume().then(() => { if (audio.state === 'running') for (const t of ['touchend', 'click', 'keydown']) removeEventListener(t, unlock, true); }, () => {});
  };
  for (const t of ['touchend', 'click', 'keydown']) addEventListener(t, unlock, true);
}

const muteBtn = document.getElementById('mute');
function renderMute() { muteBtn.classList.toggle('muted', state.muted); muteBtn.setAttribute('aria-label', state.muted ? 'Unmute chime' : 'Mute chime'); renderSettings(); }
function toggleMute() { state.muted = !state.muted; store.set('adm.muted', state.muted ? '1' : '0'); renderMute(); }
muteBtn.onclick = toggleMute;
renderMute();

let refreshTithe = null;
initSettings({ mode: () => state.mode, setMode, muted: () => state.muted, setMuted: m => { if (m !== state.muted) toggleMute(); }, placed: () => { sunDay = ''; renderModes(); }, rescaled: () => { fit(); growStrip(); }, quieted: renderQuiet });
fit();
requestAnimationFrame(frame);
window.ADM_BOOTED = true;
if (tauri() || REMOTE) {
  listen('roster', e => onRoster(e.payload));
  listen('petition', () => quietNow() || chime());
  listen('question', () => quietNow() || chime([880, 1175]));
  listen('petition-stale', () => chime([990, 660, 990, 660]));
  listen('limit', () => quietNow() || chime([520, 390]));
  // Paused: no reaction is queued (it would replay stale on resume); a fresh long task still chimes.
  listen('chronicle', e => { if ((paused() ? Date.now() - e.payload.ts < FRESH_MS : cast.chronicle(e.payload)) && e.payload.kind === 'task-done' && !quietNow()) chime([1320, 1760]); });
  listen('ui-command', e => ({ mute: toggleMute, light: cycleMode, strip: () => { if (!REMOTE) toggleStrip(); } })[e.payload]?.());
  listen('visible', e => { visible = e.payload; wake(); }); // the app's window only
  refreshTithe = initChronicon(colorOf);
}
const hideBtn = document.getElementById('hide');
if (tauri()) hideBtn.onclick = () => { visible = false; wake(); tauri().window.getCurrentWindow().hide(); };
else { hideBtn.remove(); stripMenu.querySelector('[data-act="hide"]').remove(); } // no window to hide in a browser
