import { SCENE, MAX_W, lightLevel, planLayout, hallOf } from './layout.js';
import { drawStatic, drawScene, sceneBusy, propsOf } from './scene.js';
import { drawLighting } from './lighting.js';
import { SASH, RES, RANK, rankOf } from './sprites.js';
import { Cast, isStale, isQuestion, LAMP_S, FRESH_MS } from './actors.js';
import { initChronicon } from './chronicon.js';
import { settings, store, place, perf, view as scaleSetting, initSettings, renderSettings } from './settings.js';
import { sunTimes, sunPhase } from './sun.js';
import { invoke, listen, tauri, REMOTE, remoteActions } from './bridge.js';

const MODES = ['auto', 'full', 'candles'];
const state = { mode: store.get('adm.mode', 'auto'), muted: store.get('adm.muted', '0') === '1' };

const canvas = document.getElementById('scene');
const g = canvas.getContext('2d', { alpha: false }); // the background blit covers every pixel
const overlay = document.getElementById('overlay');
let scale = 2;
let size = { ...SCENE }; // the scene's logical size, from the window and the Scale setting (fit)
let hall = hallOf(0); // hallOf(bays, size): the scene's logical height also grows with the layout's bays
function sizeCanvas() {
  canvas.width = hall.w * RES;
  canvas.height = hall.h * RES;
  g.setTransform(RES, 0, 0, RES, 0, 0);
  g.imageSmoothingEnabled = false;
}
sizeCanvas();

const bg = {};
function background(day) {
  const at = `:${hall.w}x${hall.h}`, k = `${day ? 'day' : 'night'}${at}`;
  if (!bg[k]) {
    for (const o in bg) if (!o.endsWith(at)) delete bg[o]; // the hall changed size: drop the old sizes
    const c = document.createElement('canvas');
    c.width = hall.w * RES; c.height = hall.h * RES;
    const cg = c.getContext('2d');
    cg.setTransform(RES, 0, 0, RES, 0, 0);
    cg.imageSmoothingEnabled = false;
    drawStatic(cg, day, hall);
    bg[k] = c;
  }
  return bg[k];
}

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
// double-click recentres).
let autoScale = 0;
const stage = document.getElementById('stage'), world = document.getElementById('world');
const pan = { x: 0, y: 0, vx: 0, vy: 0, to: null }; // world offset in the stage (CSS px, <= 0), inertia (px/ms), glide target
let viewW = 0, viewH = 0; // the stage, CSS px
const pannable = () => viewW < hall.w * scale - 1 || viewH < hall.h * scale - 1;
const clampPan = (x, y) => ({ x: Math.min(0, Math.max(viewW - hall.w * scale, x)), y: Math.min(0, Math.max(viewH - hall.h * scale, y)) });
function setPan(x, y) {
  Object.assign(pan, clampPan(x, y));
  world.style.transform = `translate(${Math.round(pan.x)}px, ${Math.round(pan.y)}px)`;
}
const panTo = (x, y) => { pan.to = clampPan(x, y); pan.vx = pan.vy = 0; };
const centreOn = (lx, ly) => panTo(viewW / 2 - lx * scale, viewH / 2 - ly * scale); // a logical point, gliding there
let viewCentre = null; // the logical point at the view's centre, kept through a resize (null: the scene's centre)
function fit() {
  // The laid-out viewport, floored: on a fractional display (125 %) innerWidth/innerHeight are rounded and can
  // be half a px larger than the page, enough to overflow it.
  const vp = document.documentElement.getBoundingClientRect(), head = document.querySelector('header').getBoundingClientRect().bottom;
  const W = Math.max(1, Math.floor(vp.width) - 2 * FRAME), H = Math.max(1, Math.floor(vp.height - head) - 2 * FRAME);
  if (viewW) viewCentre = { x: (viewW / 2 - pan.x) / scale, y: (viewH / 2 - pan.y) / scale };
  // ponytail: fractional scale; pixelated rendering keeps it crisp enough at any size.
  autoScale ||= Math.min((700 - 2 * FRAME) / SCENE.w, (500 - head - 2 * FRAME) / SCENE.h);
  const auto = scaleSetting.scale === 'auto', maxW = auto ? MAX_W : FREE_W;
  scale = auto ? autoScale : +scaleSetting.scale;
  if (auto && W / scale > MAX_W) scale = Math.max(scale, Math.min(W / MAX_W, H / SCENE.h)); // ultra-wide: bigger pixels
  const next = { w: Math.min(maxW, Math.max(SCENE.w, 2 * Math.floor(W / scale / 2))), h: Math.max(SCENE.h, Math.floor(H / scale)) };
  if (next.w !== size.w || next.h !== size.h) { size = next; relayout(); }
  applySize(W, H);
}
// The stage and the scene's CSS size for the window's W x H (CSS px), the view kept on its logical centre.
function applySize(W, H) {
  const cx = viewCentre?.x ?? hall.w / 2, cy = viewCentre?.y ?? hall.h / 2;
  viewW = Math.floor(Math.min(hall.w * scale, W)); viewH = Math.floor(Math.min(hall.h * scale, H));
  stage.style.width = `${viewW}px`; stage.style.height = `${viewH}px`;
  for (const el of [canvas, overlay]) { el.style.width = `${hall.w * scale}px`; el.style.height = `${hall.h * scale}px`; }
  pan.to = null;
  setPan(viewW / 2 - cx * scale, viewH / 2 - cy * scale);
  const root = document.documentElement.style;
  root.setProperty('--k', Math.min(2.5, Math.max(1, scale / 2)).toFixed(3)); // label/plaque text grows with the scene
  root.setProperty('--tile', `${40 * scale / RES}px`);
}
let resizing;
addEventListener('resize', () => { clearTimeout(resizing); resizing = setTimeout(fit, 150); });
addEventListener('scroll', () => scrollTo(0, 0)); // the page never scrolls, only the stage's pan (index.html: overflow clip)
// A new scene size: lay the hall out again (desks glide, scribes walk, the right rooms move with their actors).
function relayout() {
  hall = hallOf(layout.bays ?? 0, size);
  onRoster(pending ?? roster);
}
// Each animation frame (ms since the last): glide to a target, else coast on the drag's inertia.
function stepPan(ms) {
  if (pan.to) {
    const { x, y } = pan.to, k = Math.min(1, ms / 90);
    setPan(pan.x + (x - pan.x) * k, pan.y + (y - pan.y) * k);
    if (Math.abs(x - pan.x) < 0.5 && Math.abs(y - pan.y) < 0.5) { setPan(x, y); pan.to = null; }
  } else if (!drag?.on && Math.abs(pan.vx) + Math.abs(pan.vy) > 0.02) {
    const { x, y } = pan;
    setPan(x + pan.vx * ms, y + pan.vy * ms);
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
  setPan(drag.px + dx, drag.py + dy);
});
const endDrag = () => {
  if (drag?.on) { dragged = true; if (performance.now() - drag.t > 80) pan.vx = pan.vy = 0; } // held still before letting go: no coast
  drag = null;
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', () => { endDrag(); dragged = false; });
canvas.ondblclick = () => { if (pannable()) centreOn(hall.w / 2, hall.h / 2); };
addEventListener('keydown', e => {
  const d = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
  if (!d || !pannable() || e.target.closest?.('input, select, textarea, #chron, #prefs')) return;
  e.preventDefault();
  const from = pan.to ?? pan;
  panTo(from.x + d[0] * 60, from.y + d[1] * 60);
});

// Riveted iron plates behind the scene instead of plain black (40x40 art px tile).
{
  const c = document.createElement('canvas'); c.width = c.height = 40;
  const t = c.getContext('2d'), r = (x, y, w, h, col) => { t.fillStyle = col; t.fillRect(x, y, w, h); };
  r(0, 0, 40, 40, '#17181b'); r(0, 0, 40, 1, '#24262a'); r(0, 0, 1, 40, '#202226');
  r(0, 39, 40, 1, '#0b0b0c'); r(39, 0, 1, 40, '#0b0b0c'); r(1, 19, 38, 1, '#101113'); r(1, 20, 38, 1, '#1f2124');
  for (const [x, y] of [[3, 3], [35, 3], [3, 35], [35, 35], [3, 16], [35, 16], [3, 23], [35, 23]]) { r(x, y, 2, 2, '#3a3d42'); r(x, y, 1, 1, '#5a5e63'); }
  document.body.style.backgroundImage = `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,.65)), url(${c.toDataURL()})`;
}

// 30 fps while anything moves; at rest (nobody walking, no effect, glide, gate or pan, no petition) the idle
// rate (settings, 6-30 fps): only the slow ambient loops (flicker, cogitator, Zs) run then. Every animation is
// time-based (steps capped at 0.25 s, above a 6 fps frame), so only smoothness changes.
const FPS = 30;
function busy(now) {
  if (drag?.on || pan.to || Math.abs(pan.vx) + Math.abs(pan.vy) > 0.02 || gliding(now) || sceneBusy()) return true;
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
  const step = 1 / (busy(now) ? FPS : perf.idleFps);
  // Keep the remainder (a 60 Hz pair of 16.6 ms vsyncs counts as one 1/30 step, not three), backlog capped at a step.
  if (acc < step - 0.004) return;
  acc = Math.min(acc - step, step);
  const dt = Math.min(0.25, (now - drawn) / 1000);
  drawn = now;
  cast.update(dt);
  if (canvas.width !== hall.w * RES || canvas.height !== hall.h * RES) { sizeCanvas(); fit(); } // a bay came or went, a resize
  g.drawImage(background(level.beams), 0, 0, hall.w, hall.h);
  const view = glide(now);
  view.hall = hall;
  drawLighting(g, drawScene(g, view, cast.actors, fillOf, now), level, now / 1000, hall.w, hall.h, propsOf(hall).windows);
  renderPlaques(view.blocks);
  syncLabels();
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
const rankLine = model => `${modelName(model)} · ${RANK[rankOf(model)].name}`;

const STATUS_TEXT = { busy: 'Writing', shell: 'At the cogitator', idle: 'Turn done, awaiting orders', waiting: 'Petition at your door' };
const cast = new Cast();
const deptOrder = [];
let layout = { blocks: [], desks: [], seats: new Map(), consoles: [], consoleSeats: new Map(), overflow: 0, plan: [] };
// Harness only: ?grace=<s> shortens the empty-desk grace (blocks get 5/3 of it). The app's URL has no query.
const GRACE = (s => (s > 0 ? { desk: s * 1000, dept: s * 5000 / 3, shrink: s * 1000 } : {}))(+new URLSearchParams(location.search).get('grace'));
const consoleOrder = new Map(); // dept -> helper ids by console, null = free; a helper keeps its console while it lives
let roster = [];
let sel = null;
const colorOf = dept => SASH[deptOrder.indexOf(dept) % SASH.length];
const ago = ms => {
  if (!ms) return '—'; // missing statusUpdatedAt, not a huge elapsed time
  const m = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  return m < 1 ? '<1m' : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`;
};

function onRoster(next) {
  if (paused()) { pending = next; return; } // ponytail: the newest roster wins; wake() applies it
  roster = next;
  for (const s of roster) if (!deptOrder.includes(s.dept)) deptOrder.push(s.dept);
  const napping = cast.napping(roster, hallOf(0, size).refectory);
  const depts = deptOrder
    .map(name => ({ name, color: colorOf(name), ids: roster.filter(s => s.dept === name && !napping.has(s.id)).map(s => s.id), helpers: consolesOf(name) }))
    .filter(d => d.ids.length || d.helpers.some(Boolean)); // a dozing scribe's adepts keep working at their consoles
  layout = planLayout(layout, depts, Date.now(), GRACE, size);
  hall = hallOf(layout.bays, size);
  // ponytail: sessions past the largest hall's capacity are not drawn; toast + counter still cover their petitions.
  cast.sync(roster.filter(s => layout.seats.has(s.id) || napping.has(s.id)), layout.seats, colorOf, layout.consoleSeats, layout.blocks, hall);
  const n = roster.filter(s => s.status === 'waiting').length, nq = roster.filter(isQuestion).length;
  const count = document.getElementById('count');
  const qs = `${nq} question${nq === 1 ? '' : 's'}`;
  count.textContent = n || !nq ? `${n} petition${n === 1 ? '' : 's'}${nq ? ` · ${qs}` : ''}` : qs;
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

// Plaques follow the gliding blocks every frame; elements are kept by key and only touched when they change.
const plaques = new Map();
function renderPlaques(blocks) {
  const want = new Map(blocks.map(b => [`b:${b.name}`, ['plaque', b.name, b.x + 2, b.y + b.h - 7, b.color, b.w - 4]]));
  if (layout.overflow) want.set('overflow', ['plaque', `+${layout.overflow} in the stacks`, 120 + hall.dx, hall.y1 - 10, '#8a7a5c']);
  if (!roster.length) want.set('empty', ['empty', 'No scribes on duty', 0, 120 + (hall.h - SCENE.h) / 2]);
  for (const [k, el] of plaques) if (!want.has(k)) { el.remove(); plaques.delete(k); }
  for (const [k, [cls, text, x, y, color, maxWidth]] of want) {
    let el = plaques.get(k);
    if (!el) { el = document.createElement('div'); el.className = cls; overlay.appendChild(el); plaques.set(k, el); }
    const css = { left: `${x * scale}px`, top: `${y * scale}px`, maxWidth: maxWidth ? `${maxWidth * scale}px` : '', borderColor: color ?? '', color: color ?? '',
      width: cls === 'empty' ? `${hall.sw * scale}px` : '' }; // the empty hall's notice, centred on the scriptorium
    if (el.textContent !== text) el.textContent = text;
    for (const p in css) if (el.style[p] !== css[p]) el.style[p] = css[p];
  }
}

function renderCard() {
  const card = document.getElementById('card');
  const s = roster.find(r => r.id === sel), a = cast.actors.get(sel);
  if (a?.h && !a.leaving) {
    card.hidden = false;
    const owner = roster.find(r => r.id === a.owner);
    card.querySelector('.name').textContent = `${a.h.kind} · adept of ${owner?.name ?? '?'}`;
    card.querySelector('.title').hidden = true;
    card.querySelector('.meta').textContent = `Model: ${rankLine(a.h.model ?? a.h.context?.model)}`;
    card.querySelector('.ctx').textContent = contextLine(a.h.context);
    card.querySelector('.task').textContent = a.h.task || 'No task given';
    card.querySelector('.path').textContent = '';
    renderAsks(card, null);
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
  const status = s.background ? 'Idle · background shell running' : a?.target?.pose === 'nap' ? 'Idle · dozing in the Refectorium' : STATUS_TEXT[s.status] ?? s.status;
  card.querySelector('.meta').textContent = `${status}${s.waitingFor ? ` (${s.waitingFor})` : ''} · ${ago(s.sinceMs)}`;
  card.querySelector('.ctx').textContent = `${contextLine(s.context)} · ${rankLine(s.context?.model)}`;
  card.querySelector('.task').textContent = s.status === 'waiting' && s.asks ? `Asks to: ${s.asks}` : s.task;
  card.querySelector('.path').textContent = s.cwd;
  renderAsks(card, s);
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
      who.setAttribute('aria-label', `${a.s.name}, petition: ${want}`);
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
    setStyle(el, { left: `${a.x * scale}px`, top: `${(a.y - qOff) * scale}px` });
  }
}

// Off-screen awareness: an arrow on each edge of the view that has characters beyond it, with their count; it
// blinks red when one of them petitions, and a click glides the view onto that petitioner (else the nearest one).
const edges = Object.fromEntries(Object.entries({ up: '▲', down: '▼', left: '◀', right: '▶' }).map(([dir, glyph]) => {
  const b = document.createElement('button'), g = document.createElement('span'), n = document.createElement('span');
  b.type = 'button'; b.className = `edge ${dir}`; b.hidden = true;
  g.textContent = glyph; g.setAttribute('aria-hidden', 'true');
  b.append(g, n);
  b.onclick = () => centreOn(b.to.x, b.to.y - 8);
  stage.appendChild(b);
  return [dir, b];
}));
const setStyle = (el, css) => { for (const p in css) if (el.style[p] !== css[p]) el.style[p] = css[p]; };
function syncEdges() {
  const beyond = { up: [], down: [], left: [], right: [] };
  if (pannable()) for (const a of cast.actors.values()) {
    if (a.leaving) continue;
    const x = a.x * scale + pan.x, y = (a.y - 8) * scale + pan.y; // the sprite's middle, in the view
    const off = { left: -x, right: x - viewW, up: -y, down: y - viewH };
    const dir = Object.keys(off).reduce((p, q) => (off[q] > off[p] ? q : p));
    if (off[dir] > 0) beyond[dir].push({ a, x, y, d: off[dir] });
  }
  for (const [dir, b] of Object.entries(edges)) {
    const list = beyond[dir];
    if (b.hidden !== !list.length) b.hidden = !list.length; // an unchanged write still dirties the DOM
    if (b.hidden) continue;
    const pets = list.filter(o => !o.a.h && o.a.s.status === 'waiting');
    const t = pets[0] ?? list.reduce((p, q) => (q.d < p.d ? q : p));
    const flat = dir === 'up' || dir === 'down', inset = 16;
    const along = `${Math.round(Math.min((flat ? viewW : viewH) - 2 * inset, Math.max(2 * inset, flat ? t.x : t.y)))}px`;
    const at = { up: inset, down: viewH - inset, left: inset, right: viewW - inset }[dir] + 'px';
    setStyle(b, flat ? { left: along, top: at } : { left: at, top: along });
    b.classList.toggle('alarm', pets.length > 0);
    if (b.lastChild.textContent !== String(list.length)) b.lastChild.textContent = list.length;
    const label = `${list.length} beyond the ${dir === 'up' ? 'top' : dir === 'down' ? 'bottom' : dir} edge${pets.length ? `, ${pets.length} petitioning` : ''}`;
    if (b.title !== label) { b.title = label; b.setAttribute('aria-label', label); }
    b.to = t.a; // read by the click handler set once below
  }
}

// Hover is re-tested every frame from the last mouse position: characters walk under a still cursor.
const tip = document.getElementById('tip');
let mouse = null;
function syncHover() {
  const h = mouse ? actorAt(mouse) : coarse.matches && sel ? cast.actors.get(sel) : null;
  setStyle(canvas, { cursor: drag?.on ? 'grabbing' : h ? 'pointer' : pannable() ? 'grab' : '' });
  const hide = !h || labels.has(h.id);
  if (tip.hidden !== hide) tip.hidden = hide;
  if (tip.hidden) return;
  tip.textContent = h.h ? h.h.kind : h.s.name;
  setStyle(tip, { left: `${h.x * scale}px`, top: `${(h.y - (h.h ? 15 : 18)) * scale}px` });
}

// Canvas hit test on the sprite's logical rect (feet at a.x, a.y), padded by 1; the frontmost (largest y) wins.
function actorAt(e) {
  const r = canvas.getBoundingClientRect(), px = (e.clientX - r.left) / scale, py = (e.clientY - r.top) / scale;
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
initSettings({ mode: () => state.mode, setMode, muted: () => state.muted, setMuted: m => { if (m !== state.muted) toggleMute(); }, placed: () => { sunDay = ''; renderModes(); }, rescaled: fit });
fit();
requestAnimationFrame(frame);
if (tauri() || REMOTE) {
  listen('roster', e => onRoster(e.payload));
  listen('petition', () => chime());
  listen('question', () => chime([880, 1175]));
  listen('petition-stale', () => chime([990, 660, 990, 660]));
  // Paused: no reaction is queued (it would replay stale on resume); a fresh long task still chimes.
  listen('chronicle', e => { if ((paused() ? Date.now() - e.payload.ts < FRESH_MS : cast.chronicle(e.payload)) && e.payload.kind === 'task-done') chime([1320, 1760]); });
  listen('ui-command', e => (e.payload === 'mute' ? toggleMute() : cycleMode()));
  listen('visible', e => { visible = e.payload; wake(); }); // the app's window only
  refreshTithe = initChronicon(colorOf);
}
const hideBtn = document.getElementById('hide');
if (tauri()) hideBtn.onclick = () => { visible = false; wake(); tauri().window.getCurrentWindow().hide(); };
else hideBtn.remove(); // no window to hide in a browser
