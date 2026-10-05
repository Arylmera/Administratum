import { SCENE, lightLevel } from './layout.js';
import { drawStatic, drawDecorFrame, STATIC_LIGHTS } from './scene.js';
import { drawLighting } from './lighting.js';
import { layoutDepartments } from './layout.js';
import { drawRugs, drawDoors, deskDrawable, deskLight } from './scene.js';
import { SASH, RES } from './sprites.js';
import { Cast } from './actors.js';

const MODES = ['auto', 'full', 'candles'];
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked: keep in memory */ } },
};
export const state = { mode: store.get('adm.mode', 'auto'), muted: store.get('adm.muted', '0') === '1' };

const canvas = document.getElementById('scene');
const g = canvas.getContext('2d');
canvas.width = SCENE.w * RES;
canvas.height = SCENE.h * RES;
g.setTransform(RES, 0, 0, RES, 0, 0);
g.imageSmoothingEnabled = false;
const overlay = document.getElementById('overlay');
export let scale = 2;

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
export function cycleMode() { setMode(MODES[(MODES.indexOf(state.mode) + 1) % MODES.length]); }
for (const b of document.querySelectorAll('#modes button')) b.onclick = () => setMode(b.dataset.mode);

export function fit() {
  const head = document.querySelector('header').offsetHeight;
  const hs = Math.max(1, Math.floor(Math.min(innerWidth / (SCENE.w * RES), (innerHeight - head) / (SCENE.h * RES))));
  scale = hs * RES; // CSS px per logical px, for overlays
  for (const el of [canvas, overlay]) { el.style.width = `${SCENE.w * scale}px`; el.style.height = `${SCENE.h * scale}px`; }
}
addEventListener('resize', fit);

export const hooks = { beforeLights: () => [], afterFrame: () => {}, update: () => {} };
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
  drawDecorFrame(g, now / 1000);
  drawLighting(g, STATIC_LIGHTS.concat(extra), level, now / 1000);
  hooks.afterFrame();
}

renderModes();
setInterval(renderModes, 60_000);
fit();
requestAnimationFrame(frame);

const STATUS_TEXT = { busy: 'Writing', shell: 'At the cogitator', idle: 'Turn done, awaiting orders', waiting: 'Petition at your door' };
const cast = new Cast();
const deptOrder = [];
let layout = { blocks: [], desks: [], seats: new Map(), overflow: 0 };
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
    .map(name => ({ name, color: colorOf(name), ids: roster.filter(s => s.dept === name).map(s => s.id) }))
    .filter(d => d.ids.length);
  layout = layoutDepartments(depts);
  // ponytail: sessions past the hall's capacity are not drawn; toast + counter still cover their petitions.
  cast.sync(roster.filter(s => layout.seats.has(s.id)), layout.seats, colorOf);
  const n = roster.filter(s => s.status === 'waiting').length;
  const count = document.getElementById('count');
  count.textContent = `${n} petition${n === 1 ? '' : 's'}`;
  count.classList.toggle('on', n > 0);
  renderPlaques();
  renderCard();
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
    card.querySelector('.task').textContent = a.h.task || 'No task given';
    card.querySelector('.path').textContent = '';
    return;
  }
  card.hidden = !s;
  if (!s) return;
  card.querySelector('.name').textContent = `${s.name} · ${s.dept}`;
  card.querySelector('.meta').textContent = `${STATUS_TEXT[s.status] ?? s.status}${s.waitingFor ? ` (${s.waitingFor})` : ''} · ${ago(s.sinceMs)}`;
  card.querySelector('.task').textContent = s.task;
  card.querySelector('.path').textContent = s.cwd;
}

function select(id) {
  sel = sel === id ? null : id;
  const s = roster.find(r => r.id === id);
  if (sel && s?.status === 'waiting') navigator.clipboard?.writeText(`${s.name} ${s.cwd}`).catch(() => {});
  renderCard();
}

const labels = new Map();
function syncLabels() {
  for (const [id, el] of labels) if (!cast.actors.has(id)) { el.remove(); labels.delete(id); }
  for (const a of cast.actors.values()) {
    let el = labels.get(a.id);
    if (!el) {
      el = document.createElement('button');
      el.className = a.h ? 'lbl adept' : 'lbl';
      el.onclick = () => select(a.id);
      overlay.appendChild(el);
      labels.set(a.id, el);
    }
    if (a.h) { // quiet kind label under the feet; hidden in a crowd (owner's label counts them instead)
      el.hidden = (cast.actors.get(a.owner)?.s.helpers?.length ?? 0) > 2;
      const key = [a.h.kind, sel === a.id].join('|');
      if (el.dataset.key !== key) {
        el.dataset.key = key;
        el.classList.toggle('sel', sel === a.id);
        el.textContent = a.h.kind;
        el.setAttribute('aria-label', `${a.h.kind} adept`);
      }
      el.style.left = `${a.x * scale}px`;
      el.style.top = `${(a.y + 0.5) * scale}px`;
      continue;
    }
    const adepts = a.s.helpers?.length ?? 0;
    const petition = a.s.status === 'waiting' && a.pose === 'queue';
    const dozing = a.pose === 'desk' && a.s.status === 'idle';
    const want = a.s.waitingFor ?? 'input needed';
    const key = [a.s.name, petition, dozing, want, sel === a.id, petition ? ago(a.s.sinceMs) : '', adepts].join('|');
    if (el.dataset.key !== key) {
      el.dataset.key = key;
      el.classList.toggle('petition', petition);
      el.classList.toggle('sel', sel === a.id);
      el.replaceChildren();
      const line = (cls, text) => { const s = document.createElement('span'); if (cls) s.className = cls; s.textContent = text; el.appendChild(s); };
      if (dozing) line('zz', 'z z');
      line('', a.s.name);
      if (petition) line('sub', `${want} · ${ago(a.s.sinceMs)}`);
      if (adepts > 2) line('zz', `+${adepts} adepts`);
      el.setAttribute('aria-label', petition ? `${a.s.name}, petition: ${want}` : a.s.name);
    }
    // Adjacent queue labels alternate height so their text doesn't overlap.
    const qOff = a.target?.queueIdx % 2 === 1 ? 33 : 18;
    el.style.left = `${a.x * scale}px`;
    el.style.top = `${(a.y - qOff) * scale}px`;
  }
}

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
  const items = [], lights = [];
  for (const d of layout.desks) {
    const a = cast.actors.get(d.id);
    const busy = !!a && a.pose === 'desk' && a.s.status === 'busy';
    items.push(deskDrawable(d, busy));
    lights.push(deskLight(d, busy));
  }
  for (const a of cast.actors.values()) items.push({ y: a.y, draw: g2 => cast.drawActor(g2, a) });
  items.sort((p, q) => p.y - q.y).forEach(it => it.draw(gg));
  return lights;
};
hooks.afterFrame = syncLabels;
addEventListener('resize', renderPlaques);

const T = window.__TAURI__;
if (T) {
  T.event.listen('roster', e => onRoster(e.payload));
  T.event.listen('petition', () => chime());
  T.event.listen('ui-command', e => (e.payload === 'mute' ? toggleMute() : cycleMode()));
  T.event.listen('visible', e => { visible = e.payload; });
  document.getElementById('hide').onclick = () => { visible = false; T.window.getCurrentWindow().hide(); };
}
