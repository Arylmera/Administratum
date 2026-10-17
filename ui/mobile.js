// The phone's remote page (mobile.html): petitions (read only, by design: no answer from here), the Night Vigil,
// every session as a list with forked children under their Suzerain, and today's Chronicon totals. Same backend
// as the hall's remote view (bridge.js, docs/remote-api.md); Arm / Cancel only while the PC allows remote actions.
import { invoke, listen, remoteVigil } from './bridge.js';
import { T, t, setTheme } from './theme.js';
import './themes.js'; // registers the themes beyond Tier II
import { applyChrome } from './chrome.js';
import { fmtTok, fmtDur } from './chronicon.js';
import { pad2 } from './quiet.js';

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

async function start() {
  let saved = null;
  try { saved = await invoke('settings_load'); } catch { /* not paired yet: bridge.js reloads on 401 */ }
  let theme = saved?.['adm.theme'];
  try { theme = localStorage.getItem('adm.theme') ?? theme; } catch { /* storage blocked */ } // this browser's own pick (settings.js LOCAL)
  setTheme(typeof theme === 'string' ? theme : 'tier2');
  applyChrome();

  const $ = id => document.getElementById(id);
  let roster = [], vigil = {}, actions = false, probed = 0;
  const probe = () => { if (Date.now() - probed < 10_000) return; probed = Date.now(); remoteVigil().then(ok => { actions = ok; renderVigil(); }); };

  function renderPetitions() {
    const list = petitionsOf(roster);
    $('petitions').hidden = !list.length;
    $('petition-list').replaceChildren(...list.map(s => {
      const li = el('li', 'petition');
      li.append(el('b', null, s.name), el('span', 'dim', ` · ${s.waitingFor ?? 'petition'} · ${ago(s.sinceMs)}`));
      const what = s.asks ?? s.question;
      if (what) li.append(el('div', 'asks', what));
      return li;
    }));
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
      const li = el('li', `row ${s.status}`);
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
    invoke(vigil.armed ? 'vigil_cancel' : 'vigil_arm').catch(err => { if (err === 'remote actions disabled') { actions = false; } else console.warn('vigil', err); })
      .finally(() => { b.disabled = false; renderVigil(); });
  };
  listen('roster', e => { roster = Array.isArray(e.payload) ? e.payload : []; renderPetitions(); renderRoster(); });
  listen('vigil', e => { vigil = e.payload ?? {}; probe(); renderVigil(); });
  renderVigil(); probe();
  renderToday(); setInterval(renderToday, 60_000);
}

if (globalThis.document) start();
