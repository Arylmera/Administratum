import assert from 'node:assert/strict';
import { install, replies, invoked, tick, flush, emit } from './testdom.mjs';

install(undefined, Date.UTC(2026, 9, 17, 14, 30)); // Saturday 17 Oct 2026, 14:30 (TZ pinned to UTC)
const TODAY = '2026-10-17', PAST = '2026-10-15';
const hourly = Array.from({ length: 24 }, (_, i) => ({ tokens: i === 9 ? 2000 : i === 14 ? 500 : 0, busyMs: i === 9 ? 30 * 60000 : 0 }));
const tithe = {
  tokens: { input: 1000, output: 234, cacheWrite: 100, cacheRead: 999_500 }, busyMs: 65 * 60000, hourly,
  byProject: { Geneseed: 34, Terra: { tokens: 1200, busyMs: 60 * 60000 } }, byModel: { 'claude-opus-5-5': 1234 },
};
const at = (h, m) => Date.UTC(2026, 9, 17, h, m);
const ev = (ts, kind, name, dept, detail = '', helper) => ({ ts, kind, name, dept, detail, helper, sessionId: name });
const events = [ev(at(9, 5), 'commit', 'terra-77', 'Terra', 'fix: x'), ev(at(11, 40), 'tool-error', 'terra-77', 'Terra', 'Grep', 'Explore'),
  ev(at(10, 0), 'arrived', 'gs-1', 'Geneseed')];
Object.assign(replies, {
  tithe_day: ({ day }) => (day === TODAY ? tithe : day === PAST ? { tokens: { input: 5 }, busyMs: 0 } : null),
  chronicle_day: ({ day }) => (day === TODAY ? events : day === PAST ? [] : null),
  chronicle_days: [{ day: TODAY, events: 3, tokens: 1_000_734, busyMs: 65 * 60000 }, { day: PAST, events: 0, tokens: 5, busyMs: 0 }],
});
const { initChronicon } = await import('./chronicon.js');
const { t: say } = await import('./theme.js');

const refresh = initChronicon(dept => (dept === 'Terra' ? '#c00' : null));
await flush();
// Header plaque: today's tokens · working time (1 000 734 tokens: the ≥ 999 500 rule rounds to 1M).
const plaque = document.getElementById('tithe');
assert.deepEqual(invoked('tithe_day')[0].args, { day: TODAY });
assert.equal(plaque.textContent, '⛁ 1M · 1h05');
assert.equal(typeof refresh, 'function');
// Every 30 s, except while the app is paused.
tick(30_000);
assert.equal(invoked('tithe_day').length, 2);
document.documentElement.classList.add('paused');
tick(30_000);
assert.equal(invoked('tithe_day').length, 2);
document.documentElement.classList.remove('paused');

// Opening: 7 day tabs, today first, then the Week tab; a past day with nothing recorded is dimmed.
const root = document.getElementById('chron'), body = root.querySelector('.body'), tabs = root.querySelector('.tabs');
document.getElementById('chron-open').click();
await flush();
const tab = [...tabs.children].slice(0, 7);
assert.equal(tabs.children.length, 8);
assert.equal(tabs.children[7].dataset.day, 'week');
assert.equal(tabs.children[7].getAttribute('aria-selected'), 'false');
assert.equal(tab[0].textContent, 'Today');
assert.deepEqual(tab.map(b => b.dataset.day), ['2026-10-17', '2026-10-16', '2026-10-15', '2026-10-14', '2026-10-13', '2026-10-12', '2026-10-11']);
assert.equal(tab[0].getAttribute('aria-selected'), 'true');
assert.equal(tab[1].getAttribute('aria-selected'), 'false');
assert.ok(tab[1].classList.contains('none'), 'nothing recorded');
assert.ok(!tab[2].classList.contains('none'), 'no events, but tokens');
assert.ok(!tab[0].classList.contains('none'));
assert.equal(tab[0].title, '2026-10-17: 3 events · 1M tokens · 1h05');

// Summary: totals, new vs cache, by department / model, hourly charts.
const stats = [...body.querySelectorAll('.stats .stat')].map(s => s.textContent);
assert.deepEqual(stats, ['1Mtokens', '1h05working time', '3events']);
assert.equal(body.querySelector('.split').getAttribute('aria-label'), '1.3k new tokens, 1M read from cache');
assert.equal(body.querySelector('.split .legend').textContent, 'new 1.3k (in 1k · out 234 · write 100)cache 1M');
const bars = [...body.querySelectorAll('.bars')];
assert.deepEqual([...bars[0].querySelectorAll('.row')].map(r => r.title), ['Terra: 1.2k tokens, 1h00 working', 'Geneseed: 34 tokens']);
const terra = bars[0].querySelector('.row .n');
assert.equal(terra.style['--sw'], '#c00');
assert.equal(bars[0].querySelectorAll('.row .track i')[1].style.width, `${(100 * 34) / 1200}%`);
assert.equal(bars[1].querySelector('.row .n').textContent, 'opus-5-5');
const [tok, busy] = body.querySelectorAll('.hours');
assert.equal(tok.querySelector('.peak').textContent, 'peak 2k at 09h');
assert.equal(busy.querySelector('.peak').textContent, 'peak 30m at 09h');
const cols = tok.querySelectorAll('.plot span');
assert.equal(cols.length, 24);
assert.equal(cols[9].querySelector('i').style.height, '100%');
assert.equal(cols[14].querySelector('i').style.height, '25%');
assert.equal(cols[14].className, 'now', 'the current hour, today only');
assert.equal(tok.querySelectorAll('.plot span.now').length, 1);

// Log: newest first, a helper after its scribe, filter by department.
const list = body.querySelector('ol.events'), sel = body.querySelector('.logbar select');
const names = () => [...list.children].map(li => li.querySelector('time')?.textContent + ' ' + li.querySelector('.who')?.textContent);
assert.deepEqual(names(), ['11:40 terra-77 › Explore', '10:00 gs-1', '09:05 terra-77']);
assert.equal(list.children[0].getAttribute('aria-label'), `11:40 ${say('event.tool-error')}: terra-77, Terra. Grep`);
assert.equal(list.children[2].querySelector('.d').textContent, 'fix: x');
const ico = list.children[0].querySelector('.k');
assert.equal(ico.title, say('event.tool-error'));
assert.ok(ico.querySelectorAll('svg.ico rect').some(r => r.getAttribute('fill') === '#e8c050'), "its kind's pixel icon");
assert.deepEqual([...sel.options].map(o => [o.value, o.textContent]), [['', 'All departments'], ['Geneseed', 'Geneseed'], ['Terra', 'Terra']]);
sel.value = 'Geneseed'; sel.dispatch('change');
assert.deepEqual(names(), ['10:00 gs-1']);

// Live events: today's view only, a new department joins the filter, the filter still applies.
emit('chronicle', ev(at(14, 29), 'push', 'terra-77', 'Terra', 'origin/main'));
assert.deepEqual(names(), ['10:00 gs-1'], 'filtered out');
emit('chronicle', ev(at(14, 30), 'arrived', 'dp-1', 'Drop-Pod'));
assert.deepEqual([...sel.options].map(o => o.value), ['', 'Drop-Pod', 'Geneseed', 'Terra']);
assert.equal(sel.value, 'Geneseed');
emit('chronicle', ev(at(14, 30), 'petition', 'gs-1', 'Geneseed', 'approve Bash'));
assert.deepEqual(names(), ['14:30 gs-1', '10:00 gs-1']);
assert.ok(list.children[0].classList.contains('fresh'));
emit('chronicle', ev(Date.UTC(2026, 9, 16, 23, 0), 'push', 'gs-1', 'Geneseed')); // yesterday's: not in today's log
assert.equal(list.children.length, 2);
sel.value = 'Drop-Pod'; sel.dispatch('change');
assert.deepEqual(names(), ['14:30 dp-1']);
sel.value = ''; sel.dispatch('change');
assert.equal(list.children.length, 6);
// An always-open log stays bounded: never more than LIVE_CAP (500) rows.
for (let i = 0; i < 600; i++) emit('chronicle', ev(at(14, 30), 'commit', `s${i}`, 'Terra'));
assert.equal(list.children.length, 500);
for (let i = 600; i < 700; i++) emit('chronicle', ev(at(14, 30), 'commit', `s${i}`, 'Terra'));
assert.equal(list.children.length, 500, 'does not grow');
assert.equal(list.children[0].querySelector('.who').textContent, 's699');
assert.equal(list.children[499].querySelector('.who').textContent, 's200', 'the oldest rows went');
sel.value = 'Terra'; sel.dispatch('change'); sel.value = ''; sel.dispatch('change'); // re-rendered from the kept events
assert.equal(list.children.length, 500);

// A past day: its own summary, no current hour, no live rows, an empty log says so.
tab[2].click();
await flush();
assert.equal(tabs.children[2].getAttribute('aria-selected'), 'true');
assert.equal(body.querySelectorAll('.plot span.now').length, 0);
assert.equal(body.querySelector('ol.events').textContent, 'No events recorded');
assert.equal(body.querySelector('.bars p.quiet').textContent, 'Nothing tithed');
emit('chronicle', ev(at(14, 31), 'commit', 'terra-77', 'Terra'));
assert.equal(body.querySelector('ol.events').textContent, 'No events recorded');
// A day the backend has nothing for.
tab[4].click();
await flush();
assert.equal(body.textContent, say('log.silent'));

// The day report is a folded section when day_report answers, and absent (no error) when it rejects, as on the remote view.
// "By session" lists the sessions behind the numbers, by new tokens.
tithe.bySession = { a: { name: 'terra-77', dept: 'Terra', fresh: 40, total: 400 }, b: { name: 'gs-1', dept: 'Geneseed', fresh: 90, total: 900 } };
replies.day_report = new Error('unknown command');
tab[0].click();
await flush();
assert.equal(body.querySelector('details.report'), null, 'no day_report: no report section');
assert.equal(body.querySelector('ol.events').children.length > 0, true, 'the rest of the day still renders');
const sessionBars = [...body.querySelectorAll('.bars')].find(b => b.querySelector('h3').textContent === 'By session (new tokens)');
assert.deepEqual([...sessionBars.querySelectorAll('.row .n')].map(n => n.textContent), ['gs-1 · Geneseed', 'terra-77 · Terra'], 'biggest first, with the department');
assert.equal(sessionBars.querySelectorAll('.row .track i')[1].style.width, `${(100 * 40) / 90}%`);
replies.day_report = { markdown: ['---', 'date: 2026-10-17', '---', '', '# Day report — 2026-10-17', '', 'x', ''].join(String.fromCharCode(10)) };
tab[0].click();
await flush();
const report = body.querySelector('details.report');
assert.equal(report.querySelector('summary').textContent.startsWith('Day report'), true);
assert.equal(report.querySelector('pre').textContent, ['# Day report — 2026-10-17', '', 'x', ''].join(String.fromCharCode(10)));
delete tithe.bySession;

// Only the last day clicked is shown, whatever order the replies arrive in.
let slow;
replies.chronicle_day = ({ day }) => (day === TODAY ? new Promise(r => { slow = () => r(events); }) : []);
tab[0].click(); tab[2].click();
await flush();
slow();
await flush();
assert.equal(tabs.children[2].getAttribute('aria-selected'), 'true');
assert.equal(body.querySelector('ol.events').textContent, 'No events recorded');

// Usage window: none in the answer (a past day, an older backend) -> no bar; no ceiling yet -> the empty frame.
replies.chronicle_day = ({ day }) => (day === TODAY ? events : []);
assert.equal(plaque.querySelector('.gauge'), null, 'no window: no bar');
tithe.window = { startMs: at(13, 40), tokens: 2_100_000, ceilings: [] };
await refresh();
let gauge = plaque.querySelector('.gauge');
assert.equal(plaque.textContent, '⛁ 1M · 1h05', 'the count stays as it was');
assert.equal(gauge.querySelectorAll('.tick').length, 0, 'no ceiling: no ticks');
assert.equal(gauge.querySelector('i').style.width, '0%');
assert.ok(gauge.title.includes('estimate · this PC'), gauge.title);
// Ceilings: a tick each, the lowest marked, fill against the highest (clamped).
tithe.window = { startMs: at(13, 40), tokens: 2_100_000, ceilings: [4_000_000, 3_400_000] };
await refresh();
gauge = plaque.querySelector('.gauge');
const ticks = [...gauge.querySelectorAll('.tick')];
assert.deepEqual(ticks.map(t => [t.className, t.style.left]), [['tick low', '85%'], ['tick', '100%']]);
assert.equal(ticks[0].title, "this PC's share at the hit: 3.4M");
assert.equal(gauge.querySelector('i').style.width, '52.5%');
assert.equal(gauge.title, 'Window: 2.1M since 13:40 · ceilings 3.4M, 4M · estimate · this PC');
tithe.window = { startMs: at(13, 40), tokens: 9_000_000, ceilings: [4_000_000] };
await refresh();
assert.equal(plaque.querySelector('.gauge i').style.width, '100%', 'past the highest ceiling: full, not wider');
// Today's Chronicon tab: one line; a past day: none.
tab[0].click();
await flush();
assert.equal(body.querySelector('p.window').textContent, 'Window: 9M since 13:40 · ceilings 4M');
assert.ok(body.querySelector('p.window').title.includes('estimate'));
tab[2].click();
await flush();
assert.equal(body.querySelector('p.window'), null);
delete tithe.window;

// Pure helpers (sumTithes, reportText, windowLine): the module is already loaded above.
const { sumTithes, reportText, windowLine } = await import('./chronicon.js');
assert.equal(windowLine({ startMs: null, tokens: 0, ceilings: [] }), 'Window: 0', 'no token in 5 h: 0, no start time');

const day = (n, sessions) => ({
  tokens: { input: n, output: 2 * n, cacheRead: 10 * n, cacheWrite: n }, busyMs: 1000 * n,
  byProject: { Terra: { tokens: 14 * n, busyMs: 1000 * n } }, byModel: { 'claude-opus-5-5': 14 * n }, ...(sessions ? { bySession: sessions } : {}),
});
const week = sumTithes([day(1, { a: { name: 'terra-77', dept: 'Terra', fresh: 4, total: 14 } }), day(2, { a: { name: 'terra-77', dept: 'Terra', fresh: 8, total: 28 } }), null]);
assert.deepEqual(week.tokens, { input: 3, output: 6, cacheRead: 30, cacheWrite: 3 });
assert.equal(week.busyMs, 3000);
assert.deepEqual(week.byProject.Terra, { tokens: 42, busyMs: 3000 });
assert.equal(week.byModel['claude-opus-5-5'], 42);
assert.deepEqual(week.bySession.a, { name: 'terra-77', dept: 'Terra', fresh: 12, total: 42 });

// A 0.6.5 day file has no bySession; a missing day is null.
assert.deepEqual(sumTithes([day(1)]).bySession, {});
assert.deepEqual(sumTithes([]), { tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, busyMs: 0, byProject: {}, byModel: {}, bySession: {} });
assert.equal(reportText('---\ndate: 2026-10-16\nsource: Administratum\n---\n\n# Day report — 2026-10-16\n\nx\n'), '# Day report — 2026-10-16\n\nx\n');
assert.equal(reportText('# no frontmatter'), '# no frontmatter');
console.log('chronicon ok');
