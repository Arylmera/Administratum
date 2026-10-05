import { SCENE, lightLevel, layoutDepartments } from './layout.js';
import { drawStatic, drawDecorFrame, STATIC_LIGHTS, drawRugs, drawDoors, drawGate, deskDrawable, deskLight, consoleDrawable, consoleLight, paperFloor } from './scene.js';
import { drawLighting } from './lighting.js';
import { SASH, RES } from './sprites.js';
import { Cast } from './actors.js';

const MODES = ['auto', 'full', 'candles'];
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked: keep in memory */ } },
};
const state = { mode: store.get('adm.mode', 'auto'), muted: store.get('adm.muted', '0') === '1' };

const canvas = document.getElementById('scene');
const g = canvas.getContext('2d');
canvas.width = SCENE.w * RES;
canvas.height = SCENE.h * RES;
g.setTransform(RES, 0, 0, RES, 0, 0);
g.imageSmoothingEnabled = false;
const overlay = document.getElementById('overlay');
let scale = 2;

const bg = {};
function background(day) {
  const k = day ? 'day' : 'night';
  if (!bg[k]) {
    const c = document.createElement('canvas');
    c.width = SCENE.w * RES; c.height = SCENE.h * RES;
    const cg = c.getContext('2d');
    cg.setTransform(RES, 0, 0, RES, 0, 0);
    cg.imageSmoothingEnabled = false;
    drawStatic(cg, day);
    bg[k] = c;
  }
  return bg[k];
}

function renderModes() {
  const hour = new Date().getHours();
  for (const b of document.querySelectorAll('#modes button')) {
    b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
    if (b.dataset.mode === 'auto') b.textContent = `Auto · ${String(hour).padStart(2, '0')}h ${lightLevel('auto', hour).phase}`;
  }
}
function setMode(m) { state.mode = m; store.set('adm.mode', m); renderModes(); }
function cycleMode() { setMode(MODES[(MODES.indexOf(state.mode) + 1) % MODES.length]); }
for (const b of document.querySelectorAll('#modes button')) b.onclick = () => setMode(b.dataset.mode);

const FRAME = 12; // CSS px kept around the scene for the brass frame
function fit() {
  const head = document.querySelector('header').offsetHeight;
  // ponytail: fractional "contain" scale; pixelated rendering keeps it crisp enough at any size.
  scale = Math.max(1, Math.min((innerWidth - 2 * FRAME) / SCENE.w, (innerHeight - head - 2 * FRAME) / SCENE.h)); // CSS px per logical px
  for (const el of [canvas, overlay]) { el.style.width = `${SCENE.w * scale}px`; el.style.height = `${SCENE.h * scale}px`; }
  const root = document.documentElement.style;
  root.setProperty('--k', Math.min(2.5, Math.max(1, scale / 2)).toFixed(3)); // label/plaque text grows with the scene
  root.setProperty('--tile', `${40 * scale / RES}px`);
}
addEventListener('resize', () => { fit(); renderPlaques(); });

// Riveted iron plates behind the scene instead of plain black (40x40 art px tile).
{
  const c = document.createElement('canvas'); c.width = c.height = 40;
  const t = c.getContext('2d'), r = (x, y, w, h, col) => { t.fillStyle = col; t.fillRect(x, y, w, h); };
  r(0, 0, 40, 40, '#17181b'); r(0, 0, 40, 1, '#24262a'); r(0, 0, 1, 40, '#202226');
  r(0, 39, 40, 1, '#0b0b0c'); r(39, 0, 1, 40, '#0b0b0c'); r(1, 19, 38, 1, '#101113'); r(1, 20, 38, 1, '#1f2124');
  for (const [x, y] of [[3, 3], [35, 3], [3, 35], [35, 35], [3, 16], [35, 16], [3, 23], [35, 23]]) { r(x, y, 2, 2, '#3a3d42'); r(x, y, 1, 1, '#5a5e63'); }
  document.body.style.backgroundImage = `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,.65)), url(${c.toDataURL()})`;
}

const hooks = { beforeLights: () => [], afterFrame: () => {}, update: () => {} };
let last = performance.now(), acc = 0, visible = true;
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden || !visible) { last = now; acc = 0; return; } // paused: skip drawing, keep rAF alive
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  if (acc < 1 / 30) return;
  const dt = acc; acc = 0;
  hooks.update(dt);
  const level = lightLevel(state.mode, new Date().getHours());
  g.drawImage(background(level.beams), 0, 0, SCENE.w, SCENE.h);
  const extra = hooks.beforeLights(g);
  drawDecorFrame(g, now / 1000, [...cast.actors.values()].filter(a => a.pose === 'cog').length);
  drawLighting(g, STATIC_LIGHTS.concat(extra), level, now / 1000);
  hooks.afterFrame();
}

renderModes();
setInterval(renderModes, 60_000);
fit();
requestAnimationFrame(frame);

// Context window by model, in tokens: edit here. Fill = context.tokens / window.
const windowOf = model => (/haiku/i.test(model ?? '') ? 200_000 : 1_000_000);
const fillOf = ctx => (ctx ? ctx.tokens / windowOf(ctx.model) : 0);
const kM = n => (n >= 999_500 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
const contextLine = ctx => `Context · ${ctx ? `${kM(ctx.tokens)} / ${kM(windowOf(ctx.model))} (${Math.round(100 * fillOf(ctx))}%)` : '—'}`;

const STATUS_TEXT = { busy: 'Writing', shell: 'At the cogitator', idle: 'Turn done, awaiting orders', waiting: 'Petition at your door' };
const cast = new Cast();
const deptOrder = [];
let layout = { blocks: [], desks: [], seats: new Map(), consoles: [], consoleSeats: new Map(), overflow: 0 };
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
  roster = next;
  for (const s of roster) if (!deptOrder.includes(s.dept)) deptOrder.push(s.dept);
  const depts = deptOrder
    .map(name => ({ name, color: colorOf(name), ids: roster.filter(s => s.dept === name).map(s => s.id), helpers: consolesOf(name) }))
    .filter(d => d.ids.length);
  layout = layoutDepartments(depts);
  // ponytail: sessions past the hall's capacity are not drawn; toast + counter still cover their petitions.
  cast.sync(roster.filter(s => layout.seats.has(s.id)), layout.seats, colorOf, layout.consoleSeats, layout.blocks);
  const n = roster.filter(s => s.status === 'waiting').length;
  const count = document.getElementById('count');
  count.textContent = `${n} petition${n === 1 ? '' : 's'}`;
  count.classList.toggle('on', n > 0);
  renderPlaques();
  renderCard();
}

function consolesOf(dept) {
  const live = roster.filter(s => s.dept === dept).flatMap(s => (s.helpers ?? []).map(h => `${s.id}|${h.id}`));
  const order = (consoleOrder.get(dept) ?? []).map(id => (live.includes(id) ? id : null));
  for (const id of live) if (!order.includes(id)) { const free = order.indexOf(null); if (free < 0) order.push(id); else order[free] = id; }
  while (order.length && order.at(-1) === null) order.pop();
  consoleOrder.set(dept, order);
  return order;
}

function renderPlaques() {
  for (const el of overlay.querySelectorAll('.plaque, .empty')) el.remove();
  const add = (cls, text, x, y, color, maxWidth) => {
    const el = document.createElement('div');
    el.className = cls; el.textContent = text;
    el.style.left = `${x * scale}px`; el.style.top = `${y * scale}px`;
    if (maxWidth) el.style.maxWidth = `${maxWidth * scale}px`;
    if (color) { el.style.borderColor = color; el.style.color = color; }
    overlay.appendChild(el);
  };
  for (const b of layout.blocks) add('plaque', b.name, b.x + 2, b.y + b.h - 7, b.color, b.w - 4);
  if (layout.overflow) add('plaque', `+${layout.overflow} in the stacks`, 120, 186, '#8a7a5c');
  if (!roster.length) add('empty', 'No scribes on duty', 0, 120);
}

function renderCard() {
  const card = document.getElementById('card');
  const s = roster.find(r => r.id === sel), a = cast.actors.get(sel);
  if (a?.h && !a.leaving) {
    card.hidden = false;
    const owner = roster.find(r => r.id === a.owner);
    card.querySelector('.name').textContent = `${a.h.kind} · adept of ${owner?.name ?? '?'}`;
    card.querySelector('.meta').textContent = `Model: ${a.h.model ?? 'unrecorded'}`;
    card.querySelector('.ctx').textContent = contextLine(a.h.context);
    card.querySelector('.task').textContent = a.h.task || 'No task given';
    card.querySelector('.path').textContent = '';
    renderLinks(card, owner);
    return;
  }
  card.hidden = !s;
  if (!s) return;
  card.querySelector('.name').textContent = `${s.name} · ${s.dept}`;
  const status = s.background ? 'Idle · background shell running' : a?.target?.pose === 'nap' ? 'Idle · dozing in the Refectorium' : STATUS_TEXT[s.status] ?? s.status;
  card.querySelector('.meta').textContent = `${status}${s.waitingFor ? ` (${s.waitingFor})` : ''} · ${ago(s.sinceMs)}`;
  card.querySelector('.ctx').textContent = contextLine(s.context);
  card.querySelector('.task').textContent = s.task;
  card.querySelector('.path').textContent = s.cwd;
  renderLinks(card, s);
}

function renderLinks(card, s) {
  const [orca, web] = card.querySelectorAll('.links button');
  orca.hidden = !s?.orca; web.hidden = !s?.web;
  card.querySelector('.links').hidden = orca.hidden && web.hidden;
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
const tip = document.getElementById('tip');
let hovered = null;
function syncLabels() {
  const petition = a => !a.h && !a.leaving && a.pose === 'queue' && a.s.status === 'waiting';
  for (const [id, el] of labels) if (!petition(cast.actors.get(id) ?? {})) { el.remove(); labels.delete(id); }
  for (const a of cast.actors.values()) {
    if (!petition(a)) continue;
    let el = labels.get(a.id);
    if (!el) {
      el = document.createElement('button');
      el.className = 'lbl petition';
      el.onclick = () => pick(a.id);
      overlay.appendChild(el);
      labels.set(a.id, el);
    }
    const want = a.s.waitingFor ?? 'input needed';
    const key = [a.s.name, want, sel === a.id, ago(a.s.sinceMs)].join('|');
    if (el.dataset.key !== key) {
      el.dataset.key = key;
      el.classList.toggle('sel', sel === a.id);
      el.replaceChildren();
      const line = (cls, text) => { const s = document.createElement('span'); if (cls) s.className = cls; s.textContent = text; el.appendChild(s); };
      line('', a.s.name);
      line('sub', `${want} · ${ago(a.s.sinceMs)}`);
      el.setAttribute('aria-label', `${a.s.name}, petition: ${want}`);
    }
    // Adjacent queue labels alternate height so their text doesn't overlap.
    const qOff = a.target?.queueIdx % 2 === 1 ? 30 : 18;
    el.style.left = `${a.x * scale}px`;
    el.style.top = `${(a.y - qOff) * scale}px`;
  }
  const h = cast.actors.get(hovered);
  tip.hidden = !h || h.leaving || labels.has(hovered);
  if (tip.hidden) return;
  tip.textContent = h.h ? h.h.kind : h.s.name;
  tip.style.left = `${h.x * scale}px`;
  tip.style.top = `${(h.y - (h.h ? 15 : 18)) * scale}px`;
}

// Canvas hit test on the sprite's logical rect (feet at a.x, a.y), padded by 1; the frontmost (largest y) wins.
function actorAt(e) {
  const r = canvas.getBoundingClientRect(), px = (e.clientX - r.left) / scale, py = (e.clientY - r.top) / scale;
  let best = null;
  for (const a of cast.actors.values()) {
    const hw = (a.h ? 6 : 8) + 1, ht = (a.h ? 14 : 17) + 1;
    if (!a.leaving && Math.abs(px - a.x) <= hw && py >= a.y - ht && py <= a.y + 1 && (!best || a.y >= best.y)) best = a;
  }
  return best;
}
const ownerOf = a => roster.find(r => r.id === (a.h ? a.owner : a.id));
function openTarget(target) {
  window.__TAURI__?.core?.invoke('open_session', { target })?.catch(err => console.warn('open_session', err));
}
// Select a character: its card, plus the scribe's (or the adept owner's) Orca terminal.
function pick(id) {
  const a = cast.actors.get(id), s = a && ownerOf(a);
  if (s?.orca) openTarget(`orca:${s.orca}`);
  select(id);
}
const closeCard = () => { if (sel) { sel = null; renderCard(); } };
canvas.onclick = e => { const a = actorAt(e); if (a) pick(a.id); else closeCard(); };
// Any click outside the card (header, backdrop) closes it; canvas and petition labels handle their own.
addEventListener('click', e => { if (e.target !== canvas && !e.target.closest('#card, .lbl')) closeCard(); });
canvas.onmousemove = e => { hovered = actorAt(e)?.id ?? null; canvas.style.cursor = hovered ? 'pointer' : ''; };
canvas.onmouseleave = () => { hovered = null; canvas.style.cursor = ''; };
addEventListener('keydown', e => { if (e.key === 'Escape') closeCard(); });

let audio = null;
function chime() {
  if (state.muted) return;
  try {
    audio ??= new AudioContext();
    const t0 = audio.currentTime;
    [660, 990].forEach((f, i) => {
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

const muteBtn = document.getElementById('mute');
function renderMute() { muteBtn.classList.toggle('muted', state.muted); muteBtn.setAttribute('aria-label', state.muted ? 'Unmute chime' : 'Mute chime'); }
function toggleMute() { state.muted = !state.muted; store.set('adm.muted', state.muted ? '1' : '0'); renderMute(); }
muteBtn.onclick = toggleMute;
renderMute();

hooks.update = dt => cast.update(dt);
hooks.beforeLights = gg => {
  drawRugs(gg, layout.blocks);
  drawDoors(gg, [...cast.actors.values()]);
  const items = [drawGate(gg, [...cast.actors.values()])], lights = [], now = performance.now();
  const blockOf = dept => layout.blocks.find(b => b.name === dept);
  for (const d of layout.desks) {
    const a = cast.actors.get(d.id), fill = fillOf(a?.s.context);
    const busy = !!a && a.pose === 'desk' && a.s.status === 'busy', bgShell = !!a?.s.background;
    paperFloor(gg, d.id, 'desk', fill, d, blockOf(d.dept), now);
    items.push(deskDrawable(d, busy, fill, bgShell, now));
    lights.push(deskLight(d, busy));
  }
  for (const c of layout.consoles) {
    const a = cast.actors.get(c.id), fill = fillOf(a?.h?.context);
    const lit = !!a && a.pose === 'console';
    paperFloor(gg, c.id, 'console', fill, c, blockOf(c.dept), now);
    items.push(consoleDrawable(c, lit, fill));
    lights.push(consoleLight(c, lit));
  }
  for (const a of cast.actors.values()) items.push({ y: a.y, draw: g2 => cast.drawActor(g2, a) });
  items.sort((p, q) => p.y - q.y).forEach(it => it.draw(gg));
  return lights;
};
hooks.afterFrame = syncLabels;

const T = window.__TAURI__;
if (T) {
  T.event.listen('roster', e => onRoster(e.payload));
  T.event.listen('petition', () => chime());
  T.event.listen('ui-command', e => (e.payload === 'mute' ? toggleMute() : cycleMode()));
  T.event.listen('visible', e => { visible = e.payload; });
  document.getElementById('hide').onclick = () => { visible = false; T.window.getCurrentWindow().hide(); };
}
