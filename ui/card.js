// The selected character's card: status, context, turn, links, and answering permission petitions.
import { T, t } from './theme.js';
import { rankOf } from './sprites.js';
import { isQuestion } from './actors.js';
import { settings } from './settings.js';
import { vigil, secondsLeft } from './vigil.js';
import { invoke, REMOTE, remoteActions } from './bridge.js';

let cast, rosterOf; // app.js's cast, and a getter for its roster (reassigned on each roster tick) (initCard)
export function initCard(o) { ({ cast, roster: rosterOf } = o); }
// Context window by model family, in tokens (settings panel). Fill = context.tokens / window.
const windowOf = model => 1000 * (/haiku/i.test(model ?? '') ? settings.ctxHaiku : settings.ctxOther);
export const fillOf = ctx => (ctx ? ctx.tokens / windowOf(ctx.model) : 0);
const kM = n => (n >= 999_500 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
const contextLine = ctx => `Context · ${ctx ? `${kM(ctx.tokens)} / ${kM(windowOf(ctx.model))} (${Math.round(100 * fillOf(ctx))}%)` : '—'}`;
const modelName = model => { const m = /opus|sonnet|haiku|fable/i.exec(model ?? '')?.[0].toLowerCase(); return m ? m[0].toUpperCase() + m.slice(1) : model ?? 'unrecorded'; };
const rankLine = model => `${modelName(model)} · ${t(`rank.${rankOf(model)}`)}`;

export let sel = null;
export const ago = ms => {
  if (!ms) return '—'; // missing statusUpdatedAt, not a huge elapsed time
  const m = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  return m < 1 ? '<1m' : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`;
};

export function renderCard() {
  const card = document.getElementById('card');
  if (cast.actors.get(sel)?.leaving ?? true) sel = null; // the selected character left the hall: deselect it
  const s = rosterOf().find(r => r.id === sel), a = cast.actors.get(sel);
  renderVigil(card, a?.watch);
  if (a?.watch) {
    card.hidden = false;
    const left = secondsLeft(Date.now());
    card.querySelector('.name').textContent = t('watch.name');
    card.querySelector('.title').hidden = true;
    card.querySelector('.meta').textContent = left != null ? `Shutdown in ${left} s` : vigil.deadline != null
      ? `Deadline ${new Date(vigil.deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}` : 'Armed';
    for (const k of ['.ctx', '.task', '.path']) card.querySelector(k).textContent = '';
    renderAsks(card, null);
    renderTurn(card, null);
    renderAnswer(card, null);
    card.querySelector('.noact').hidden = actions; // remote, actions off: no Cancel, the note says why
    renderLinks(card, null);
    return;
  }
  if (a?.h) {
    card.hidden = false;
    const owner = rosterOf().find(r => r.id === a.owner);
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

// The Watchman's card: a Cancel button (made once, after the answer row), under the same remote-actions flag.
function renderVigil(card, on) {
  let row = card.querySelector('.vigil');
  if (!row) { // styled as the answer row (index.html #card .answer)
    row = document.createElement('div'); row.className = 'answer vigil';
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = 'Cancel'; b.title = 'Cancel the Night Vigil';
    b.onclick = () => invoke('vigil_cancel').catch(err => { if (err === 'remote actions disabled') noActions(); else console.warn('vigil', err); });
    row.appendChild(b);
    card.querySelector('.answer').after(row);
  }
  row.hidden = !(on && actions);
  if (on) probeActions();
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
export const filesOf = tr => (tr ? tr.files.length + tr.moreFiles : 0);
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
export const answerable = s => s?.status === 'waiting' && !!s.orca && /approve|permission/i.test(s.waitingFor ?? '');
// Remote view: buttons only while the PC allows remote actions (probed every 10 s at most, and a 403 turns them off).
let actions = !REMOTE, probed = 0;
export function probeActions() {
  if (!REMOTE || Date.now() - probed < 10_000) return;
  probed = Date.now();
  remoteActions().then(ok => { if (ok !== actions) { actions = ok; renderCard(); } });
}
export const canAnswer = s => actions && answerable(s);
export const actionsOn = () => actions; // the header's Night Vigil button follows the same flag (app.js)
export function noActions() { actions = false; renderCard(); } // a 403 elsewhere: off until the next probe says otherwise
const episode = s => `${s.id}:${s.sinceMs}`;
const answerErr = new Map(), answering = new Set(); // by episode
export function answer(s, choice) {
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
  // the card has done its job once the terminal or the web session is open: close it (closeCard)
  orca.onclick = () => { openTarget(`orca:${s.orca}`); closeCard(); };
  web.onclick = () => { openTarget(`web:${s.web}`); closeCard(); };
}

function select(id) {
  sel = sel === id ? null : id;
  const s = rosterOf().find(r => r.id === id);
  if (sel && s?.status === 'waiting') navigator.clipboard?.writeText(`${s.name} ${s.cwd}`).catch(() => {});
  renderCard();
}

const ownerOf = a => rosterOf().find(r => r.id === (a.h ? a.owner : a.id));
function openTarget(target) {
  if (REMOTE) { if (target.startsWith('web:')) window.open(target.slice(4), '_blank', 'noopener'); return; } // on this device
  invoke('open_session', { target }).catch(err => console.warn('open_session', err));
}
// Select a character: its card, plus the scribe's (or the adept owner's) Orca terminal.
export function pick(id) {
  const a = cast.actors.get(id), s = a && ownerOf(a);
  if (s?.orca) openTarget(`orca:${s.orca}`);
  select(id);
}
export const closeCard = () => { if (sel) { sel = null; renderCard(); } };
