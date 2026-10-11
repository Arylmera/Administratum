import { WALL, lightLevel, planLayout, hallOf, layoutDepartments } from './layout.js';
import { stripOf, layoutStrip } from './strip.js';
import { outline } from './outline.js';
import { drawStatic, drawScene, sceneBusy, propsOf } from './scene.js';
import { drawLighting } from './lighting.js';
import { RES } from './sprites.js';
import { T, onTheme, setTheme, t, hexA } from './theme.js';
import './themes.js'; // registers the themes beyond Tier II
import { Cast, isStale, isQuestion, lanternOf, LAMP_S, FRESH_MS, WATCH_ID, RING_S } from './actors.js';
import { initChronicon } from './chronicon.js';
import { settings, store, place, perf, quiet, initSettings, renderSettings } from './settings.js';
import { view as viewMode, setView, onView, sceneSize, toScreen, toFloor, hallView } from './view.js';
import { buildHall39 } from './isohall.js';
import { drawScene39, actorAt39, spriteOf, feetOf } from './scene39.js';
import { quietAt, hhmmOf } from './quiet.js';
import { sunTimes, sunPhase } from './sun.js';
import { invoke, listen, tauri, REMOTE } from './bridge.js';
import { applyChrome, backdrop } from './chrome.js';
import { glide, gliding, clearGlides } from './glide.js';
import { initCard, fillOf, renderCard, answerable, probeActions, pick, closeCard, actionsOn, noActions } from './card.js';
import { vigil, onVigil, secondsLeft, bellDue } from './vigil.js';
import { initViewport, scale, size, pan, lag, viewW, viewH, drag, dragged, coarse, fit, stepPan, settleLag, setViewW, setDragged } from './viewport.js';
import { initOverlay, renderPlaques, syncLabels, syncTags, syncHover, syncEdges, sealTags, sealText, sheetTags, sheetText, watchTags, watchText } from './overlay.js';
import { initStripWin, switchStrip, stripHit, setThrough, growStrip, toggleStrip, showMenu } from './stripwin.js';

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
    if (prev === 'strip') { setViewW(0); refloor = tauri(); } // the strip's stage: no hall centre to keep (hallFloor, else the scene's centre)
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

let resizing;
addEventListener('resize', () => {
  clearTimeout(resizing);
  resizing = setTimeout(() => {
    if (!refloor || strip()) return fit();
    refloor = false; setViewW(0); fit(hallFloor);
  }, 150);
});
initViewport({ canvas, overlay, scene, iso, strip, at, relayout, setMouse: e => { mouse = e; } }); // scroll, drag-to-pan, double-click, arrow keys (viewport.js)
// A new scene size: lay the hall out again (desks glide, scribes walk, the right rooms move with their actors).
function relayout() {
  hall = strip() ? stripOf(size.w) : hallOf(layout.bays ?? 0, size);
  onRoster(pending ?? roster);
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

initOverlay({ cast, canvas, overlay, at, feet, strip, hall: () => hall, layout: () => layout, roster: () => roster, mouse: () => mouse, actorAt, paused, hhmm }); // plaques, labels, tags, edges, tip (overlay.js)

listen('strip-cursor', ({ payload: p }) => {
  if (!strip()) return;
  if (!p) { mouse = null; setThrough(true); return; }
  mouse = { clientX: p.x, clientY: p.y, pointerType: 'mouse' }; // the hover tip works while clicks pass through
  setThrough(!stripHit(p.x, p.y));
});

let mouse = null; // the last pointer position (pointermove, strip-cursor): overlay.js's syncHover re-tests it every frame

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
  if (dragged) { setDragged(false); return; } // the end of a pan, not a click
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
function renderMute() { muteBtn.classList.toggle('muted', state.muted); muteBtn.setAttribute('aria-label', state.muted ? 'Unmute chime' : 'Mute chime'); renderSettings(); if (!REMOTE) invoke('set_chime_menu', { on: !state.muted }).catch(() => {}); }
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
  refreshTithe = initChronicon(colorOf);
}
const hideBtn = document.getElementById('hide');
const maxBtn = document.getElementById('maximize'), quitBtn = document.getElementById('quit');
if (tauri()) {
  hideBtn.onclick = () => { visible = false; wake(); tauri().window.getCurrentWindow().hide(); };
  maxBtn.onclick = () => tauri().window.getCurrentWindow().toggleMaximize();
  quitBtn.onclick = () => invoke('quit');
} else for (const b of [hideBtn, maxBtn, quitBtn]) b.remove();
