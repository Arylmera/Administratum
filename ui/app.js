import { SCENE, MAX_W, WALL, WALL_DY, lightLevel, planLayout, hallOf, layoutDepartments, breakoutOf } from './layout.js';
import { STRIP_H, FLOOR, GAP, stripOf, layoutStrip } from './strip.js';
import { outline } from './outline.js';
import { drawStatic, drawScene, sceneBusy, propsOf } from './scene.js';
import { drawLighting } from './lighting.js';
import { RES } from './sprites.js';
import { T, onTheme, setTheme, t, hexA } from './theme.js';
import './themes.js'; // registers the themes beyond Tier II
import { Cast, isStale, isQuestion, lanternOf, LAMP_S, FRESH_MS, WATCH_ID, RING_S } from './actors.js';
import { initChronicon } from './chronicon.js';
import { settings, store, place, perf, view as scaleSetting, quiet, initSettings, renderSettings } from './settings.js';
import { view as viewMode, setView, onView, sceneSize, toScreen, toFloor, hallView } from './view.js';
import { buildHall39 } from './isohall.js';
import { drawScene39, actorAt39, spriteOf, feetOf } from './scene39.js';
import { quietAt, hhmmOf } from './quiet.js';
import { sunTimes, sunPhase } from './sun.js';
import { invoke, listen, tauri, REMOTE } from './bridge.js';
import { applyChrome, backdrop } from './chrome.js';
import { glide, gliding, clearGlides } from './glide.js';
import { initCard, sel, fillOf, ago, filesOf, renderCard, answerable, probeActions, canAnswer, answer, pick, closeCard, actionsOn, noActions } from './card.js';
import { vigil, onVigil, secondsLeft, bellDue } from './vigil.js';
import { initStripWin, switchStrip, stripScale, stripHit, setThrough, growStrip, toggleStrip, showMenu } from './stripwin.js';

// The saved theme first: everything below draws in its colours and words (Settings changes it, adm.theme).
setTheme(store.get('adm.theme', 'tier2'));
// The saved view (adm.view): flat or 39°, switched live (caches dropped like a theme change). The strip waits for
// the backend's yes (strip_supported); the hall view draws meanwhile.
const saved = store.get('adm.view', 'flat');
setView(hallView(saved === 'strip' ? store.get('adm.hallView', 'flat') : saved));
document.documentElement.classList.toggle('iso', viewMode.mode === '39'); // the 39° view: no frame round the stage (index.html)
if (saved === 'strip' && !REMOTE) invoke('strip_supported').then(ok => ok && setView('strip'), () => {});
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
    if (iso()) { // the 39° hall (isohall.js), transparent outside it: the page's backdrop shows in its corners (the
      // frame's lighting is cut to the hall's shape too, see frame())
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
// Night Vigil: the header moon arms and cancels it (state from the backend's 'vigil' event, every second), and so
// does the strip menu's entry (toggleVigil, shared so neither duplicates the invoke/error handling). In the remote
// view, only while the PC allows remote actions (card.js's probe; a 403 hides it until the next probe).
const vigilBtn = document.getElementById('vigil');
const stripVigilBtn = document.getElementById('strip-vigil');
function renderVigil() {
  vigilBtn.setAttribute('aria-pressed', String(!!vigil.armed));
  stripVigilBtn.setAttribute('aria-checked', String(!!vigil.armed));
  if (REMOTE) { probeActions(); vigilBtn.hidden = stripVigilBtn.hidden = !actionsOn(); }
}
function toggleVigil() {
  invoke(vigil.armed ? 'vigil_cancel' : 'vigil_arm').catch(err => {
    if (err === 'remote actions disabled') { noActions(); renderVigil(); } else console.warn('vigil', err);
  });
}
vigilBtn.onclick = toggleVigil;
renderVigil();

initStripWin({ actorAt, fromStrip: saved === 'strip', toggleVigil });
// The hall's floor point at its view centre, kept through a stay in the strip (the strip's view says nothing of it).
// Leaving, the window is still strip-sized until place_hall lands: the first hall resize after (refloor) centres
// on it again, the strip-sized fit in between having clamped it.
let hallFloor = null, refloor = false;
const centreFloor = prev => (viewW ? toFloor((viewW / 2 - pan.x) / scale, (viewH / 2 - pan.y) / scale, WALL, prev) : null);
// The view changed (adm.view, Settings): drop the cached background like a theme change, and re-fit (the 39°
// view's canvas is the projected hall's size: the next frame resizes it) on the floor point the old view centred.
onView((mode, prev) => {
  if (mode === 'strip' || prev === 'strip') { // another world: the cast starts over (walks in from the gate)
    if (mode === 'strip') { hallFloor = centreFloor(prev); refloor = false; }
    document.documentElement.classList.toggle('strip', mode === 'strip');
    if (tauri()) switchStrip(mode === 'strip');
    showMenu(false);
    mouse = null; // the strip's cursor is backend-fed, the hall's a pointer event: neither means anything in the other
    resetCast();
    for (const k in bg) delete bg[k];
    if (prev === 'strip') { viewW = 0; refloor = tauri(); } // the strip's stage: no hall centre to keep (hallFloor, else the scene's centre)
    fit(prev === 'strip' ? hallFloor : undefined); relayout();
    return;
  }
  const c = centreFloor(prev);
  document.documentElement.classList.toggle('iso', mode === '39');
  for (const k in bg) delete bg[k];
  fit(c); relayout(); // the 39° view keeps the cogitator's front clear (layIso)
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
  const auto = document.querySelector('#prefs select[name="mode"] option[value="auto"]'); // the lighting choice lives in Settings
  auto.textContent = `Auto · ${String(hour).padStart(2, '0')}h ${lightLevel('auto', hour, autoPhase(now)).phase}`;
  auto.title = s ? sunLine(s) : '';
  renderQuiet();
  renderSettings();
}
function setMode(m) { state.mode = m; store.set('adm.mode', m); renderModes(); }
function cycleMode() { setMode(MODES[(MODES.indexOf(state.mode) + 1) % MODES.length]); }

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
addEventListener('resize', () => {
  clearTimeout(resizing);
  resizing = setTimeout(() => {
    if (!refloor || strip()) return fit();
    refloor = false; viewW = 0; fit(hallFloor);
  }, 150);
});
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

backdrop();
onTheme(backdrop);

// 30 fps while anything moves; at rest (nobody walking, no effect, glide, gate or pan, no petition) the idle
// rate (settings, 6-30 fps): only the slow ambient loops (flicker, cogitator, Zs) run then. Every animation is
// time-based (steps capped at 0.25 s, above a 6 fps frame), so only smoothness changes.
const FPS = 30;
function busy(now) {
  if (drag?.on || pan.to || Math.abs(pan.vx) + Math.abs(pan.vy) > 0.02 || lag.x || lag.y || gliding(now) || sceneBusy()) return true;
  for (const a of cast.actors.values()) {
    if (a.path.length || a.wait > 0 || a.fx?.length || a.burn || a.puff > 0 || (a.lamp && a.lamp.t < LAMP_S) || a.s?.status === 'waiting') return true;
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
  if (!back) {
    g.clearRect(0, 0, S.w, S.h);
    if (strip() && settings.stripBackdrop) { g.fillStyle = hexA(T.ink.backdrop, 0.6); g.fillRect(0, 0, S.w, S.h); }
  }
  else { if (iso()) g.clearRect(0, 0, S.w, S.h); g.drawImage(back, 0, 0, S.w, S.h); }
  if (back && !iso() && (lag.x || lag.y)) g.drawImage(back, 0, 0, back.width, WALL * RES, lag.x, lag.y, hall.w, WALL); // the back wall, trailing the pan
  const view = glide(layout, now);
  view.hall = hall;
  view.level = level;
  view.mode = viewMode.mode;
  view.anchors = back?.anchors;
  let lights;
  outline.on = strip(); // outlined sprites in the strip only: the hall and the sprite viewer draw without
  try { lights = iso() ? drawScene39(g, view, cast.actors, fillOf, now) : drawScene(g, view, cast.actors, fillOf, now); } finally { outline.on = false; }
  const w = cast.actors.get(WATCH_ID);
  if (w) { // the Watchman's lantern; in 39° a pool on the floor under it (lighting.js lifts a desk-height light too far)
    const l = lanternOf(w);
    lights.push({ ...l, ...(iso() && { y: w.y, z: 0 }), r: 20, color: T.light.amber, flicker: true });
  }
  if (back) drawLighting(g, lights, level, now / 1000, S.w, S.h, propsOf(hall).windows);
  if (back && iso()) { g.globalCompositeOperation = 'destination-in'; g.drawImage(back, 0, 0, S.w, S.h); g.globalCompositeOperation = 'source-over'; } // keep only the hall's shape
  renderPlaques(view.blocks);
  syncLabels();
  syncTags(sealTags, 'sealed', sealText, 0, -18);
  syncTags(sheetTags, 'sheets', sheetText, 10, -2);
  syncTags(watchTags, 'petition', watchText, 0, -22);
  syncHover();
  syncEdges();
}

renderModes();
setInterval(() => paused() || renderModes(), 60_000);

const cast = new Cast();
const deptOrder = [];
const emptyLayout = () => ({ blocks: [], desks: [], seats: new Map(), consoles: [], consoleSeats: new Map(), overflow: 0, plan: [] });
let layout = emptyLayout();
// A switch into or out of the strip: nobody walks between worlds. The plan (desk keys) is geometry-free and stays.
function resetCast() {
  cast.actors.clear(); cast.naps.clear(); clearGlides();
  layout = { ...emptyLayout(), plan: layout.plan };
}
// Harness only: ?grace=<s> shortens the empty-desk grace (blocks get 5/3 of it). The app's URL has no query.
const GRACE = (s => (s > 0 ? { desk: s * 1000, dept: s * 5000 / 3, shrink: s * 1000 } : {}))(+new URLSearchParams(location.search).get('grace'));
const consoleOrder = new Map(); // dept -> helper ids by console, null = free; a helper keeps its console while it lives
let roster = [];
initCard({ cast, roster: () => roster });
const colorOf = dept => T.sash[deptOrder.indexOf(dept) % T.sash.length];

const layIso = (plan, o) => layoutDepartments(plan, { ...o, clearCog: true });
function onRoster(next) {
  if (paused()) { pending = next; return; } // ponytail: the newest roster wins; wake() applies it
  roster = next;
  for (const s of roster) if (!deptOrder.includes(s.dept)) deptOrder.push(s.dept);
  const napping = cast.napping(roster, (strip() ? stripOf(size.w) : hallOf(0, size)).refectory);
  const depts = deptOrder
    .map(name => ({ name, color: colorOf(name), temp: roster.some(s => s.dept === name && s.temp), ids: roster.filter(s => s.dept === name && !napping.has(s.id)).map(s => s.id), helpers: consolesOf(name) }))
    .filter(d => d.ids.length || d.helpers.some(Boolean)); // a dozing scribe's adepts keep working at their consoles
  layout = planLayout(layout, depts, Date.now(), GRACE, size, strip() ? layoutStrip : iso() ? layIso : layoutDepartments);
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
  if (roster.some(answerable)) probeActions();
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
const STRIP_PAD = 3; // logical px between a department's plaque and its lecterns, in the strip
// Subscription usage as claude-deck last wrote it (main.rs usage): session and weekly percent and the time to their
// reset. Hidden when claude-deck is absent or its file is over 30 min old (it would show a stale percent).
let usage = null;
const pollUsage = () => invoke('usage').then(u => { usage = u; }, () => {});
pollUsage(); setInterval(() => paused() || pollUsage(), 60_000);
const until = iso => { const m = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 60_000)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
const usageText = () => (usage?.session && usage?.weekly && Date.now() - Date.parse(usage.fetchedAt) < 30 * 60_000
  ? `session ${usage.session.percent}% · ${until(usage.session.resetsAt)} | week ${usage.weekly.percent}% · ${until(usage.weekly.resetsAt)}` : '');
function renderPlaques(blocks) {
  // In the strip the plaque hangs above its lecterns (they stand FLOOR - 30 high), its bottom STRIP_PAD over them.
  const want = new Map(blocks.map(b => [`b:${b.name}`, ['plaque', b.name, ...(strip() ? [b.x + 2, FLOOR - 30 - STRIP_PAD] : at(b.x + 2, b.y + b.h - 7)), b.color, b.w - 4 + (strip() ? GAP - 4 : 0), shownBranch(deptHead(b.name)?.branch), undefined, strip()]])); // the strip's plaque may run over the gap after it
  if (layout.overflow) want.set('overflow', ['plaque', t('overflow', { n: layout.overflow }), ...at(120 + hall.dx, hall.y1 - 10), T.ink.overflowPlaque]);
  const Z = !strip() && breakoutOf(blocks, hall); // the break-out room's name under its fence (the strip has no room for it)
  if (Z) want.set('breakout', ['plaque breakout', t('breakout'), ...at(Z.x + 2, Z.y + Z.h + 1), undefined, Z.w - 4]);
  const u = strip() && usageText(); // the subscription's usage on a banner over the Magos
  // centred over the Magos, or flush with the strip's right end when that would run off it (its width: last frame's)
  const uw = (plaques.get('usage')?.offsetWidth ?? 0) / scale;
  if (u) want.set('usage', ['plaque usage', u, Math.min(hall.magos.x - uw / 2, hall.w - 2 - uw), FLOOR - 30 - STRIP_PAD, undefined, undefined, '', undefined, true]);
  if (!roster.length) { // the empty hall's notice, centred on the scriptorium (its projected width in the 39° view)
    const y = 120 + WALL_DY + (hall.h - SCENE.h) / 2, [x0] = at(0, y), [x1] = at(hall.sw, y), [mx, my] = at(hall.sw / 2, y);
    want.set('empty', ['empty', t('empty'), mx - (x1 - x0) / 2, my, undefined, undefined, '', x1 - x0]);
  }
  for (const [k, el] of plaques) if (!want.has(k)) { el.remove(); plaques.delete(k); }
  for (const [k, [cls, text, x, y, color, maxWidth, branch = '', width, up]] of want) {
    let el = plaques.get(k);
    if (!el) {
      el = document.createElement('div'); el.className = cls; overlay.appendChild(el); plaques.set(k, el);
      if (k.startsWith('b:') && !REMOTE) { el.classList.add('open'); el.title = 'Open the folder'; el.onclick = () => openDept(k.slice(2)); }
    }
    const css = { left: `${x * scale}px`, top: `${y * scale}px`, maxWidth: maxWidth ? `${maxWidth * scale}px` : '', borderColor: color ?? '', color: color ?? '',
      width: width ? `${width * scale}px` : '', transform: up ? 'translateY(-100%)' : '' };
    if (el.dataset.text !== `${text}|${branch}`) {
      el.dataset.text = `${text}|${branch}`;
      const sub = document.createElement('span'); sub.className = 'branch'; sub.textContent = branch;
      el.replaceChildren(text, ...(branch ? [sub] : []));
    }
    for (const p in css) if (el.style[p] !== css[p]) el.style[p] = css[p];
  }
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
    const pets = list.filter(o => o.a.s?.status === 'waiting');
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
const sealText = a => (!a.h && !a.leaving && a.s?.limit && !labels.has(a.id)
  ? (a.s.limit.resetMs ? t('limitLabel', { time: hhmm(new Date(a.s.limit.resetMs)) }) : t('limitSealed')) : '');

// The Watchman at the gate: the countdown's seconds over him.
const watchTags = new Map();
const watchText = a => (a.watch && !a.leaving && vigil.countdownEnd != null ? `${secondsLeft(Date.now())}s` : '');

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
  tip.textContent = h.watch ? t('watch.name') : h.h ? h.h.kind : h.s.name;
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
  // Night Vigil, every second (not per frame: it rings and ticks while paused too): the bell at each 30 s mark of the
  // countdown (the Watchman raises his for RING_S), and the card's "Shutdown in N s".
  let bellS = null;
  listen('vigil', e => {
    onVigil(e.payload); renderVigil();
    const s = secondsLeft(Date.now()), w = cast.actors.get(WATCH_ID);
    if (bellDue(bellS, s)) { chime([660, 660, 660]); if (w) w.ring = RING_S; }
    bellS = s;
    renderCard();
  });
  listen('petition', () => quietNow() || chime());
  listen('question', () => quietNow() || chime([880, 1175]));
  listen('petition-stale', () => chime([990, 660, 990, 660]));
  listen('limit', () => quietNow() || chime([520, 390]));
  // Paused: no reaction is queued (it would replay stale on resume); a fresh long task still chimes.
  listen('chronicle', e => { if ((paused() ? Date.now() - e.payload.ts < FRESH_MS : cast.chronicle(e.payload)) && e.payload.kind === 'task-done' && !quietNow()) chime([1320, 1760]); });
  listen('ui-command', e => ({ mute: toggleMute, light: cycleMode, strip: () => { if (!REMOTE) toggleStrip(); } })[e.payload]?.());
  listen('visible', e => { visible = e.payload; wake(); }); // the app's window only
  listen('strip-hide', () => { visible = false; wake(); }); // a fullscreen app covers the taskbar
  listen('strip-show', () => { visible = true; wake(); });
  refreshTithe = initChronicon(colorOf);
}
const hideBtn = document.getElementById('hide');
const maxBtn = document.getElementById('maximize'), quitBtn = document.getElementById('quit');
if (tauri()) {
  hideBtn.onclick = () => { visible = false; wake(); tauri().window.getCurrentWindow().hide(); };
  maxBtn.onclick = () => tauri().window.getCurrentWindow().toggleMaximize();
  quitBtn.onclick = () => invoke('quit');
} else for (const b of [hideBtn, maxBtn, quitBtn]) b.remove();
