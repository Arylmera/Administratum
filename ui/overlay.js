// The DOM over the canvas, synced each frame: plaques, petition labels, tags, edge arrows, the hover tip.
import { SCENE, WALL_DY, zonesOf } from './layout.js';
import { FLOOR, GAP } from './strip.js';
import { T, t } from './theme.js';
import { isStale, isQuestion } from './actors.js';
import { invoke, listen, REMOTE } from './bridge.js';
import { sel, ago, filesOf, stuckLine, canAnswer, answer, pick } from './card.js';
import { vigil, secondsLeft } from './vigil.js';
import { stripHit, setThrough } from './stripwin.js';
import { view } from './view.js';
import { TAN39 } from './iso.js';
import { scale, pan, viewW, viewH, pannable, centreOn, drag, coarse, stage } from './viewport.js';
import { honoursAt } from './scene.js';
import { PROP_AT } from './sprites.js';
import { openWeek, fmtDur } from './chronicon.js';
import { rooms } from './rooms.js';

// app.js's: hall, layout, roster and mouse are getters (app.js reassigns them) (initOverlay)
let cast, canvas, overlay, at, feet, strip, hall, layout, roster, mouse, actorAt, paused, hhmm;
let edges, tip; // the edge arrows and #tip (initOverlay)

// A department's most recently active session: its cwd is what the plaque opens, its branch what the plaque shows.
const deptHead = name => roster().filter(s => s.dept === name).reduce((p, q) => (!p || q.sinceMs > p.sinceMs ? q : p), null);
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
const FLOOR39 = `matrix(1, ${1 / 3}, ${-TAN39}, ${TAN39 / 2}, 0, 0)`; // one floor px along x and y, as toScreen maps them in 39°
const STRIP_PAD = 3; // logical px between a department's plaque and its lecterns, in the strip
export const ROOM_UP = 4; // a custom room's plaque: its top this far above the fence's top rail (zonesOf Z.y), over the rail
// Subscription usage as claude-deck last wrote it (main.rs usage): session and weekly percent and the time to their
// reset. Hidden when claude-deck is absent or its file is over 30 min old (it would show a stale percent).
let usage = null;
const pollUsage = () => invoke('usage').then(u => { usage = u; }, () => {});
const until = iso => { const m = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 60_000)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
const usageText = () => (usage?.session && usage?.weekly && Date.now() - Date.parse(usage.fetchedAt) < 30 * 60_000
  ? `session ${usage.session.percent}% · ${until(usage.session.resetsAt)} | week ${usage.weekly.percent}% · ${until(usage.weekly.resetsAt)}` : '');
export function renderPlaques(blocks) {
  // In the strip the plaque hangs above its lecterns (they stand FLOOR - 30 high), its bottom STRIP_PAD over them.
  // In the column (H.column) it lies on its floor's slab, under the floor line (the block's mat ends 1 px over it).
  const col = hall().column, place = b => (col ? [b.x + 2, b.y + b.h + 1] : strip() ? [b.x + 2, FLOOR - 30 - STRIP_PAD] : at(b.x + 2, b.y + b.h - 7));
  const depts = blocks.filter(b => !b.empty && !b.cell); // an empty room's placeholder, a strip room's cell: the room's plaque only
  const want = new Map(depts.map(b => [`b:${b.name}`, ['plaque', b.name, ...place(b), b.color, b.w - 4 + (strip() && !col ? GAP - 4 : 0), shownBranch(deptHead(b.name)?.branch), undefined, strip() && !col]])); // the strip's plaque may run over the gap after it
  if (layout().overflow) want.set('overflow', ['plaque', t('overflow', { n: layout().overflow }), ...(col ? [hall().side === 'right' ? hall().w - 96 : 4, hall().cog.y + 1] : at(120 + hall().dx, hall().y1 - 10)), T.ink.overflowPlaque]); // the column's: on the cogitator floor's slab
  // A zone's name: the break-out room's under its fence (it packs last; not in the strip: no room for it), a custom room's on
  // its own top rail, in its rule's colour, dim while empty (under the fence it would cover the next zone). In the strip
  // a room's name hangs over its leading cell (strip.js layoutStrip), as a department's.
  const nameOf = id => { const r = rooms.list.find(q => q.id === id); return r ? r.name || r.pattern : ''; };
  for (const Z of strip() ? [] : zonesOf(blocks, hall())) {
    if (Z.kind === 'temp') want.set('breakout', ['plaque breakout', t('breakout'), ...at(Z.x + 2, Z.y + Z.h + 1), undefined, Z.w - 4]);
    else want.set(`r:${Z.id}`, [`plaque room${Z.empty ? ' dim' : ''}`, nameOf(Z.id), ...at(Z.x + 4, Z.y - ROOM_UP), Z.color, Z.w - 8]); // on its own top rail
  }
  if (strip() && !col) for (const b of blocks.filter(b => b.cell)) want.set(`r:${b.room}`, [`plaque room${b.empty ? ' dim' : ''}`, nameOf(b.room), ...place(b), b.roomColor, b.w - 4 + GAP - 4, '', undefined, true]);
  const u = strip() && usageText(); // the subscription's usage on a banner over the Magos
  // centred over the Magos, or flush with the strip's right end when that would run off it (its width: last frame's)
  const uw = (plaques.get('usage')?.offsetWidth ?? 0) / scale;
  if (u) want.set('usage', ['plaque usage', u, Math.max(col ? 2 : -Infinity, Math.min(hall().magos.x - uw / 2, hall().w - 2 - uw)), hall().magos.y - 30 - STRIP_PAD, undefined, undefined, '', undefined, true]); // over the Magos' floor (the strip's: FLOOR)
  syncHonours();
  if (!roster().length) { // the empty hall's notice, centred on the scriptorium (its projected width in the 39° view)
    const y = 120 + WALL_DY + (hall().h - SCENE.h) / 2, [x0] = at(0, y), [x1] = at(hall().sw, y), [mx, my] = at(hall().sw / 2, y);
    want.set('empty', ['empty', t('empty'), mx - (x1 - x0) / 2, my, undefined, undefined, '', x1 - x0]);
  }
  for (const [k, el] of plaques) if (!want.has(k)) { el.remove(); plaques.delete(k); }
  for (const [k, [cls, text, x, y, color, maxWidth, branch = '', width, up]] of want) {
    let el = plaques.get(k);
    if (!el) {
      el = document.createElement('div'); el.className = cls; overlay.appendChild(el); plaques.set(k, el);
      if (k.startsWith('b:') && !REMOTE) { el.classList.add('open'); el.title = 'Open the folder'; el.onclick = () => openDept(k.slice(2)); }
    }
    if (k.startsWith('r:')) el.classList.toggle('dim', cls.endsWith(' dim')); // a room fills or empties under its plaque
    const floor = k.startsWith('b:') && view.mode === '39' && !strip(); // in 39° a department's name lies on the floor (P39's floor axes)
    const css = { left: `${x * scale}px`, top: `${y * scale}px`, maxWidth: maxWidth ? `${maxWidth * scale}px` : '', borderColor: color ?? '', color: color ?? '',
      width: width ? `${width * scale}px` : '', transform: up ? 'translateY(-100%)' : floor ? FLOOR39 : '', transformOrigin: floor ? '0 0' : '' };
    if (el.dataset.text !== `${text}|${branch}`) {
      el.dataset.text = `${text}|${branch}`;
      const sub = document.createElement('span'); sub.className = 'branch'; sub.textContent = branch;
      el.replaceChildren(text, ...(branch ? [sub] : []));
    }
    for (const p in css) if (el.style[p] !== css[p]) el.style[p] = css[p];
  }
}

// The Hall of Honours (backend `honours`): the week's four marks written over the plaque in the first alcove (scene.js
// honoursAt), flat in the 39° view too, each line centred on its field of the art (PROP_AT.HONOURS). Not in the strip,
// not in a hall without an alcove. Asked again at start, at midnight and on each commit, answered petition or long task done.
export const MARKS = ['commits', 'longest', 'fast', 'busiest'];
// The events that can change a mark: a commit, an answered petition, a finished long turn (the longest task, the busiest day).
const HONOUR_KINDS = new Set(['commit', 'petition-answered', 'task-done']);
let honours = null, board = null;
export const refreshHonours = () => invoke('honours').then(h => { honours = h; }, () => {});
// [dept, value] of each mark, '—' for an empty one (pure: overlay.test.mjs).
export function honoursLines(h) {
  const day = d => new Date(`${d}T12:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
  const value = { commits: m => String(m.value), longest: m => fmtDur(m.value), fast: m => String(m.value), busiest: m => `${fmtDur(m.value)} · ${day(m.day)}` };
  return MARKS.map(k => (h?.[k] ? [h[k].dept, value[k](h[k])] : ['—', '']));
}
function syncHonours() {
  const p = !strip() && honoursAt(hall()), A = PROP_AT.HONOURS;
  if (board && board.hidden !== !p) board.hidden = !p;
  if (!p || !A) return;
  if (!board) {
    board = document.createElement('button'); board.type = 'button'; board.className = 'honours';
    board.onclick = openWeek;
    board.append(...[0, 1, 2, 3, 4].map(i => { const d = document.createElement('span'); d.className = i ? 'mark' : 'title'; return d; }));
    overlay.appendChild(board);
  }
  const lines = honoursLines(honours), key = [t('honours.title'), ...lines.flat()].join('|');
  if (board.dataset.key !== key) {
    board.dataset.key = key;
    const [title, ...rows] = board.children;
    title.textContent = t('honours.title');
    rows.forEach((el, i) => {
      const [dept, value] = lines[i], b = document.createElement('b'), v = document.createElement('span');
      b.textContent = dept; v.textContent = value;
      el.replaceChildren(b, v);
      el.title = `${t(`honours.${MARKS[i]}`)}: ${dept}${value ? ` · ${value}` : ''}`;
    });
    board.setAttribute('aria-label', [t('honours.title'), ...rows.map(r => r.title)].join('. '));
  }
  // each field (logical px from the plaque's top-left) centred where its centre lands on screen (the 39° wall shears)
  // the title's size fits its whole name on one line (an uppercase glyph is ~0.62 em wide), a mark's two lines its field
  const [px, py] = p, fields = [A.title, A.row0, A.row1, A.row2, A.row3], name = t('honours.title').length;
  fields.forEach(([fx, fy, fw, fh], i) => {
    const [cx, cy] = at(px + fx + fw / 2, py + fy + fh / 2), size = i ? fh / 2.3 : Math.min(fh / 1.5, fw / (0.62 * name));
    setStyle(board.children[i], { left: `${cx * scale}px`, top: `${cy * scale}px`, width: `${fw * scale}px`, height: `${fh * scale}px`,
      fontSize: `${(size * scale).toFixed(2)}px` });
  });
}

// Petitioners keep a compact always-visible label (they must not be missed); everyone else is found by
// clicking/hovering the sprite itself.
const labels = new Map();
export function syncLabels() {
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
          // OpenCode's rule: a deny also refuses the session's other pending requests (as the card says)
          b.textContent = text; b.title = choice === 'no' && a.s.source === 'opencode' ? `${verb}: ${t('rejectAll')}` : verb;
          b.setAttribute('aria-label', `${verb} ${a.s.name}`);
          b.onclick = () => answer(a.s, choice);
          ans.appendChild(b);
        }
        el.appendChild(ans);
      }
    }
    // Adjacent queue labels alternate height so their text doesn't overlap. In the hall they hang under the feet: the
    // queue faces the lord's desk, so above the heads they hid its seals. The strip has no floor below, so above there.
    const odd = a.target?.queueIdx % 2 === 1, below = !strip();
    el.classList.toggle('below', below);
    const [lx, ly] = at(...feet(a), below ? (odd ? -14 : -2) : odd ? 30 : 18);
    setStyle(el, { left: `${lx * scale}px`, top: `${ly * scale}px` });
  }
}

const setStyle = (el, css) => { for (const p in css) if (el.style[p] !== css[p]) el.style[p] = css[p]; };
export function syncEdges() {
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
export function syncTags(tags, cls, textOf, dx, dy) {
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
export const sealTags = new Map();
export const sealText = a => (!a.h && !a.leaving && a.s?.limit && !labels.has(a.id)
  ? (a.s.limit.resetMs ? t('limitLabel', { time: hhmm(new Date(a.s.limit.resetMs)) }) : t('limitSealed')) : '');

// A busy scribe making no progress (backend `stuck`); a seal or a petition label says more, so it yields to them.
export const stuckTags = new Map();
export const stuckText = a => (!a.h && !a.leaving && a.s?.stuck && !a.s.limit && !labels.has(a.id) ? stuckLine(a.s.stuck) : '');

// The Watchman at the gate: the countdown's seconds over him.
export const watchTags = new Map();
export const watchText = a => (a.watch && !a.leaving && vigil.countdownEnd != null ? `${secondsLeft(Date.now())}s` : '');

// A working scribe's files changed this turn, by its desk.
export const sheetTags = new Map();
export const sheetText = a => (!a.h && !a.leaving && a.pose === 'desk' && (a.s.status === 'busy' || a.s.status === 'shell') && filesOf(a.s.turn) ? `✎${filesOf(a.s.turn)}` : '');

// Hover is re-tested every frame from the last mouse position: characters walk under a still cursor.
export function syncHover() {
  if (strip() && mouse()) setThrough(!stripHit(mouse().clientX, mouse().clientY)); // re-decided every frame: a still cursor, a walking scribe
  const h = mouse() ? actorAt(mouse()) : coarse.matches && sel ? cast.actors.get(sel) : null;
  setStyle(canvas, { cursor: drag?.on ? 'grabbing' : h ? 'pointer' : pannable() ? 'grab' : '' });
  const hide = !h || labels.has(h.id);
  if (tip.hidden !== hide) tip.hidden = hide;
  if (tip.hidden) return;
  tip.textContent = h.watch ? t('watch.name') : h.h ? h.h.kind : h.s.name;
  const [tx, ty] = at(...feet(h), h.h ? 15 : 18);
  setStyle(tip, { left: `${tx * scale}px`, top: `${ty * scale}px` });
}

export function initOverlay(o) {
  ({ cast, canvas, overlay, at, feet, strip, hall, layout, roster, mouse, actorAt, paused, hhmm } = o);
  pollUsage(); setInterval(() => paused() || pollUsage(), 60_000);
  refreshHonours();
  listen('chronicle', ({ payload: e }) => { if (HONOUR_KINDS.has(e.kind)) refreshHonours(); });
  const atMidnight = () => { const d = new Date(); d.setHours(24, 0, 5, 0); setTimeout(() => { refreshHonours(); atMidnight(); }, d - Date.now()); };
  atMidnight();
  // Off-screen awareness: an arrow on each edge of the view that has characters beyond it, with their count; it
  // blinks red when one of them petitions, and a click glides the view onto that petitioner (else the nearest one).
  edges = Object.fromEntries(Object.entries({ up: '▲', down: '▼', left: '◀', right: '▶' }).map(([dir, glyph]) => {
    const b = document.createElement('button'), g = document.createElement('span'), n = document.createElement('span');
    b.type = 'button'; b.className = `edge ${dir}`; b.hidden = true;
    g.textContent = glyph; g.setAttribute('aria-hidden', 'true');
    b.append(g, n);
    b.onclick = () => centreOn(...at(b.to.x, b.to.y, 8));
    stage.appendChild(b);
    return [dir, b];
  }));
  tip = document.getElementById('tip');
}
