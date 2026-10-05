import { SCENE, lightLevel, planLayout } from './layout.js';
import { drawStatic, drawScene } from './scene.js';
import { drawLighting } from './lighting.js';
import { SASH, RES, RANK, rankOf } from './sprites.js';
import { Cast, isStale } from './actors.js';

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
addEventListener('resize', fit);

// Riveted iron plates behind the scene instead of plain black (40x40 art px tile).
{
  const c = document.createElement('canvas'); c.width = c.height = 40;
  const t = c.getContext('2d'), r = (x, y, w, h, col) => { t.fillStyle = col; t.fillRect(x, y, w, h); };
  r(0, 0, 40, 40, '#17181b'); r(0, 0, 40, 1, '#24262a'); r(0, 0, 1, 40, '#202226');
  r(0, 39, 40, 1, '#0b0b0c'); r(39, 0, 1, 40, '#0b0b0c'); r(1, 19, 38, 1, '#101113'); r(1, 20, 38, 1, '#1f2124');
  for (const [x, y] of [[3, 3], [35, 3], [3, 35], [35, 35], [3, 16], [35, 16], [3, 23], [35, 23]]) { r(x, y, 2, 2, '#3a3d42'); r(x, y, 1, 1, '#5a5e63'); }
  document.body.style.backgroundImage = `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,.65)), url(${c.toDataURL()})`;
}

let last = performance.now(), acc = 0, visible = true;
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden || !visible) { last = now; acc = 0; return; } // paused: skip drawing, keep rAF alive
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  if (acc < 1 / 30) return;
  const dt = acc; acc = 0;
  cast.update(dt);
  const level = lightLevel(state.mode, new Date().getHours());
  g.drawImage(background(level.beams), 0, 0, SCENE.w, SCENE.h);
  const view = glide(now);
  drawLighting(g, drawScene(g, view, cast.actors, fillOf, now), level, now / 1000);
  renderPlaques(view.blocks);
  syncLabels();
  syncHover();
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
const modelName = model => { const m = /opus|sonnet|haiku|fable/i.exec(model ?? '')?.[0].toLowerCase(); return m ? m[0].toUpperCase() + m.slice(1) : model ?? 'unrecorded'; };
const rankLine = model => `${modelName(model)} · ${RANK[rankOf(model)].name}`;

const STATUS_TEXT = { busy: 'Writing', shell: 'At the cogitator', idle: 'Turn done, awaiting orders', waiting: 'Petition at your door' };
const cast = new Cast();
const deptOrder = [];
let layout = { blocks: [], desks: [], seats: new Map(), consoles: [], consoleSeats: new Map(), overflow: 0, plan: [] };
// Harness only: ?grace=<s> shortens the empty-desk grace (blocks get 5/3 of it). The app's URL has no query.
const GRACE = (s => (s > 0 ? { desk: s * 1000, dept: s * 5000 / 3 } : {}))(+new URLSearchParams(location.search).get('grace'));
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
  const napping = cast.napping(roster);
  const depts = deptOrder
    .map(name => ({ name, color: colorOf(name), ids: roster.filter(s => s.dept === name && !napping.has(s.id)).map(s => s.id), helpers: consolesOf(name) }))
    .filter(d => d.ids.length || d.helpers.some(Boolean)); // a dozing scribe's adepts keep working at their consoles
  layout = planLayout(layout, depts, Date.now(), GRACE);
  // ponytail: sessions past the hall's capacity are not drawn; toast + counter still cover their petitions.
  cast.sync(roster.filter(s => layout.seats.has(s.id) || napping.has(s.id)), layout.seats, colorOf, layout.consoleSeats, layout.blocks);
  const n = roster.filter(s => s.status === 'waiting').length;
  const count = document.getElementById('count');
  count.textContent = `${n} petition${n === 1 ? '' : 's'}`;
  count.classList.toggle('on', n > 0);
  count.classList.toggle('alarm', roster.some(isStale));
  renderCard();
}

// Reflows glide: rugs, desks and consoles ease from where they are drawn to their new place over GLIDE_MS;
// the scribes and adepts walk to their new seats on their own (Cast.sync re-routes them).
const GLIDE_MS = 800;
const tweens = new Map(); // key -> { from, to, t0 }, each {x, y, w, h}
const ease = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
function tween(key, to, now) {
  let tw = tweens.get(key);
  const cur = tw && pose(tw, now);
  if (!tw || ['x', 'y', 'w', 'h'].some(k => tw.to[k] !== to[k])) tweens.set(key, tw = { from: cur ?? to, to, t0: now });
  tw.seen = now;
  return { ...to, ...pose(tw, now) };
}
function pose({ from, to, t0 }, now) {
  const k = ease(Math.min(1, (now - t0) / GLIDE_MS)), r = {};
  for (const p of ['x', 'y', 'w', 'h']) if (to[p] != null) r[p] = from[p] + (to[p] - from[p]) * k;
  return r;
}
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
  if (layout.overflow) want.set('overflow', ['plaque', `+${layout.overflow} in the stacks`, 120, 186, '#8a7a5c']);
  if (!roster.length) want.set('empty', ['empty', 'No scribes on duty', 0, 120]);
  for (const [k, el] of plaques) if (!want.has(k)) { el.remove(); plaques.delete(k); }
  for (const [k, [cls, text, x, y, color, maxWidth]] of want) {
    let el = plaques.get(k);
    if (!el) { el = document.createElement('div'); el.className = cls; overlay.appendChild(el); plaques.set(k, el); }
    const css = { left: `${x * scale}px`, top: `${y * scale}px`, maxWidth: maxWidth ? `${maxWidth * scale}px` : '', borderColor: color ?? '', color: color ?? '' };
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
    card.querySelector('.meta').textContent = `Model: ${rankLine(a.h.model ?? a.h.context?.model)}`;
    card.querySelector('.ctx').textContent = contextLine(a.h.context);
    card.querySelector('.task').textContent = a.h.task || 'No task given';
    card.querySelector('.path').textContent = '';
    renderAnswer(card, null);
    renderLinks(card, owner);
    return;
  }
  card.hidden = !s;
  if (!s) return;
  card.querySelector('.name').textContent = `${s.name} · ${s.dept}`;
  const status = s.background ? 'Idle · background shell running' : a?.target?.pose === 'nap' ? 'Idle · dozing in the Refectorium' : STATUS_TEXT[s.status] ?? s.status;
  card.querySelector('.meta').textContent = `${status}${s.waitingFor ? ` (${s.waitingFor})` : ''} · ${ago(s.sinceMs)}`;
  card.querySelector('.ctx').textContent = `${contextLine(s.context)} · ${rankLine(s.context?.model)}`;
  card.querySelector('.task').textContent = s.task;
  card.querySelector('.path').textContent = s.cwd;
  renderAnswer(card, s);
  renderLinks(card, s);
}

// Permission petitions in an Orca terminal can be answered from here: the backend checks the screen
// really shows the dialog before typing one option key. Free-text petitions only get "Open in Orca".
const canAnswer = s => s?.status === 'waiting' && !!s.orca && /approve|permission/i.test(s.waitingFor ?? '');
const episode = s => `${s.id}:${s.sinceMs}`;
const answerErr = new Map(), answering = new Set(); // by episode
function answer(s, choice) {
  const key = episode(s);
  if (answering.has(key)) return;
  answering.add(key); answerErr.delete(key); renderCard();
  const call = window.__TAURI__?.core?.invoke('answer_petition', { handle: s.orca, choice }) ?? Promise.reject('no backend');
  call.catch(err => {
    answerErr.set(key, /no permission prompt|screen unavailable/.test(err) ? 'No permission prompt visible — open the terminal' : String(err));
    sel = s.id; // show the error in this scribe's card
  }).finally(() => { answering.delete(key); renderCard(); }); // success: the scribe leaves the queue on a coming roster tick
}
function renderAnswer(card, s) {
  const row = card.querySelector('.answer'), err = card.querySelector('.err');
  row.hidden = !canAnswer(s);
  err.textContent = (s && answerErr.get(episode(s))) ?? '';
  err.hidden = !err.textContent;
  for (const b of row.querySelectorAll('button')) {
    b.disabled = !!s && answering.has(episode(s));
    b.onclick = () => answer(s, b.dataset.choice);
  }
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
function syncLabels() {
  const petition = a => !a.h && !a.leaving && a.pose === 'queue' && a.s.status === 'waiting';
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
    const want = a.s.waitingFor ?? 'input needed';
    const key = [a.s.name, want, sel === a.id, ago(a.s.sinceMs), canAnswer(a.s), isStale(a.s)].join('|');
    if (el.dataset.key !== key) {
      el.dataset.key = key;
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
    el.style.left = `${a.x * scale}px`;
    el.style.top = `${(a.y - qOff) * scale}px`;
  }
}

// Hover is re-tested every frame from the last mouse position: characters walk under a still cursor.
const tip = document.getElementById('tip');
let mouse = null;
function syncHover() {
  const h = mouse && actorAt(mouse);
  canvas.style.cursor = h ? 'pointer' : '';
  tip.hidden = !h || labels.has(h.id);
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
canvas.onmousemove = e => { mouse = e; };
canvas.onmouseleave = () => { mouse = null; };
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

const muteBtn = document.getElementById('mute');
function renderMute() { muteBtn.classList.toggle('muted', state.muted); muteBtn.setAttribute('aria-label', state.muted ? 'Unmute chime' : 'Mute chime'); }
function toggleMute() { state.muted = !state.muted; store.set('adm.muted', state.muted ? '1' : '0'); renderMute(); }
muteBtn.onclick = toggleMute;
renderMute();


const T = window.__TAURI__;
if (T) {
  T.event.listen('roster', e => onRoster(e.payload));
  T.event.listen('petition', () => chime());
  T.event.listen('petition-stale', () => chime([990, 660, 990, 660]));
  T.event.listen('ui-command', e => (e.payload === 'mute' ? toggleMute() : cycleMode()));
  T.event.listen('visible', e => { visible = e.payload; });
  document.getElementById('hide').onclick = () => { visible = false; T.window.getCurrentWindow().hide(); };
}
