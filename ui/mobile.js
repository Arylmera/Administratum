// The phone's remote page (mobile.html): petitions, the Night Vigil, every session as a list with forked children
// under their Suzerain, and today's Chronicon totals. Same backend as the hall's remote view (bridge.js,
// docs/remote-api.md). Only while the PC allows remote actions: Arm / Cancel, and Approve / Deny on a permission
// petition once its prompt is shown (Always stays on the PC; questions and free-text petitions stay text).
import { invoke, listen, remoteVigil } from './bridge.js';
import { T, t, setTheme } from './theme.js';
import './themes.js'; // registers the themes beyond Tier II
import { applyChrome } from './chrome.js';
import { fmtTok, fmtDur } from './chronicon.js';
import { pad2 } from './quiet.js';
import { answerable, answerCall, riskOfPetition, allowed } from './petition.js';

// ---- pure (mobile.test.mjs) ----

export const petitionsOf = roster => roster.filter(s => s.status === 'waiting').sort((a, b) => a.sinceMs - b.sinceMs);

const rank = s => (s.status === 'waiting' ? 0 : s.status === 'busy' || s.status === 'shell' ? 1 : 2);
// Roots by rank (stable), each followed by its forked children, depth-first. A parent cycle cannot hide anyone.
export function treeOrder(roster) {
  const ids = new Set(roster.map(s => s.id)), out = [], seen = new Set();
  const walk = (s, depth) => {
    if (seen.has(s.id)) return;
    seen.add(s.id); out.push({ s, depth });
    for (const c of roster) if (c.parent === s.id) walk(c, depth + 1);
  };
  const byRank = [...roster].sort((a, b) => rank(a) - rank(b));
  for (const s of byRank) if (!ids.has(s.parent)) walk(s, 0);
  for (const s of byRank) walk(s, 0);
  return out;
}

// A petition row: one prompt of one session (a new prompt in the same session is a new row).
export const rowKey = s => `${s.id}:${s.sinceMs}`;
// peek: undefined while not read, the prompt ({question, yes, no, ...}) once read, or {error}. Buttons only while
// actions are allowed, on an answerable petition whose prompt was shown (OpenCode: the request the roster carries).
export function rowState(s, { actions, peek }) {
  const risk = riskOfPetition(s), none = { buttons: false, text: null, sub: null, error: null, risk };
  if (!actions || !answerable(s)) return none;
  if (s.source === 'opencode') return { ...none, buttons: true };
  if (!peek) return none;
  if (peek.error) return { ...none, error: peek.error }; // never answer a prompt the phone could not show
  return { ...none, buttons: true, text: peek.question ?? null, sub: [peek.yes, peek.no].filter(Boolean).join(' / ') || null };
}
// The answer buttons a row shows: Approve and Deny; Deny only for a risky prompt (petition.js `allowed`).
export const phoneChoices = risk => [['yes', 'Approve'], ['no', 'Deny']].filter(([c]) => allowed(c, risk, 'phone'));
// A stored peek belongs to one prompt: the row, what it waits for and its terminal. A changed prompt finds no peek,
// so its old buttons go.
export const peekKey = s => `${rowKey(s)}|${s.waitingFor ?? ''}|${s.orca ?? ''}`;
// Read an Orca prompt as the peek state above.
const peekOf = (s, invoke) => invoke('peek_petition', { handle: s.orca }).then(p => p ?? { error: 'Prompt not visible' }, err => ({ error: String(err) }));
// Tap on a petition: read an Orca prompt; nothing to read for OpenCode, and no call at all unless actions are
// allowed and the petition is answerable.
export function openRow(s, { actions, invoke }) {
  if (!actions || !answerable(s) || s.source === 'opencode') return Promise.resolve(undefined);
  return peekOf(s, invoke);
}
// Approve ('yes') or Deny ('no') only: Always grants a lasting permission and stays on the PC. An Orca prompt is read
// again first and answered only if it is still the one shown; else nothing is sent and the new prompt comes back.
// Resolves { sent: true } or { sent: false, peek }; a refused answer rejects with the backend's error.
export function phoneAnswer(s, choice, invoke, shown) {
  if (!allowed(choice, riskOfPetition(s), 'phone')) throw new Error(`the phone does not send ${choice} here`);
  const send = () => invoke(...answerCall(s, choice)).then(() => ({ sent: true }));
  if (s.source === 'opencode') return send();
  return peekOf(s, invoke).then(p => (!p.error && shown?.question != null && p.question === shown.question ? send() : { sent: false, peek: p }));
}
// What a refused answer does to the page: a 403 turns the answer buttons off, anything else is the row's error.
export const answerError = err => (err === 'remote actions disabled' ? { noActions: true } : { error: String(err) });
// Only the newest call per key may apply its result: a slow, stale peek never overwrites a newer one.
export function latestOnly() {
  const last = new Map();
  return (key, promise, apply) => { const mine = {}; last.set(key, mine); return promise.then(v => { if (last.get(key) === mine) apply(v); }); };
}

const hhmm = ms => { const d = new Date(ms); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
export function vigilLine(v, now) {
  if (!v?.armed) return 'Off';
  if (v.countdownEnd != null) { const s = Math.max(0, Math.ceil((v.countdownEnd - now) / 1000)); return `Armed · shutdown in ${Math.floor(s / 60)}:${pad2(s % 60)}`; }
  return v.deadline ? `Armed · deadline ${hhmm(v.deadline)}` : 'Armed';
}

const ago = ms => { const m = Math.max(0, Math.floor((Date.now() - ms) / 60000)); return !ms ? '—' : m < 1 ? '<1m' : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`; };
const statusOf = s => (s.background ? t('status.background') : T.text.status[s.status] ? t(`status.${s.status}`) : s.status);

// ---- page ----

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

// What the petition rows show and act on ([s, st] pairs): the list is rebuilt only when this changes. It holds the
// answer targets (orca, opencodeRequest), so a new handle or request for the same row never keeps a stale button.
export const rowsSig = rows => JSON.stringify(rows.map(([s, st]) =>
  [rowKey(s), s.name, s.waitingFor, s.orca, s.opencodeRequest, s.asks ?? s.question, ago(s.sinceMs), st]));

// One petition row. st: rowState plus { tappable, open, busy, error }; on: { tap(), answer(choice) }. Text only.
export function petitionRow(s, st, on) {
  const li = el('li', `petition${st.open ? ' open' : ''}`);
  const head = st.tappable ? el('button', 'ptap') : el('div');
  if (st.tappable) { head.type = 'button'; head.setAttribute('aria-expanded', String(!!st.open)); head.onclick = on.tap; }
  head.append(el('b', null, s.name), el('span', 'dim', ` · ${s.waitingFor ?? 'petition'} · ${ago(s.sinceMs)}`));
  li.append(head);
  const what = s.asks ?? s.question;
  if (what) li.append(el('div', 'asks', what));
  if (st.risk) li.append(el('div', 'err', t('risky', { reason: st.risk })));
  if (st.open && st.text) li.append(el('div', 'q', st.text));
  if (st.open && st.sub) li.append(el('div', 'dim', st.sub));
  if (st.error) li.append(el('div', 'err', st.error));
  if (st.open && st.buttons) {
    const row = el('div', 'answers');
    for (const [choice, label] of phoneChoices(st.risk)) {
      const b = el('button', choice, label);
      b.type = 'button'; b.disabled = !!st.busy; b.onclick = () => on.answer(choice);
      row.append(b);
    }
    li.append(row);
  } else if (st.open && st.tappable && !st.error) li.append(el('div', 'dim', 'Reading the prompt…'));
  return li;
}

async function start() {
  let saved = null;
  try { saved = await invoke('settings_load'); } catch { /* not paired yet: bridge.js reloads on 401 */ }
  let theme = saved?.['adm.theme'];
  try { theme = localStorage.getItem('adm.theme') ?? theme; } catch { /* storage blocked */ } // this browser's own pick (settings.js LOCAL)
  setTheme(typeof theme === 'string' ? theme : 'tier2');
  applyChrome();

  const $ = id => document.getElementById(id);
  let roster = [], vigil = {}, actions = false, probed = 0;
  const probe = () => { if (Date.now() - probed < 10_000) return; probed = Date.now(); remoteVigil().then(ok => { actions = ok; renderVigil(); renderPetitions(); }); };
  const noActions = () => { actions = false; renderVigil(); renderPetitions(); }; // a 403: off until the next probe

  // Per petition row (rowKey), kept across roster re-renders: one open row, its peek, its error, an answer in flight.
  let openKey = null, petitionsSig = null;
  const peeks = new Map(), errors = new Map(), busy = new Set(), latest = latestOnly(); // peeks by peekKey, the rest by rowKey
  function tap(s) {
    const k = rowKey(s), pk = peekKey(s);
    if (openKey === k) { openKey = null; renderPetitions(); return; }
    openKey = k; peeks.delete(pk); errors.delete(k);
    latest(pk, openRow(s, { actions, invoke }), p => { if (p !== undefined && openKey === k) { peeks.set(pk, p); renderPetitions(); } });
    renderPetitions();
  }
  function reply(s, choice) {
    const k = rowKey(s), pk = peekKey(s);
    if (busy.has(k)) return;
    busy.add(k); errors.delete(k); renderPetitions();
    const answered = phoneAnswer(s, choice, invoke, peeks.get(pk)).catch(err => ({ refused: answerError(err) }));
    // the re-read prompt is stored through `latest` too, so it never races an older peek still in flight
    latest(pk, answered.then(r => r.peek), p => { if (p) { peeks.set(pk, p); renderPetitions(); } });
    answered.then(r => {
      if (r.sent) { if (openKey === k) openKey = null; return; } // the petition leaves on a coming roster event
      if (r.peek) { errors.set(k, r.peek.error ?? 'The prompt changed: read it again before answering'); return; } // nothing sent
      if (r.refused.noActions) { noActions(); return; }
      errors.set(k, r.refused.error); // e.g. answered on the PC meanwhile
      if (openKey === k) openKey = null;
    }).finally(() => { busy.delete(k); renderPetitions(); });
  }
  function renderPetitions() {
    const list = petitionsOf(roster), keys = new Set(list.map(rowKey)), pkeys = new Set(list.map(peekKey));
    if (!keys.has(openKey)) openKey = null;
    for (const [m, live] of [[peeks, pkeys], [errors, keys]]) for (const k of [...m.keys()]) if (!live.has(k)) m.delete(k);
    $('petitions').hidden = !list.length;
    const rows = list.map(s => {
      const k = rowKey(s), st = rowState(s, { actions, peek: peeks.get(peekKey(s)) });
      return [s, { ...st, tappable: actions && answerable(s), open: openKey === k, busy: busy.has(k), error: st.error ?? errors.get(k) ?? null }];
    });
    // roster comes every poll tick: rebuild only on a change, so a tap never lands on a replaced button
    const sig = rowsSig(rows);
    if (sig === petitionsSig) return;
    petitionsSig = sig;
    $('petition-list').replaceChildren(...rows.map(([s, st]) => petitionRow(s, st, { tap: () => tap(s), answer: choice => reply(s, choice) })));
  }
  function renderVigil() {
    $('vigil-line').textContent = vigilLine(vigil, Date.now());
    const b = $('vigil-btn');
    b.hidden = !actions;
    b.textContent = vigil.armed ? 'Cancel' : 'Arm';
  }
  function renderRoster() {
    $('count').textContent = String(roster.length);
    $('roster').replaceChildren(...treeOrder(roster).map(({ s, depth }) => {
      const li = el('li', `row ${['waiting', 'busy', 'shell'].includes(s.status) ? s.status : ''}`);
      li.style.paddingLeft = `${8 + 14 * Math.min(depth, 4)}px`;
      const top = el('div');
      top.append(el('b', null, `${depth ? '↳ ' : ''}${s.name}`), el('span', 'dim', ` · ${s.dept}`));
      const meta = el('div', 'dim', `${statusOf(s)}${s.waitingFor ? ` (${s.waitingFor})` : ''} · ${ago(s.sinceMs)} · ${fmtTok(s.tokensToday ?? 0)} tok`);
      li.append(top, meta);
      if (s.task) li.append(el('div', 'task', s.task));
      return li;
    }));
  }
  async function renderToday() {
    try {
      const [today] = await invoke('chronicle_days');
      $('today').textContent = today ? `${fmtTok(today.tokens)} tokens · ${fmtDur(today.busyMs)} working · ${today.events} events` : '—';
    } catch { /* kept until the next try */ }
  }

  $('vigil-btn').onclick = () => {
    const b = $('vigil-btn');
    b.disabled = true;
    invoke(vigil.armed ? 'vigil_cancel' : 'vigil_arm').catch(err => { if (err === 'remote actions disabled') noActions(); else console.warn('vigil', err); })
      .finally(() => { b.disabled = false; renderVigil(); });
  };
  listen('roster', e => { roster = Array.isArray(e.payload) ? e.payload : []; if (roster.some(answerable)) probe(); renderPetitions(); renderRoster(); });
  listen('vigil', e => { vigil = e.payload ?? {}; probe(); renderVigil(); });
  renderVigil(); probe();
  renderToday(); setInterval(renderToday, 60_000);
}

if (globalThis.document) start();
