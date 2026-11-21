// The selected character's card: status, context, turn, links, and answering permission petitions.
import { t } from './theme.js';
import { rankOf } from './sprites.js';
import { candleOf } from './scene.js';
import { isQuestion, asleep } from './actors.js';
import { settings } from './settings.js';
import { vigil, secondsLeft } from './vigil.js';
import { pad2 } from './quiet.js';
import { invoke, REMOTE, remoteActions } from './bridge.js';
import { answerable, answerCall, riskOfPetition, allowed, armStep, ARM_MS } from './petition.js';
import { ago, statusOf, hhmmLocale } from './format.js';

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

export function renderCard() {
  const card = document.getElementById('card');
  if (cast.actors.get(sel)?.leaving ?? true) sel = null; // the selected character left the hall: deselect it
  const s = rosterOf().find(r => r.id === sel), a = cast.actors.get(sel);
  card.querySelector('.watch').hidden = true; // a scribe's own lines (below)
  renderVigil(card, a?.watch);
  if (a?.watch) {
    card.hidden = false;
    const left = secondsLeft(Date.now());
    card.querySelector('.name').textContent = t('watch.name');
    card.querySelector('.title').hidden = true;
    card.querySelector('.meta').textContent = left != null ? `Shutdown in ${left} s` : vigil.deadline != null
      ? `Deadline ${hhmmLocale(new Date(vigil.deadline))}` : 'Armed';
    for (const k of ['.ctx', '.task', '.path']) card.querySelector(k).textContent = '';
    renderAsks(card, null);
    renderTurn(card, null);
    renderAnswer(card, null);
    card.querySelector('.noact').hidden = actions; // remote, actions off: no Cancel, the note says why
    renderLinks(card, null);
    renderCi(card, null);
    card.querySelector('.kin').hidden = true;
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
    renderCi(card, null);
    card.querySelector('.kin').hidden = true;
    return;
  }
  card.hidden = !s;
  if (!s) return;
  card.querySelector('.name').textContent = `${s.name} · ${s.dept}`;
  const title = card.querySelector('.title');
  title.textContent = s.title ?? '';
  title.hidden = !s.title;
  // asleep: on a bench (strip, column) or, in the mirror hall, at the desk past napMin (overlay.js sleepText)
  const napping = a?.target?.pose === 'nap' || (!!a && asleep(a));
  const status = napping && !s.background ? t('status.napping') : statusOf(s);
  card.querySelector('.meta').textContent = `${status}${s.waitingFor ? ` (${s.waitingFor})` : ''} · ${ago(s.sinceMs)}`;
  card.querySelector('.ctx').textContent = `${contextLine(s.context)} · ${rankLine(s.context?.model)}`;
  card.querySelector('.task').textContent = s.status === 'waiting' && s.asks ? `Asks to: ${s.asks}` : s.limit ? s.limit.text : s.task;
  const stuck = card.querySelector('.stuck');
  stuck.textContent = stuckLine(s.stuck);
  stuck.hidden = !s.stuck;
  const watch = card.querySelector('.watch');
  watch.textContent = watchLines(s, a, Date.now()).join('\n');
  watch.hidden = !watch.textContent;
  card.querySelector('.path').textContent = s.cwd;
  renderAsks(card, s);
  renderTurn(card, s);
  renderAnswer(card, s);
  renderLinks(card, s);
  renderCi(card, s);
  renderKin(card, s);
}

// A forked session's parent, or a Suzerain's children: each name selects that session's card.
export const kinOf = (s, roster) => ({ parent: roster.find(r => r.id === s.parent), children: roster.filter(r => r.parent === s.id) });
// The tree a card shows: s's own when it forks, else its parent's; immediate links listed. Tokens: today's, summed over all descendants.
export function lineageOf(s, roster) {
  const own = kinOf(s, roster), root = own.children.length ? s : own.parent;
  if (!root) return null;
  const children = root === s ? own.children : kinOf(root, roster).children;
  const seen = new Set([root.id]), all = [root], walk = r => { for (const c of roster) if (c.parent === r.id && !seen.has(c.id)) { seen.add(c.id); all.push(c); walk(c); } };
  walk(root); // the total covers every descendant; the list shows immediate children only
  return { root, children, tokens: all.reduce((n, r) => n + (r.tokensToday ?? 0), 0) };
}
function renderKin(card, s) {
  const kin = card.querySelector('.kin'), roster = rosterOf(), { parent } = kinOf(s, roster), tree = lineageOf(s, roster);
  kin.replaceChildren();
  const row = (...parts) => { const d = document.createElement('div'); d.append(...parts); kin.append(d); return d; };
  const link = r => { const b = document.createElement('button'); b.type = 'button'; b.textContent = r.name; b.onclick = () => select(r.id); return b; };
  if (parent) row(`${t('summonedBy')}: `, link(parent));
  if (tree?.root === s) { // a Suzerain: each child, its state and today's tokens
    row(`${t('summoned')}:`);
    for (const c of tree.children) row('· ', link(c), ` · ${statusOf(c)} · ${kM(c.tokensToday ?? 0)}`).className = 'child';
  }
  if (tree) row(`${t('lineage')}: ${kM(tree.tokens)} tokens`);
  kin.hidden = !kin.childElementCount;
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
const span = ms => { const m = Math.floor(ms / 60000); return m < 1 ? '<1 min' : m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${pad2(m % 60)}`; };
// A stuck session's line (monitor.rs `Stuck`), for the card and the tag over the scribe; '' when not stuck.
export const stuckLine = (st, now = Date.now()) => (!st ? ''
  : st.kind === 'loop' ? t('stuckLoop', { tool: st.tool, count: st.count })
  : t('stuckSilent', { min: Math.max(0, Math.floor((now - st.sinceMs) / 60_000)) }));
export const filesOf = tr => (tr ? tr.files.length + tr.moreFiles : 0);
// What the watch saw (display only): another session on the same file, a port this turn found in use.
export const sameFileLine = s => (s?.sameFile ? t('sameFile', { file: s.sameFile.file, other: s.sameFile.other }) : '');
// The cache clock (O15), only for a scribe idle at its desk (scene.js candleOf): warm with the minutes left, or cold.
export const cacheLine = (a, now = Date.now()) => {
  const c = candleOf(a, now);
  if (!c || a.s.status !== 'idle') return '';
  return c.phase === 'out' ? t('cacheCold') : t('cacheWarm', { min: Math.max(1, Math.ceil((a.s.cache.untilMs - now) / 60_000)) });
};
export const watchLines = (s, a, now) => [sameFileLine(s), s.turn?.portInUse ? t('portInUse', { port: s.turn.portInUse }) : '', a ? cacheLine(a, now) : ''].filter(Boolean);
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

// Which petitions get Approve / Deny, and the backend call for each: petition.js (the phone page uses them too).
export { answerable, answerCall };
const OPENCODE = { yes: 'Allow once', always: 'Always allow', no: 'Reject' }; // OpenCode's own options: nothing to peek
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
const answerErr = new Map(), answering = new Set(), armed = new Map(); // by episode; armed: when a risky Approve was armed
export const isArmed = s => armStep(armed.get(episode(s)), Date.now()) !== 'arm';
const surface = () => (REMOTE ? 'phone' : 'card'); // a remote client: Deny only on a risky petition (remote/app.rs refuses the rest)
export function answer(s, choice) {
  const key = episode(s);
  if (answering.has(key)) return;
  const risk = riskOfPetition(s);
  if (!allowed(choice, risk, surface())) return;
  const step = risk && choice === 'yes' ? armStep(armed.get(key), Date.now()) : 'send';
  if (step === 'hold') return; // a double-click on an armed Approve
  if (step === 'arm') { // a risky Approve: the first click arms it
    armed.set(key, Date.now()); renderCard();
    setTimeout(renderCard, ARM_MS + 50); // back to "Approve" once the window is over
    return;
  }
  armed.delete(key);
  answering.add(key); answerErr.delete(key); renderCard();
  invoke(...answerCall(s, choice)).catch(err => {
    if (err === 'remote actions disabled') { actions = false; return; }
    answerErr.set(key, /no permission prompt|screen unavailable/.test(err) ? 'No permission prompt visible — open the terminal'
      : /no permission request pending|no longer pending/.test(err) ? 'Request no longer pending — answered elsewhere' : String(err));
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
    .then(p => { cur.p = p; }, err => { // a remote view the PC refuses (bridge.js: 403): the card says so and offers no answer
      cur.p = null;
      if (err === 'remote actions disabled') actions = false;
    })
    .finally(() => { cur.busy = false; if (sel === s.id) renderCard(); });
  return cur.p;
}
// The card's answer buttons in DOM order: Deny sits between Approve and Always, so a slip off Approve cannot hit Always (F7).
export const ANSWER_ORDER = ['yes', 'no', 'always'];
function renderAnswer(card, s) {
  const row = card.querySelector('.answer'), err = card.querySelector('.err'), q = card.querySelector('.q');
  if (row.dataset.order !== ANSWER_ORDER.join()) { row.dataset.order = ANSWER_ORDER.join(); row.append(...ANSWER_ORDER.map(c => row.querySelector(`[data-choice="${c}"]`))); }
  row.hidden = q.hidden = !canAnswer(s);
  const p = row.hidden ? undefined : s.source === 'opencode' ? OPENCODE : peek(s);
  card.querySelector('.reject').hidden = row.hidden || s.source !== 'opencode'; // OpenCode's rule: a reject is for all
  q.textContent = p?.question ?? (p === null ? 'Prompt not visible — buttons will check on click' : '');
  q.classList.toggle('hint', p === null);
  q.hidden ||= !q.textContent;
  card.querySelector('.noact').hidden = !(REMOTE && !actions && answerable(s));
  err.textContent = (s && answerErr.get(episode(s))) ?? '';
  err.hidden = !err.textContent;
  const risk = riskOfPetition(s), riskEl = card.querySelector('.risk');
  card.classList.toggle('risky', !row.hidden && !!risk);
  riskEl.textContent = risk ? t('risky', { reason: risk }) : '';
  riskEl.hidden = row.hidden || !risk;
  for (const b of row.querySelectorAll('button')) {
    const label = p?.[b.dataset.choice];
    b.hidden = (p ? !label : b.dataset.choice === 'always') || !allowed(b.dataset.choice, risk, surface()); // unknown dialog: Approve + Deny only
    b.title = label ?? '';
    if (b.dataset.choice === 'yes') { b.dataset.label ??= b.textContent; b.textContent = s && isArmed(s) ? 'Approve? click again' : b.dataset.label; }
    b.disabled = !!s && answering.has(episode(s));
    b.onclick = () => answer(s, b.dataset.choice);
  }
}

// What a card (or a lamp's tip) says of a CI state (I6; the words are theme.js `ci.*`, placeholders {branch} {sha} {done}
// {total} {check}): '' for no state or none. `ci` is Session.ci, or a lamp's { state, branch, sha7, failed }.
export const ciLine = ci => (!ci || !ci.state || ci.state === 'none' ? ''
  : t(`ci.${ci.state}`, { branch: ci.branch ?? '', sha: ci.sha7 ?? '', done: ci.done ?? '', total: ci.total ?? '', check: ci.failed ?? '' }));
// The CI line of a card: one button (the remote view: plain text, it has no command) that opens the commit's checks page
// from the session id; the backend finds the page, a rejection shows on the card like a failed open. After the links.
function renderCi(card, s) {
  let row = card.querySelector('.ci');
  if (!row) {
    row = document.createElement('div'); row.className = 'ci';
    card.querySelector('.links').after(row);
    const err = document.createElement('div'); err.className = 'open-err'; err.hidden = true;
    row.after(err);
  }
  const text = ciLine(s?.ci), err = card.querySelector('.open-err');
  row.hidden = !text;
  if (text && row.dataset.text !== `${REMOTE}|${text}`) {
    row.dataset.text = `${REMOTE}|${text}`;
    if (REMOTE) row.replaceChildren(text);
    else {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ci-line'; b.textContent = text; b.title = t('ci.open');
      row.replaceChildren(b);
    }
  }
  const b = row.querySelector('.ci-line');
  if (b && s) b.onclick = () => { clearOpenErr(); invoke('ci_open', { who: s.id }).catch(e => showOpenErr(s.id, e)); };
  err.textContent = s && openErr?.id === s.id ? openErr.text : '';
  err.hidden = !err.textContent;
}
// A failed open (the terminal, the claude.ai session, the checks page): its error on the card, until the next action or
// pick. The links close the card on a click, so a failure selects that session's card again.
let openErr = null;
const clearOpenErr = () => { openErr = null; };
function showOpenErr(id, e) {
  openErr = { id, text: String(e) };
  sel = id; renderCard();
}

function renderLinks(card, s) {
  const [orca, web] = card.querySelectorAll('.links button'), note = card.querySelector('.links .note');
  // the click that opened this card already opened the terminal (pick): no button for it, unless an answer failed
  // (the prompt may not be on screen: its error says to open the terminal)
  const err = s && answerErr.has(episode(s));
  orca.hidden = REMOTE || !s?.orca || (opened === sel && !err); web.hidden = !s?.web;
  note.hidden = !REMOTE || !s?.orca; // the terminal is on the PC's screen
  card.querySelector('.links').hidden = orca.hidden && web.hidden && note.hidden;
  // the card has done its job once the terminal or the web session is open: close it (closeCard)
  // the Claude desktop app runs on this PC (s.app): the session opens in it, not in the browser; the remote view's
  // link opens on its own device, so it stays the web page
  const app = !REMOTE && !!s?.app;
  web.textContent = app ? 'Open in Claude' : 'Open on claude.ai';
  orca.onclick = () => { clearOpenErr(); openTarget(`orca:${s.orca}`, e => showOpenErr(s.id, e)); closeCard(); };
  web.onclick = () => { clearOpenErr(); openTarget(`${app ? 'app' : 'web'}:${s.web}`, e => showOpenErr(s.id, e)); closeCard(); };
}

function select(id) {
  clearOpenErr();
  sel = sel === id ? null : id;
  if (sel !== opened) opened = null; // another card (a kin link): its terminal was not opened
  const s = rosterOf().find(r => r.id === id);
  if (sel && s?.status === 'waiting') navigator.clipboard?.writeText(`${s.name} ${s.cwd}`).catch(() => {});
  renderCard();
}

const ownerOf = a => rosterOf().find(r => r.id === (a.h ? a.owner : a.id));
function openTarget(target, failed) {
  if (REMOTE) { if (target.startsWith('web:')) window.open(target.slice(4), '_blank', 'noopener'); return; } // on this device
  invoke('open_session', { target }).catch(err => { console.warn('open_session', err); failed?.(err); });
}
// Whether a click on character a (its session, or an adept's owner, s) shows its card. Settings' *Show the card when I
// click a character* off: on the desktop the click only opens the terminal, unless the card has a petition to answer
// or there is no terminal to open (the Watchman, a session outside Orca). The remote view opens no terminal: always.
export const cardOnPick = (a, s, { on = true, remote = false } = {}) =>
  on || remote || !s?.orca || (!a?.h && answerable(s));
// Select a character: its card, plus the scribe's (or the adept owner's) Orca terminal.
let opened = null; // the selected id whose terminal its click opened (renderLinks hides Open in Orca)
export function pick(id) {
  const a = cast.actors.get(id), s = a && ownerOf(a), orca = !REMOTE && !!s?.orca;
  const shown = cardOnPick(a, s, { on: settings.cardOnClick, remote: REMOTE });
  // the terminal did not open: Open in Orca comes back on its card; with no card for this click (the setting off), a
  // toast says so (main.rs open_failed), or the click would seem to do nothing
  if (s?.orca) openTarget(`orca:${s.orca}`, err => {
    if (opened === id) { opened = null; showOpenErr(id, err); } else if (!shown) invoke('open_failed', { name: String(s.name ?? ''), error: String(err) }).catch(() => {});
  });
  if (!shown) { closeCard(); return; }
  opened = orca && sel !== id ? id : null; // the card about to open (select toggles a second click shut)
  select(id);
}
export const closeCard = () => { opened = null; if (sel) { sel = null; renderCard(); } };
