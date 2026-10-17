// Chronicon: the day's event log and the Tithe (tokens + working time), unrolled over the scene.
// Backend contract (docs/superpowers/specs/2026-10-05-chronicon-design.md): chronicle_day, tithe_day,
// chronicle_days commands and the live `chronicle` event.
import { panel } from './panel.js';
import { invoke, listen } from './bridge.js';
import { T, t as say } from './theme.js';
import { pad2 } from './quiet.js';

export const fmtTok = n => (n >= 1e9 ? `${+(n / 1e9).toFixed(1)}B` : n >= 999_500 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${+(n / 1e3).toFixed(n < 1e4 ? 1 : 0)}k` : String(Math.round(n)));
export const fmtDur = ms => { const m = Math.floor((ms || 0) / 60000); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${pad2(m % 60)}`; };
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const hhmm = ts => new Date(ts).toTimeString().slice(0, 5);
const total = t => (t ? Object.values(t.tokens ?? {}).reduce((a, b) => a + (b || 0), 0) : 0);
const projTok = v => (typeof v === 'number' ? v : v?.tokens ?? 0);

// 8x8 pixel icons, one per event kind (letters index PAL).
const PAL = { k: '#1a120c', R: '#c2321f', r: '#7a1610', w: '#f3e6c4', y: '#e8c050', o: '#d8621c', g: '#1f7a52', b: '#6e3f17', B: '#b8742e' };
const PIX = {
  commit: '..rrrr...rRRRRr.rRRyyRRrrRyRRyRrrRRyyRRr.rRRRRr...rrrr...rr..rr.',
  push: '.kkkkkk.kwwwwwwkkwkwwkwkkwkwwkwkkwwkkwwk.kwwwwk...kwwk....kkkk..',
  'tests-pass': '...............g......gg.g...gg..gg.gg....ggg......g............',
  'tests-fail': '.R....R.RRR..RRR.RRRRRR...RRRR....RRRR...RRRRRR.RRR..RRR.R....R.',
  'tool-error': '...y.......y.....y.o.y....ooo...yyoRoyy...ooo....y.o.y.....y....',
  'task-done': '.bbbbbb.bBwwwwBb.bwkkwb..bwwwwb..bwkkwb..bwwwwb.bBwwwwBb.bbbbbb.',
  compaction: '...o.......oo.....ooo.o..ooyoooo.oyyyoo.ooyywyoo.oyyyyo...oooo..',
  arrived: '....bbbb..g.b..b...gb..bggggg..b...gb..b..g.b..b....bbbb........',
  left: 'bbbb....b..b..r.b..b...rb..rrrrrb..b...rb..b..r.bbbb............',
  petition: '..RRRR...RRwwRR..RRwwRR..RRwwRR..RRRRRR..RRwwRR...RRRR..........',
  'petition-answered': '..gggg...gggggg.gggggwggggggwgggwgwgggggggwggggg.gggggg...gggg..',
};
const kindName = kind => (T.text.event[kind] ? say(`event.${kind}`) : kind); // the theme's wording (theme.js TEXT.event)
const icon = kind => {
  const p = PIX[kind] ?? '...........................kk......kk...........................';
  let r = '';
  for (let i = 0; i < 64; i++) if (p[i] !== '.') r += `<rect x="${i % 8}" y="${i >> 3}" width="1" height="1" fill="${PAL[p[i]]}"/>`;
  return `<svg class="ico" viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
};

// The Week tab: several days' Tithes added up (hourly dropped: the week charts tokens by day). Old day files have no
// bySession.
export function sumTithes(list) {
  const out = { tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, busyMs: 0, byProject: {}, byModel: {}, bySession: {} };
  for (const t of list) {
    if (!t) continue;
    for (const k in out.tokens) out.tokens[k] += t.tokens?.[k] || 0;
    out.busyMs += t.busyMs || 0;
    for (const [k, v] of Object.entries(t.byProject ?? {})) {
      const p = (out.byProject[k] ??= { tokens: 0, busyMs: 0 });
      p.tokens += projTok(v); p.busyMs += v?.busyMs || 0;
    }
    for (const [k, v] of Object.entries(t.byModel ?? {})) out.byModel[k] = (out.byModel[k] || 0) + (v || 0);
    for (const [k, v] of Object.entries(t.bySession ?? {})) {
      const s = (out.bySession[k] ??= { name: v.name, dept: v.dept, fresh: 0, total: 0 });
      s.fresh += v.fresh || 0; s.total += v.total || 0;
    }
  }
  return out;
}

// The day report as the Chronicon shows it: its markdown without the frontmatter (that is for the file).
export const reportText = md => md.replace(/^---\n[\s\S]*?\n---\n+/, '');

const LIVE_CAP = 500; // newest live rows kept in an open day's log
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

function bars(title, rows, colorOf) { // colorOf: a swatch per row (dept => colour or null), or none
  const box = h('div', 'bars');
  box.append(h('h3', null, title));
  if (!rows.length) { box.append(h('p', 'quiet', 'Nothing tithed')); return box; }
  const max = Math.max(...rows.map(r => r[1]), 1);
  for (const [name, v, busy] of rows) {
    const row = h('div', 'row');
    const n = h('span', 'n', name);
    if (colorOf) { const c = colorOf(name); if (c) n.style.setProperty('--sw', c); n.classList.add('sw'); }
    const track = h('span', 'track'), fill = h('i');
    fill.style.width = `${(100 * v) / max}%`;
    track.append(fill);
    row.append(n, track, h('span', 'v', busy != null ? `${fmtTok(v)} · ${fmtDur(busy)}` : fmtTok(v)));
    row.title = `${name}: ${fmtTok(v)} tokens${busy != null ? `, ${fmtDur(busy)} working` : ''}`;
    box.append(row);
  }
  return box;
}

// 24 bars, one per hour; peak labelled directly, every bar has a hover title.
// `labels`: one per bar (the week's days); none: 24 hours.
function hourly(title, vals, fmt, cls, now, labels = null) {
  const box = h('div', `hours ${cls}`), max = Math.max(...vals), peak = vals.indexOf(max);
  const at = i => (labels ? labels[i] : `${pad2(i)}h`);
  box.append(h('h3', null, title), h('span', 'peak', max ? `peak ${fmt(max)} ${labels ? 'on' : 'at'} ${at(peak)}` : 'none'));
  const plot = h('div', 'plot');
  if (labels) plot.style.gridTemplateColumns = `repeat(${vals.length}, 1fr)`;
  plot.setAttribute('role', 'img');
  plot.setAttribute('aria-label', `${title}: ${vals.map((v, i) => `${at(i)} ${fmt(v)}`).join(', ')}`);
  vals.forEach((v, i) => {
    const col = h('span', i === now ? 'now' : null), fill = h('i');
    fill.style.height = `${max ? (100 * v) / max : 0}%`;
    col.title = `${labels ? labels[i] : `${pad2(i)}:00`} · ${fmt(v)}`;
    col.append(fill);
    plot.append(col);
  });
  const axis = h('div', 'axis');
  for (const l of labels ?? ['00', '06', '12', '18', '24']) axis.append(h('span', null, l));
  box.append(plot, axis);
  return box;
}

// events: the day's event count (a day only); byDay: [label, tokens] per day (the Week view).
function summary(t, today, byDay, events, colorOf) {
  const sec = h('section', 'summary'); // not 'tithe': that is the header plaque's class (light ink on hover, hidden < 600px)
  const tk = t?.tokens ?? {}, fresh = (tk.input || 0) + (tk.output || 0) + (tk.cacheWrite || 0), cache = tk.cacheRead || 0, all = fresh + cache;
  const head = h('div', 'stats');
  const stat = (v, l) => { const d = h('div', 'stat'); d.append(h('b', null, v), h('span', null, l)); return d; };
  head.append(stat(fmtTok(all), 'tokens'), stat(fmtDur(t?.busyMs), 'working time'));
  if (!byDay) head.append(stat(String(events), 'events'));
  sec.append(head);

  // New vs cache: one stacked bar, both parts labelled directly.
  const split = h('div', 'split');
  split.setAttribute('role', 'img');
  split.setAttribute('aria-label', `${fmtTok(fresh)} new tokens, ${fmtTok(cache)} read from cache`);
  const bar = h('div', 'stack');
  if (all) for (const [cls, v] of [['new', fresh], ['cache', cache]]) if (v) { const s = h('i', cls); s.style.flexGrow = v; bar.append(s); }
  split.append(bar, h('div', 'legend', null));
  split.lastChild.innerHTML = '<span><i class="new"></i>new </span><span><i class="cache"></i>cache </span>';
  split.lastChild.children[0].append(`${fmtTok(fresh)} (in ${fmtTok(tk.input || 0)} · out ${fmtTok(tk.output || 0)} · write ${fmtTok(tk.cacheWrite || 0)})`);
  split.lastChild.children[1].append(fmtTok(cache));
  sec.append(split);

  const grid = h('div', 'cols');
  const projects = Object.entries(t?.byProject ?? {}).map(([k, v]) => [k, projTok(v), v?.busyMs]).sort((a, b) => b[1] - a[1]);
  const models = Object.entries(t?.byModel ?? {}).map(([k, v]) => [k.replace(/^claude-/, ''), projTok(v)]).sort((a, b) => b[1] - a[1]);
  grid.append(bars('By department', projects, colorOf), bars('By model', models, false));
  sec.append(grid);
  // The sessions behind the numbers: top 10 by new tokens (the measure of the token alert).
  const sessions = Object.values(t?.bySession ?? {}).map(s => [`${s.name} · ${s.dept}`, s.fresh || 0]).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (sessions.length) { const one = h('div', 'cols'); one.append(bars('By session (new tokens)', sessions, false)); sec.append(one); }
  if (byDay) {
    const week = h('div', 'cols');
    week.append(hourly('Tokens by day', byDay.map(d => d[1]), fmtTok, 'tok', byDay.length - 1, byDay.map(d => d[0])));
    sec.append(week);
    return sec;
  }

  const hours = Array.from({ length: 24 }, (_, i) => t?.hourly?.[i] ?? { tokens: 0, busyMs: 0 });
  const now = today ? new Date().getHours() : -1;
  const charts = h('div', 'cols');
  charts.append(hourly('Tokens by hour', hours.map(x => x.tokens || 0), fmtTok, 'tok', now),
    hourly('Working minutes by hour', hours.map(x => Math.round((x.busyMs || 0) / 60000)), v => `${v}m`, 'busy', now));
  sec.append(charts);
  return sec;
}

export function initChronicon(colorOf = () => null) {
  const root = document.getElementById('chron'), tabs = root.querySelector('.tabs'), body = root.querySelector('.body');
  const openers = [document.getElementById('chron-open'), document.getElementById('tithe')];
  let cur = null, seq = 0;

  // Header plaque: today's tokens · working time, every 30 s.
  const plaque = document.getElementById('tithe');
  async function refreshPlaque() {
    try {
      const t = await invoke('tithe_day', { day: dayKey() });
      plaque.textContent = `⛁ ${fmtTok(total(t))} · ${fmtDur(t.busyMs)}`;
      plaque.title = say('tithe.day', { tokens: fmtTok(total(t)), time: fmtDur(t.busyMs) });
    } catch { /* backend not ready: keep the last value */ }
  }
  refreshPlaque();
  setInterval(() => document.documentElement.classList.contains('paused') || refreshPlaque(), 30_000); // app.js refreshes on resume

  const { isOpen } = panel(root, openers, { onOpen: () => { renderTabs(dayKey()); show(dayKey()); }, onClosed: () => { cur = null; } });

  async function renderTabs(active) {
    const days = [];
    for (let i = 0; i < 7; i++) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
    let info = [];
    try { info = await invoke('chronicle_days'); } catch { /* tabs still work, without counts */ }
    const week = h('button', 'week', 'Week');
    week.type = 'button'; week.setAttribute('role', 'tab'); week.dataset.day = 'week';
    week.setAttribute('aria-selected', String((cur?.day ?? active) === 'week'));
    week.title = 'The last 7 days added up';
    week.onclick = () => show('week');
    tabs.replaceChildren(...days.map((d, i) => {
      const key = dayKey(d), s = info.find(x => x.day === key);
      const b = h('button', null, i ? d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }) : 'Today');
      b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.day = key;
      b.setAttribute('aria-selected', String(key === (cur?.day ?? active)));
      b.classList.toggle('none', !!i && !s?.events && !s?.tokens);
      b.title = s ? `${key}: ${s.events} events · ${fmtTok(s.tokens)} tokens · ${fmtDur(s.busyMs)}` : key;
      b.onclick = () => show(key);
      return b;
    }), week);
  }

  async function show(day) {
    if (day === 'week') return showWeek();
    const my = ++seq;
    for (const b of tabs.children) b.setAttribute('aria-selected', String(b.dataset.day === day));
    const wait = h('p', 'loading', 'Unrolling the scroll');
    wait.setAttribute('role', 'status');
    wait.prepend(h('span', 'seal'));
    body.replaceChildren(wait);
    const [events, tithe, report] = await Promise.all([invoke('chronicle_day', { day }).catch(() => null), invoke('tithe_day', { day }).catch(() => null),
      invoke('day_report', { day }).catch(() => null)]); // the remote view has no day_report: no report section
    if (my !== seq || !isOpen()) return;
    cur = { day, events: (events ?? []).slice().sort((a, b) => b.ts - a.ts), filter: cur?.day === day ? cur.filter : '' };
    body.replaceChildren();
    if (!events && !tithe) { body.append(h('p', 'quiet', say('log.silent'))); return; }
    body.append(summary(tithe, day === dayKey(), null, cur.events.length, colorOf));
    if (report?.markdown) body.append(reportSection(report.markdown));
    body.append(logSection());
    body.scrollTop = 0;
  }

  async function showWeek() {
    const my = ++seq;
    for (const b of tabs.children) b.setAttribute('aria-selected', String(b.dataset.day === 'week'));
    const keys = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); keys.push(dayKey(d)); }
    const list = await Promise.all(keys.map(day => invoke('tithe_day', { day }).catch(() => null)));
    if (my !== seq || !isOpen()) return;
    cur = { day: 'week', events: [], filter: '' };
    const byDay = keys.map((k, i) => [new Date(`${k}T12:00`).toLocaleDateString('en-GB', { weekday: 'short' }), total(list[i])]);
    body.replaceChildren(summary(sumTithes(list), false, byDay, null, colorOf));
    body.scrollTop = 0;
  }

  // The day report (backend chronicle/report.rs, the same text the Night Vigil can write to a folder), folded.
  function reportSection(md) {
    const box = h('details', 'report');
    const copy = h('button', 'copy', 'Copy as markdown');
    copy.type = 'button';
    copy.onclick = e => {
      e.preventDefault();
      navigator.clipboard.writeText(md).then(() => { copy.textContent = 'Copied'; }, () => { copy.textContent = 'Copy failed'; });
      setTimeout(() => { copy.textContent = 'Copy as markdown'; }, 2000);
    };
    const sum = h('summary', null, 'Day report');
    sum.append(copy);
    box.append(sum, h('pre', null, reportText(md)));
    return box;
  }

  function logSection() {
    const sec = h('section', 'log');
    const bar = h('div', 'logbar');
    bar.append(h('h3', null, 'Chronicle'));
    const sel = h('select');
    sel.setAttribute('aria-label', 'Filter by department');
    const fill = () => {
      const depts = [...new Set(cur.events.map(e => e.dept))].sort();
      sel.replaceChildren(h('option', null, 'All departments'), ...depts.map(d => h('option', null, d)));
      sel.options[0].value = '';
      sel.value = cur.filter;
    };
    fill();
    sel.onchange = () => { cur.filter = sel.value; list.replaceChildren(...rows()); };
    bar.append(sel);
    const list = h('ol', 'events');
    const rows = () => { const r = cur.events.filter(e => !cur.filter || e.dept === cur.filter).map(row); return r.length ? r : [h('li', 'quiet', 'No events recorded')]; };
    list.replaceChildren(...rows());
    sec.append(bar, list);
    cur.live = e => {
      cur.events.unshift(e);
      if (cur.events.length > LIVE_CAP) cur.events.length = LIVE_CAP; // an always-open log stays bounded: the oldest rows go
      if (![...sel.options].some(o => o.value === e.dept)) fill();
      if (cur.filter && e.dept !== cur.filter) return;
      list.querySelector('li.quiet')?.remove();
      const li = row(e);
      li.classList.add('fresh');
      list.prepend(li);
      while (list.children.length > LIVE_CAP) list.lastElementChild.remove();
    };
    return sec;
  }

  function row(e) {
    const li = h('li', e.kind);
    const ico = h('span', 'k');
    ico.innerHTML = icon(e.kind); // static markup from PIX, no event data
    ico.title = kindName(e.kind);
    const who = h('span', 'who', e.name);
    if (e.helper) who.append(h('small', null, ` › ${e.helper}`));
    li.append(h('time', null, hhmm(e.ts)), ico, who, h('span', 'dept', e.dept), h('span', 'd', e.detail || kindName(e.kind)));
    li.setAttribute('aria-label', `${hhmm(e.ts)} ${kindName(e.kind)}: ${e.name}, ${e.dept}. ${e.detail ?? ''}`);
    return li;
  }

  listen('chronicle', ({ payload: e }) => {
    if (cur?.live && cur.day === dayKey() && dayKey(new Date(e.ts)) === cur.day) cur.live(e);
  });
  return refreshPlaque;
}
