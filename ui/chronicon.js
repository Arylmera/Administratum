// Chronicon: the day's event log and the Tithe (tokens + working time), unrolled over the scene.
// Backend contract (docs/superpowers/specs/2026-10-05-chronicon-design.md): chronicle_day, tithe_day,
// chronicle_days commands and the live `chronicle` event.

export const fmtTok = n => (n >= 1e9 ? `${+(n / 1e9).toFixed(1)}B` : n >= 999_500 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${+(n / 1e3).toFixed(n < 1e4 ? 1 : 0)}k` : String(Math.round(n)));
export const fmtDur = ms => { const m = Math.floor((ms || 0) / 60000); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; };
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
const KIND = { commit: 'Commit sealed', push: 'Pushed', 'tests-pass': 'Tests pass', 'tests-fail': 'Tests fail', 'tool-error': 'Tool error', 'task-done': 'Long task done', arrived: 'Arrived', left: 'Left', petition: 'Petition', 'petition-answered': 'Petition answered', compaction: 'Context compacted' };
const icon = kind => {
  const p = PIX[kind] ?? '...........................kk......kk...........................';
  let r = '';
  for (let i = 0; i < 64; i++) if (p[i] !== '.') r += `<rect x="${i % 8}" y="${i >> 3}" width="1" height="1" fill="${PAL[p[i]]}"/>`;
  return `<svg class="ico" viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
};

const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export function initChronicon(T, colorOf = () => null) {
  const invoke = (cmd, args) => T.core.invoke(cmd, args);
  const root = document.getElementById('chron'), tabs = root.querySelector('.tabs'), body = root.querySelector('.body');
  const openers = [document.getElementById('chron-open'), document.getElementById('tithe')];
  let cur = null, seq = 0, closer = null;

  // Header plaque: today's tokens · working time, every 30 s.
  const plaque = document.getElementById('tithe');
  async function refreshPlaque() {
    try {
      const t = await invoke('tithe_day', { day: dayKey() });
      plaque.textContent = `⛁ ${fmtTok(total(t))} · ${fmtDur(t.busyMs)}`;
      plaque.title = `Tithe today: ${fmtTok(total(t))} tokens, ${fmtDur(t.busyMs)} of work`;
    } catch { /* backend not ready: keep the last value */ }
  }
  refreshPlaque();
  setInterval(refreshPlaque, 30_000);

  const isOpen = () => !root.hidden;
  function open() {
    clearTimeout(closer);
    root.hidden = false;
    void root.offsetHeight; // commit the rolled-up state so the unroll transitions
    root.classList.add('open');
    root.querySelector('.close').focus({ preventScroll: true });
    renderTabs(dayKey());
    show(dayKey());
  }
  function close() {
    if (!isOpen()) return;
    root.classList.remove('open');
    closer = setTimeout(() => { root.hidden = true; cur = null; }, 300);
  }
  for (const b of openers) b.onclick = () => (root.classList.contains('open') ? close() : open());
  root.querySelector('.close').onclick = close;
  addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  // Click outside closes; a click on the scene only closes (does not also pick a scribe).
  addEventListener('click', e => {
    if (!root.classList.contains('open') || e.target.closest('#chron, #chron-open, #tithe')) return;
    close();
    if (e.target.closest('#scene, #overlay')) e.stopPropagation();
  }, true);

  async function renderTabs(active) {
    const days = [];
    for (let i = 0; i < 7; i++) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
    let info = [];
    try { info = await invoke('chronicle_days'); } catch { /* tabs still work, without counts */ }
    tabs.replaceChildren(...days.map((d, i) => {
      const key = dayKey(d), s = info.find(x => x.day === key);
      const b = h('button', null, i ? d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }) : 'Today');
      b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.day = key;
      b.setAttribute('aria-selected', String(key === (cur?.day ?? active)));
      b.classList.toggle('none', !!i && !s?.events && !s?.tokens);
      b.title = s ? `${key}: ${s.events} events · ${fmtTok(s.tokens)} tokens · ${fmtDur(s.busyMs)}` : key;
      b.onclick = () => show(key);
      return b;
    }));
  }

  async function show(day) {
    const my = ++seq;
    for (const b of tabs.children) b.setAttribute('aria-selected', String(b.dataset.day === day));
    const [events, tithe] = await Promise.all([invoke('chronicle_day', { day }).catch(() => null), invoke('tithe_day', { day }).catch(() => null)]);
    if (my !== seq || !isOpen()) return;
    cur = { day, events: (events ?? []).slice().sort((a, b) => b.ts - a.ts), filter: cur?.day === day ? cur.filter : '' };
    body.replaceChildren();
    if (!events && !tithe) { body.append(h('p', 'quiet', 'The Chronicon is silent: no record could be read for this day.')); return; }
    body.append(summary(tithe, day === dayKey()), logSection());
    body.scrollTop = 0;
  }

  function summary(t, today) {
    const sec = h('section', 'summary'); // not 'tithe': that is the header plaque's class (light ink on hover, hidden < 600px)
    const tk = t?.tokens ?? {}, fresh = (tk.input || 0) + (tk.output || 0) + (tk.cacheWrite || 0), cache = tk.cacheRead || 0, all = fresh + cache;
    const head = h('div', 'stats');
    const stat = (v, l) => { const d = h('div', 'stat'); d.append(h('b', null, v), h('span', null, l)); return d; };
    head.append(stat(fmtTok(all), 'tokens'), stat(fmtDur(t?.busyMs), 'working time'), stat(String(cur.events.length), 'events'));
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
    grid.append(bars('By department', projects, true), bars('By model', models, false));
    sec.append(grid);

    const hours = Array.from({ length: 24 }, (_, i) => t?.hourly?.[i] ?? { tokens: 0, busyMs: 0 });
    const now = today ? new Date().getHours() : -1;
    const charts = h('div', 'cols');
    charts.append(hourly('Tokens by hour', hours.map(x => x.tokens || 0), fmtTok, 'tok', now),
      hourly('Working minutes by hour', hours.map(x => Math.round((x.busyMs || 0) / 60000)), v => `${v}m`, 'busy', now));
    sec.append(charts);
    return sec;
  }

  function bars(title, rows, swatch) {
    const box = h('div', 'bars');
    box.append(h('h3', null, title));
    if (!rows.length) { box.append(h('p', 'quiet', 'Nothing tithed')); return box; }
    const max = Math.max(...rows.map(r => r[1]), 1);
    for (const [name, v, busy] of rows) {
      const row = h('div', 'row');
      const n = h('span', 'n', name);
      if (swatch) { const c = colorOf(name); if (c) n.style.setProperty('--sw', c); n.classList.add('sw'); }
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
  function hourly(title, vals, fmt, cls, now) {
    const box = h('div', `hours ${cls}`), max = Math.max(...vals), peak = vals.indexOf(max);
    box.append(h('h3', null, title), h('span', 'peak', max ? `peak ${fmt(max)} at ${String(peak).padStart(2, '0')}h` : 'none'));
    const plot = h('div', 'plot');
    plot.setAttribute('role', 'img');
    plot.setAttribute('aria-label', `${title}: ${vals.map((v, i) => `${i}h ${fmt(v)}`).join(', ')}`);
    vals.forEach((v, i) => {
      const col = h('span', i === now ? 'now' : null), fill = h('i');
      fill.style.height = `${max ? (100 * v) / max : 0}%`;
      col.title = `${String(i).padStart(2, '0')}:00 · ${fmt(v)}`;
      col.append(fill);
      plot.append(col);
    });
    const axis = h('div', 'axis');
    for (const l of ['00', '06', '12', '18', '24']) axis.append(h('span', null, l));
    box.append(plot, axis);
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
      if (![...sel.options].some(o => o.value === e.dept)) fill();
      if (cur.filter && e.dept !== cur.filter) return;
      list.querySelector('li.quiet')?.remove();
      const li = row(e);
      li.classList.add('fresh');
      list.prepend(li);
    };
    return sec;
  }

  function row(e) {
    const li = h('li', e.kind);
    const ico = h('span', 'k');
    ico.innerHTML = icon(e.kind); // static markup from PIX, no event data
    ico.title = KIND[e.kind] ?? e.kind;
    const who = h('span', 'who', e.name);
    if (e.helper) who.append(h('small', null, ` › ${e.helper}`));
    li.append(h('time', null, hhmm(e.ts)), ico, who, h('span', 'dept', e.dept), h('span', 'd', e.detail || (KIND[e.kind] ?? e.kind)));
    li.setAttribute('aria-label', `${hhmm(e.ts)} ${KIND[e.kind] ?? e.kind}: ${e.name}, ${e.dept}. ${e.detail ?? ''}`);
    return li;
  }

  T.event.listen('chronicle', ({ payload: e }) => {
    if (cur?.live && cur.day === dayKey() && dayKey(new Date(e.ts)) === cur.day) cur.live(e);
  });
}
