import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { install, replies, calls, invoked, tick, flush, emit, parse } from './testdom.mjs';

// The host app (not the remote view: bridge.js reads REMOTE once per process). Saved values come from settings.json.
install();
Object.assign(replies, {
  settings_load: { 'adm.settings': JSON.stringify({ staleMin: 999, onTop: false, stripSize: 'XL' }), 'adm.scale': '2' },
  platform: 'windows', strip_supported: true, on_top_supported: true, start_at_login: true,
  check_update: { current: '0.6.5', available: '0.7.0' },
  remote_status: { enabled: false, actions_allowed: false, port: 8765, urls: [], qr_svg: null },
  firewall_status: ({ port }) => ({ detail: `rule for ${port}`, rule: 'on', network: 'private' }),
});
// The packs on disk (theme_packs), loaded at start by themes.js: an installed one (a world of its own, a style of a
// shipped world) and one dropped by hand whose theme cannot be read (a message with markup in it).
const disk = [
  { id: 'bob/worlds', dir: 'bob__worlds', repo: 'bob/worlds', installed: '2026-11-16T10:00:00Z', themes: ['steam', 'pink'] },
  { id: 'local/mine', dir: 'mine', repo: null, installed: null, themes: ['broken'] },
];
const packFile = o => [...new TextEncoder().encode(JSON.stringify({ format: 1, ...o }))];
const FILES = { 'bob__worlds/steam/theme.json': packFile({ name: 'Steam', world: 'steampunk', worldName: 'Steampunk' }),
  'bob__worlds/pink/theme.json': packFile({ name: 'Pink vault', base: 'vault' }) };
replies.theme_packs = () => disk.map(p => ({ ...p }));
replies.theme_pack_file = ({ path }) => FILES[path] ?? new Error(path === 'mine/broken/theme.json' ? '<b>bad</b> bytes' : 'not found');
await import('./themes.js'); // every world's styles, as app.js loads them
const { settings, store, view, quiet, place, initSettings, MONITOR } = await import('./settings.js');
const { T, t } = await import('./theme.js');

// Loading: out-of-range values are clamped, unknown choices fall back to the default.
assert.equal(settings.staleMin, 120);
assert.equal(settings.onTop, false);
assert.equal(settings.stripSize, 'M');
assert.equal(view.scale, '2');

const seen = [];
const hooks = { mode: () => 'auto', setMode: m => seen.push(['mode', m]), muted: () => false, setMuted: m => seen.push(['muted', m]),
  placed: () => seen.push(['placed']), rescaled: () => seen.push(['rescaled']), quieted: () => seen.push(['quieted']) };
initSettings(hooks);
await flush();
const form = document.querySelector('#prefs form'), field = n => form.elements[n];
const change = (name, v) => { const el = field(name); if (typeof v === 'boolean') el.checked = v; else el.value = v; el.dispatch('change'); };
const last = name => invoked(name).at(-1)?.args;

// Startup (host): the saved choices are pushed to the backend and the window.
assert.deepEqual(last('set_stale_minutes'), { minutes: 120 });
assert.deepEqual(last('set_question_prefs'), { enabled: true, toast: true });
assert.deepEqual(last('set_quiet'), { enabled: false, fromMin: 1320, toMin: 480 });
assert.equal(calls.find(c => c.name === 'setAlwaysOnTop').args, false);
assert.equal(form.querySelector('[value="strip"]').hidden, false, 'strip offered where supported');
assert.equal(field('onTop').closest('label').hidden, false, 'always on top offered where supported');
assert.equal(form.querySelector('[value="vstrip"]').hidden, false, 'column offered where supported');
// The desktop column's side: right by default (desktop icons sit on the left), saved, the window re-placed (sided).
assert.equal(settings.stripSide, 'right');
{
  const sided = []; hooks.sided = () => sided.push(settings.stripSide);
  change('stripSide', 'left');
  assert.equal(settings.stripSide, 'left');
  assert.equal(JSON.parse(store.get('adm.settings')).stripSide, 'left');
  change('stripSide', 'up'); // not a side: the default
  assert.equal(settings.stripSide, 'right');
  assert.deepEqual(sided, ['left', 'right']);
  delete hooks.sided;
  // the strip kind last chosen is the one the tray's strip item goes back to (stripwin.js toggleStrip)
  change('view', 'vstrip');
  assert.equal(store.get('adm.stripKind'), 'vstrip');
  assert.equal(form.querySelector('.column-only').hidden, false);
  change('view', 'strip');
  assert.equal(store.get('adm.stripKind'), 'strip');
  change('view', 'flat');
  assert.equal(store.get('adm.stripKind'), 'strip'); // a hall view leaves it
}
// Show the card when I click a character: on by default, saved (card.js cardOnPick reads it), back on at reset (below).
assert.equal(settings.cardOnClick, true);
assert.equal(field('cardOnClick').checked, true);
change('cardOnClick', false);
assert.equal(settings.cardOnClick, false);
assert.equal(JSON.parse(store.get('adm.settings')).cardOnClick, false);
// Updates: the startup check only offers the install.
const up = form.querySelector('#updates');
assert.equal(up.querySelector('.up-line').textContent, 'Version 0.6.5. Version 0.7.0 is available.');
assert.equal(up.querySelector('.up-install').hidden, false);
assert.ok(document.getElementById('prefs-open').classList.contains('update'));
assert.equal(invoked('install_update').length, 0);

// Opening reads login, remote view and the firewall rule, then fills the form.
document.getElementById('prefs-open').click();
await flush();
assert.equal(field('login').checked, true);
assert.equal(field('login').disabled, false);
assert.equal(field('remotePort').value, '8765');
assert.deepEqual(last('firewall_status'), { port: 8765 });
assert.equal(form.querySelector('.rv-fw').textContent, 'rule for 8765');
assert.equal(field('staleMin').value, '120');
assert.equal(field('scaleOut').value, '2x');
assert.equal(field('scale').disabled, false);
assert.equal(field('theme').value, T.id);
emit('autostart', false); // the tray changed it
assert.equal(field('login').checked, false);

// A number is clamped, saved and pushed; the file is written once, 300 ms after the last change.
const saves = invoked('settings_save').length;
change('staleMin', '0');
assert.equal(settings.staleMin, 1);
assert.equal(field('staleMin').value, '1');
assert.deepEqual(last('set_stale_minutes'), { minutes: 1 });
change('napMin', '7');
assert.equal(invoked('settings_save').length, saves);
tick(300);
assert.equal(invoked('settings_save').length, saves + 1);
assert.deepEqual(JSON.parse(last('settings_save').values['adm.settings']), { ...settings });
// flush(): a pending change saved at once (before the strip's own window replaces this one on Linux)
{
  const n = invoked('settings_save').length;
  store.set('adm.view', 'strip');
  assert.equal(invoked('settings_save').length, n, 'a change waits 300 ms');
  await store.flush();
  assert.equal(invoked('settings_save').length, n + 1, 'flush saves now');
  assert.equal(last('settings_save').values['adm.view'], 'strip');
  store.set('adm.view', 'flat'); await store.flush();
}
assert.equal(JSON.parse(store.get('adm.settings')).napMin, 7);

// Scale: the slider rescales while dragged, − / + step it, Auto disables both.
field('scale').value = '2.5'; field('scale').dispatch('input');
assert.equal(view.scale, '2.5');
assert.equal(field('scaleOut').value, '2.5x');
form.querySelector('.step[data-step="1"]').click();
assert.equal(view.scale, '2.75');
for (let i = 0; i < 4; i++) form.querySelector('.step[data-step="1"]').click();
assert.equal(view.scale, '3', 'capped at the slider max');
change('scaleAuto', true);
assert.equal(view.scale, 'auto');
assert.equal(field('scale').disabled, true);
assert.equal(field('scaleOut').value, 'Auto');
assert.ok(seen.filter(s => s[0] === 'rescaled').length >= 7);

// Location: clamped to the globe, 4 decimals; Clear unsets both.
seen.length = 0;
field('lon').value = '4.35171';
change('lat', '91');
assert.deepEqual(place, { lat: 90, lon: 4.3517 });
assert.equal(store.get('adm.lat'), '90');
assert.deepEqual(seen, [['placed']]);
form.querySelector('.place-clear').click();
assert.ok(Number.isNaN(place.lat) && Number.isNaN(place.lon));
assert.equal(store.get('adm.lat'), '');

// Quiet hours: minutes after midnight, pushed to the backend.
field('quietFrom').value = '23:00';
change('quietOn', true);
assert.deepEqual(quiet, { on: true, from: 1380, to: 480 });
assert.deepEqual(last('set_quiet'), { enabled: true, fromMin: 1380, toMin: 480 });
assert.ok(seen.some(s => s[0] === 'quieted'));
change('vigilDeadline', '05:30');
assert.equal(store.get('adm.vigilDeadline'), '330');

// Remote view: one remote_set with the three fields; a refusal shows and re-reads the state.
replies.remote_set = new Error('port in use');
field('remotePort').value = '9000';
change('remoteOn', true);
assert.deepEqual(last('remote_set'), { enabled: true, port: 9000, actionsAllowed: false });
const rvErr = form.querySelector('.rv-err');
await flush();
assert.equal(rvErr.textContent, 'port in use');
assert.equal(rvErr.hidden, false);
assert.equal(field('remoteOn').checked, false, 'back to the real state');
replies.remote_set = { enabled: true, actions_allowed: true, port: 9000, urls: ['http://192.168.1.2:9000'], qr_svg: '<svg/>' };
change('remoteActions', true);
await flush();
assert.equal(rvErr.hidden, true);
assert.equal(form.querySelector('.rv-on').hidden, false);
assert.equal(form.querySelector('.rv-urls').textContent, 'http://192.168.1.2:9000');
assert.ok(form.querySelector('.rv-qr').src.startsWith('data:image/svg+xml'));

// Firewall: the port is checked 600 ms after typing stops; an out-of-range port never reaches the backend.
const fwLine = form.querySelector('.rv-fw'), fwChecks = invoked('firewall_status').length;
field('remotePort').value = '80';
field('remotePort').dispatch('input');
tick(599);
assert.notEqual(fwLine.textContent, 'Port must be between 1024 and 65535.');
tick(1);
assert.equal(fwLine.textContent, 'Port must be between 1024 and 65535.');
assert.equal(invoked('firewall_status').length, fwChecks);
field('remotePort').value = '9000';
let allow;
replies.firewall_allow = () => new Promise(r => { allow = r; });
form.querySelector('.rv-fw-btn[data-cmd="firewall_allow"]').click();
assert.equal(fwLine.textContent, 'Waiting for Windows…');
assert.ok([...form.querySelectorAll('.rv-fw-btn')].every(b => b.disabled));
allow({ detail: 'allowed', rule: 'on', network: 'public' });
await flush();
assert.equal(fwLine.textContent, 'allowed');
assert.equal(form.querySelector('.rv-public').hidden, false);
assert.ok([...form.querySelectorAll('.rv-fw-btn')].every(b => !b.disabled));

// Regenerate token: the first click only arms (4 s), the second unpairs.
const regen = form.querySelector('.rv-regen');
replies.remote_regenerate_token = replies.remote_set;
regen.click();
assert.equal(regen.textContent, 'Click again: unpair every device');
tick(4000);
assert.equal(regen.textContent, 'Regenerate token');
assert.equal(invoked('remote_regenerate_token').length, 0);
regen.click(); regen.click();
assert.equal(invoked('remote_regenerate_token').length, 1);

// Update install: a failure is shown and the buttons come back.
replies.install_update = new Error('no network');
up.querySelector('.up-install').click();
await flush();
assert.equal(up.querySelector('.up-line').textContent, 'Update failed: no network');
assert.equal(up.querySelector('.up-install').disabled, false);
// A check that fails keeps this build's version on the line.
replies.check_update = new Error('no platform');
up.querySelector('.up-check').click();
await flush();
assert.equal(up.querySelector('.up-line').textContent, 'Version 9.9.9. Update check failed: no platform');

// Categories: one section at a time.
const cat = name => document.querySelector(`#prefs .cats [data-cat="${name}"]`);
cat('alerts').click();
assert.equal(cat('alerts').getAttribute('aria-current'), 'page');
assert.equal(cat('hall').getAttribute('aria-current'), null);
for (const s of form.querySelectorAll('section[data-cat]')) assert.equal(s.hidden, s.dataset.cat !== 'alerts', s.dataset.cat);

// World and style: a new world takes its first style.
const { THEMES } = await import('./theme.js');
change('world', 'cyber');
assert.equal(T.id, Object.values(THEMES).find(th => th.world === 'cyber').id);
assert.ok(Object.values(THEMES).filter(th => th.world === 'cyber').length > 1, 'a world with several styles');
assert.equal(field('theme').value, T.id);

// Monitoring numbers show what the backend uses (monitor.rs ranges): clamped, and the token alert a plain integer.
change('stuckMin', '2');
assert.equal(store.get('adm.stuckMin'), '5');
assert.equal(field('stuckMin').value, '5');
change('stuckRepeat', '99');
assert.equal(store.get('adm.stuckRepeat'), '20');
change('tokenAlert', '1e6');
assert.equal(store.get('adm.tokenAlert'), '1000000');
assert.equal(field('tokenAlert').value, '1000000');
change('tokenAlert', 'junk');
assert.equal(store.get('adm.tokenAlert'), '');

// Monitoring checkboxes are stored as '1' / '0'; the stuck options follow "Flag stuck sessions", the folder follows the report.
const stuckOpts = ['stuckToast', 'stuckMin', 'stuckRepeat'];
assert.ok(stuckOpts.every(n => !field(n).disabled), 'stuck detection starts on');
assert.equal(field('reportDir').disabled, true, 'report starts off');
change('stuck', false);
assert.equal(store.get('adm.stuck'), '0');
assert.ok(stuckOpts.every(n => field(n).disabled), 'stuck detection off: the options are greyed');
change('stuck', true);
assert.equal(store.get('adm.stuck'), '1');
assert.ok(stuckOpts.every(n => !field(n).disabled));
change('stuckToast', false);
assert.equal(store.get('adm.stuckToast'), '0');
change('reportOn', true);
assert.equal(store.get('adm.reportOn'), '1');
assert.equal(field('reportDir').disabled, false);
change('reportDir', 'D:\Notes');
assert.equal(store.get('adm.reportDir'), 'D:\Notes');
change('reportOn', false);
assert.equal(store.get('adm.reportOn'), '0');
assert.equal(field('reportDir').disabled, true);
change('stuck', false);
change('reportOn', true);

// Reset: every value back to its default, theme and view included. Two clicks: the first only arms (F8).
seen.length = 0;
{
  const reset = form.querySelector('.reset'), label = reset.textContent;
  assert.ok(settings.staleMin !== 5 && label === 'Reset to defaults');
  const stale = invoked('set_stale_minutes').length;
  reset.click();
  assert.equal(reset.textContent, t('prefs.resetArmed'), 'the first click arms and says so');
  assert.equal(settings.staleMin, 1, 'one click resets nothing');
  assert.equal(invoked('set_stale_minutes').length, stale, 'and tells the backend nothing');
  tick(4000);
  assert.equal(reset.textContent, label, 'it disarms after the window');
  reset.click(); // a second click after the window only arms again
  assert.equal(settings.staleMin, 1);
  assert.equal(reset.textContent, t('prefs.resetArmed'));
  tick(3999); reset.click(); // within the window of the arming: resets
  assert.equal(reset.textContent, label);
}
assert.equal(settings.staleMin, 5);
assert.equal(settings.onTop, true);
assert.equal(settings.cardOnClick, true);
assert.equal(field('cardOnClick').checked, true);
assert.deepEqual(quiet, { on: false, from: 1320, to: 480 });
assert.equal(view.scale, 'auto');
assert.equal(T.id, 'tier2');
assert.equal(store.get('adm.view'), 'flat');
assert.deepEqual(last('set_stale_minutes'), { minutes: 5 });
assert.deepEqual(seen.filter(s => s[0] === 'mode' || s[0] === 'muted'), [['mode', 'auto'], ['muted', false]]);
// F14: every setting key still has exactly one control after the regroup (the shipped markup, not the live form: the
// panel removes the rows the backend cannot serve).
{
  const html = parse(readFileSync(new URL('./index.html', import.meta.url), 'utf8'));
  const keys = [...Object.keys(settings), ...Object.keys(MONITOR), 'lat', 'lon', 'idleFps', 'pauseHidden', 'questions', 'questionToast',
    'quietOn', 'quietFrom', 'quietTo', 'vigilDeadline', 'openWith', 'openCmd', 'login', 'updateCheck', 'packCheck', 'world', 'theme', 'view',
    'mode', 'chime', 'scale', 'scaleAuto', 'remoteOn', 'remoteActions', 'remotePort'];
  assert.ok(keys.length >= 45 && new Set(keys).size === keys.length, 'the list names each key once');
  for (const k of keys) assert.equal(html.querySelectorAll(`[name="${k}"]`).length, 1, `${k} has exactly one control`);
  // the controls the list does not know are the output beside the slider and nothing else
  const named = new Set(html.querySelectorAll('input, select, output').map(e => e.name).filter(Boolean));
  assert.deepEqual([...named].filter(n => !keys.includes(n)), ['scaleOut']);
  // the pair that confused: each says what it picks
  assert.equal(t('prefs.theme'), 'World');
  assert.equal(t('prefs.look'), 'Look');
  assert.equal(form.querySelector('[data-t="prefs.look"]').closest('label').querySelector('select').name, 'theme');
  assert.equal(form.querySelector('[data-t="prefs.theme"]').closest('label').querySelector('select').name, 'world');
}
// F15: the dialog is modal, the categories are a tab list moved by the arrow keys (the move selects), Home and End.
{
  const prefs = document.getElementById('prefs');
  assert.equal(prefs.getAttribute('aria-modal'), 'true');
  const list = prefs.querySelector('.cats [role="tablist"]'), tabs = list.querySelectorAll('[role="tab"]');
  assert.ok(tabs.length >= 5 && !list.contains(form.querySelector('.reset')), 'Reset is not one of the tabs');
  const key = (el, k) => { const seen = {}; el.dispatch('keydown', { key: k, preventDefault() { seen.prevented = true; } }); return seen; };
  const sel = () => tabs.filter(b => b.getAttribute('aria-selected') === 'true').map(b => b.dataset.cat);
  cat('look').click();
  assert.deepEqual(sel(), ['look']);
  assert.deepEqual(tabs.map(b => b.getAttribute('tabindex')), tabs.map(b => (b.dataset.cat === 'look' ? '0' : '-1')), 'roving tabindex');
  assert.equal(key(cat('look'), 'ArrowRight').prevented, true);
  assert.equal(document.activeElement, cat('hall'));
  assert.deepEqual(sel(), ['hall']);
  assert.equal(form.querySelector('section[data-cat="hall"]').hidden, false);
  assert.equal(cat('hall').getAttribute('tabindex'), '0');
  assert.equal(cat('look').getAttribute('tabindex'), '-1');
  key(cat('hall'), 'ArrowLeft'); key(cat('look'), 'ArrowLeft');
  assert.equal(document.activeElement, tabs.at(-1), 'wraps from the first to the last');
  key(document.activeElement, 'Home');
  assert.equal(document.activeElement, tabs[0]);
  key(document.activeElement, 'End');
  assert.equal(document.activeElement, tabs.at(-1));
  assert.equal(key(document.activeElement, 'a').prevented, undefined, 'other keys are left alone');
}
console.log('settings ok');

// Reset restores the Monitoring defaults, and the panel shows them.
for (const k in MONITOR) assert.equal(store.get(`adm.${k}`), MONITOR[k], k);
assert.equal(field('stuck').checked, true);
assert.equal(field('stuckMin').value, '15');
assert.equal(field('reportOn').checked, false);
assert.equal(field('reportDir').value, '');
assert.ok(stuckOpts.every(n => !field(n).disabled) && field('reportDir').disabled);

// The desktop column's window (stripwin.js growStrip): placed by kind and side, a side change re-placed even with a
// panel open (its key holds the side), the panels widening it, the handle's menu (inside the column) never. base: its
// width with no panel open, whatever is open.
{
  const { setView } = await import('./view.js');
  const { growStrip } = await import('./stripwin.js');
  globalThis.screen ??= {}; globalThis.screen.availHeight = 1040;
  document.querySelectorAll ??= sel => document.documentElement.querySelectorAll(sel); // testdom: the element's, on the page
  const shown = (id, w) => Object.defineProperties(document.getElementById(id), { offsetParent: { value: w ? document.body : null, configurable: true }, offsetWidth: { value: w, configurable: true } });
  setView('vstrip');
  settings.stripSide = 'right'; settings.stripSize = 'M';
  shown('card', 200);
  const places = () => invoked('place_column').map(c => c.args);
  const n0 = places().length;
  growStrip();
  assert.deepEqual(places().slice(n0), [{ width: 256 + 208, side: 'right', base: 256 }]);
  settings.stripSide = 'left';
  growStrip(); // same width, the other side: placed again
  assert.deepEqual(places().slice(n0 + 1), [{ width: 256 + 208, side: 'left', base: 256 }]);
  growStrip(); // nothing changed: not placed again
  assert.equal(places().length, n0 + 2);
  shown('card', 0); shown('strip-menu', 120); // the menu open alone: the column's own width
  growStrip();
  assert.deepEqual(places().at(-1), { width: 256, side: 'left', base: 256 });
  shown('strip-menu', 0);
  setView('flat');
}

// Click-through (stripwin.js setThrough): where the backend decides it itself from the places it is sent (Windows' mouse
// hook, Linux' input region: set_click_through answers true) the UI's own decision is dropped, so a click needs no poll to
// land; where it answers false (macOS) every change goes on to the window.
{
  const { setThrough, switchStrip } = await import('./stripwin.js');
  const calls = () => invoked('set_click_through').map(c => c.args.on);
  const settle = flush;
  replies.set_click_through = () => true;
  setThrough(true); await settle(); setThrough(false); setThrough(true);
  assert.deepEqual(calls(), [true], 'told once, then the backend decides');
  replies.set_click_through = () => false;
  switchStrip(false); await settle(); await settle(); // leaving the strip hands the decision back
  setThrough(true); await settle(); setThrough(false);
  assert.deepEqual(calls(), [true, true, false], 'the UI decides each change where the backend does not');
  delete replies.set_click_through;
}

// Settings > Rooms (O10): roomsOf reads adm.rooms as rooms.rs does; a pattern is checked by the backend (rooms_test,
// debounced 200 ms), red and never written while invalid; the live line; the 6-room cap; order and delete.
{
  const { roomsOf, rooms, MAX_ROOMS } = await import('./rooms.js');
  assert.deepEqual(roomsOf('{oops'), []);
  assert.deepEqual(roomsOf('{}'), []);
  const ok = (id, extra) => ({ id, name: id, pattern: '**', color: '#d9a84e', ...extra });
  const mixed = [1, ok(''), ok('c', { color: 'red' }), ok('n', { name: 'x'.repeat(33) }), ok('p', { pattern: ' ' }), ok('b'), ok('b', { pattern: 'dup' }), ok('a', { extra: 1 })];
  assert.deepEqual(roomsOf(JSON.stringify(mixed)), [ok('b'), ok('a')], 'bad entries and a duplicate id dropped, the rest in order, unknown keys gone');
  assert.equal(roomsOf(JSON.stringify(Array.from({ length: 8 }, (_, i) => ok(`r${i}`)))).length, MAX_ROOMS);

  replies.rooms_test = ({ pattern, cwds }) => (pattern === 're:(' ? new Error('regex parse error: unclosed group') : cwds.map(c => /terra/i.test(c)));
  const changed = [];
  let inRoom = null;
  hooks.roster = () => [{ dept: 'Terra', cwd: 'C:\\git\\Terra', room: inRoom }, { dept: 'Terra', cwd: 'C:\\git\\Terra\\ui', room: inRoom },
    { dept: 'scratch', cwd: 'C:\\Temp\\terra-x', temp: true, room: null }, { dept: 'Geneseed', cwd: 'C:\\git\\Geneseed', room: null }];
  hooks.roomsChanged = () => changed.push(rooms.list.map(r => r.id).join());
  const sec = form.querySelector('section[data-cat="hall"]'), add = sec.querySelector('.room-add');
  const rowsNow = () => sec.querySelectorAll('.room-row');
  const before = store.get('adm.rooms', '[]');
  add.click();
  let row = rowsNow()[0];
  const pat = () => row.querySelector('.room-pattern'), line = () => row.querySelector('.room-live').textContent;
  const type = v => { pat().value = v; pat().dispatch('input'); };
  assert.equal(row.querySelector('.room-color').value, T.sash[0], 'a new rule takes the first unused sash colour');
  type('re:(');
  tick(200); await flush();
  assert.ok(pat().classList.contains('bad'), 'red');
  assert.match(pat().title, /unclosed group/, 'the message in its title');
  assert.equal(store.get('adm.rooms', '[]'), before, 'an invalid draft is never written');
  assert.deepEqual(rooms.list, []);
  type('**/terra/**');
  tick(199); await flush();
  assert.deepEqual(rooms.list, [], 'debounced');
  tick(1); await flush();
  assert.ok(!pat().classList.contains('bad'));
  assert.equal(JSON.parse(store.get('adm.rooms')).length, 1, 'saved once its pattern compiles');
  const first = rooms.list[0];
  assert.deepEqual([first.pattern, first.name, first.color, /^r[0-9a-z]+$/.test(first.id)], ['**/terra/**', 'Room 1', T.sash[0], true]);
  assert.equal(changed.at(-1), first.id, 'the hall told');
  assert.equal(line(), 'Terra, scratch (break-out)', 'while typing: the raw hits, a temp folder marked');
  pat().dispatch('change');
  assert.equal(line(), 'No session here now', 'at rest: the sessions in the room now');
  inRoom = first.id;
  tick(2000);
  assert.equal(line(), 'Terra', 'the live line follows the roster');
  type('re:(');
  tick(200); await flush();
  assert.equal(rooms.list[0].pattern, '**/terra/**', 'invalid: the last valid pattern stays in force');
  assert.match(line(), /not saved/);
  pat().dispatch('change'); tick(2000);
  assert.match(line(), /not saved/, 'the red line stays while the pattern is invalid, at rest too');
  // a second rule: an earlier rule takes Terra
  add.click();
  row = rowsNow()[1];
  assert.equal(row.querySelector('.room-color').value, T.sash[1]);
  type('re:git');
  tick(200);
  const asked = hooks.roster;
  hooks.roster = () => [{ dept: 'Late', cwd: 'C:\\git\\Late', room: null }, ...asked()]; // a tick lands before the answer
  await flush();
  assert.equal(line(), 'Terra (→ Room 1), scratch (break-out)', 'the hits read against the roster they were asked for');
  hooks.roster = asked;
  const second = rooms.list[1].id;
  // order and delete
  rowsNow()[0].querySelector('.room-down').click();
  assert.deepEqual(rooms.list.map(r => r.id), [second, first.id], 'moved down');
  assert.deepEqual(JSON.parse(store.get('adm.rooms')).map(r => r.id), [second, first.id]);
  rowsNow()[1].querySelector('.room-del').click();
  assert.deepEqual(rooms.list.map(r => r.id), [second], 'deleted');
  // the cap: "Add room" off at six rules
  while (rowsNow().length < MAX_ROOMS) add.click();
  assert.equal(add.disabled, true);
  add.click();
  assert.equal(rowsNow().length, MAX_ROOMS);
  // Reset to defaults leaves the rooms alone
  form.querySelector('.reset').click(); form.querySelector('.reset').click();
  assert.deepEqual(rooms.list.map(r => r.id), [second]);
}

// Settings > Hall > Added themes: the packs the backend lists, joined with what loaded at start (PACKS); install by
// owner/repo, update, remove, each a backend call that greys the buttons while it runs; any success: Restart to apply.
{
  const { PACKS } = await import('./themes.js');
  const box = form.querySelector('section[data-cat="themes"] #packs');
  assert.ok(box && box.hasAttribute('data-host') && box.classList.contains('host-only'), 'host only');
  assert.equal(form.querySelector('section[data-cat="themes"]').children[0], box, 'the Themes tab is the packs card');
  const rows = () => box.querySelectorAll('.pk-row'), rowOf = id => rows().find(r => r.dataset.pack === id);
  const repo = box.querySelector('.pk-repo'), install = box.querySelector('.pk-install'), line = box.querySelector('.pk-line'), restart = box.querySelector('.pk-restart');
  const btn = (row, text) => row.querySelectorAll('button').find(b => b.textContent === text);
  assert.equal(repo.placeholder, 'owner/repo');
  // the list: the repo with its count, Update and Remove; the local one tagged, neither (a hint: the app never deletes it)
  assert.equal(rows().length, 2);
  const bob = rowOf('bob/worlds'), mine = rowOf('local/mine');
  assert.match(bob.textContent, /bob\/worlds/);
  assert.match(bob.textContent, /2 themes/);
  assert.match(bob.textContent, /Steam, Pink vault/, 'the themes that loaded');
  assert.ok(btn(bob, 'Update') && btn(bob, 'Remove'));
  assert.match(mine.textContent, /local folder/);
  assert.match(mine.textContent, /1 theme\b/);
  assert.equal(btn(mine, 'Update'), undefined);
  assert.equal(btn(mine, 'Remove'), undefined);
  assert.match(mine.textContent, /delete its folder by hand/);
  // a problem: the theme and the message on its row, as text
  assert.ok(PACKS.get('local/mine').problems.length, 'the broken theme recorded at start');
  assert.match(mine.textContent, /broken: .*<b>bad<\/b> bytes/);
  assert.equal(mine.querySelector('b'), null);
  assert.equal(restart.hidden, true);
  // not a repository name: said, nothing invoked
  for (const typed of ['nope', 'local/x', 'LOCAL/x', 'a/..', 'a/.', '-a/b', 'a/b/c', 'https://gitlab.com/a/b', 'https://github.com/alice/x/tree/main', 'github.com/alice/x']) {
    repo.value = typed; install.click();
    assert.equal(line.textContent, 'Not a repository name: owner/repo', typed);
  }
  assert.equal(invoked('theme_pack_install').length, 0);
  // a refusal: the backend's message, the button back
  replies.theme_pack_install = new Error('no public repository x/y');
  repo.value = 'x/y'; install.click();
  assert.equal(install.disabled, true);
  await flush();
  assert.equal(line.textContent, 'no public repository x/y');
  assert.equal(install.disabled, false);
  assert.equal(restart.hidden, true);
  // a pasted GitHub address is its owner/repo
  repo.value = ' https://github.com/carol/x.git/ '; install.click(); await flush();
  assert.deepEqual(last('theme_pack_install'), { repo: 'carol/x' });
  // spaces around are trimmed; a typed .git is dropped as from an address
  repo.value = ' alice/x '; install.click(); await flush();
  assert.deepEqual(last('theme_pack_install'), { repo: 'alice/x' });
  repo.value = 'alice/x.git'; install.click(); await flush();
  assert.deepEqual(last('theme_pack_install'), { repo: 'alice/x' });
  // Update: the pack's dir
  replies.theme_pack_update = ({ dir }) => ({ ...disk.find(p => p.dir === dir) });
  btn(rowOf('bob/worlds'), 'Update').click(); await flush();
  assert.deepEqual(last('theme_pack_update'), { dir: 'bob__worlds' });
  assert.equal(line.textContent, 'Updated bob/worlds: 2 themes. Restart to apply.');
  assert.equal(restart.hidden, false, 'a success: Restart to apply');
  // Install: Downloading… with the buttons greyed, then the new row (not loaded until the restart); Restart restarts
  let done;
  replies.theme_pack_install = ({ repo: r }) => new Promise(ok => { done = () => { const p = { id: r, dir: r.replace('/', '__'), repo: r, installed: '2026-11-16T11:00:00Z', themes: ['a', 'b', 'c'] }; disk.push(p); ok(p); }; });
  repo.value = 'alice/adm-themes'; install.click();
  assert.deepEqual(last('theme_pack_install'), { repo: 'alice/adm-themes' });
  assert.equal(line.textContent, 'Downloading…');
  assert.ok(install.disabled && btn(rowOf('bob/worlds'), 'Update').disabled && btn(rowOf('bob/worlds'), 'Remove').disabled, 'greyed while it runs');
  done(); await flush();
  assert.match(rowOf('alice/adm-themes').textContent, /3 themes/);
  assert.equal(line.textContent, 'Installed alice/adm-themes: 3 themes. Restart to apply.');
  assert.equal(install.disabled, false);
  assert.equal(restart.hidden, false);
  // Remove: the pack's dir, its row gone
  replies.theme_pack_remove = ({ dir }) => { disk.splice(disk.findIndex(p => p.dir === dir), 1); };
  btn(rowOf('bob/worlds'), 'Remove').click(); await flush();
  assert.deepEqual(last('theme_pack_remove'), { dir: 'bob__worlds' });
  assert.equal(rowOf('bob/worlds'), undefined);
  assert.equal(rows().length, 2);
  assert.equal(line.textContent, 'Removed bob/worlds. Restart to apply.');
  assert.equal(restart.hidden, false);
  // one theme: the count in the singular
  replies.theme_pack_install = ({ repo: r }) => { const p = { id: r, dir: r.replace('/', '__'), repo: r, installed: 'now', themes: ['a'] }; disk.push(p); return p; };
  repo.value = 'dan/one'; install.click(); await flush();
  assert.equal(line.textContent, 'Installed dan/one: 1 theme. Restart to apply.');
  replies.restart = null;
  restart.click(); await flush();
  assert.equal(invoked('restart').length, 1);
  // a list that fails: said on the line
  replies.theme_packs = new Error('cannot read the themes folder');
  document.getElementById('prefs-open').click(); document.getElementById('prefs-open').click(); await flush(); // closed, opened: read again
  assert.equal(line.textContent, 'cannot read the themes folder');
}

// The world picker: a pack's world among the worlds, by its name; a pack's style of a shipped world among its styles.
{
  const w = field('world').options.find(o => o.value === 'bob/worlds:steampunk');
  assert.equal(w?.textContent, 'Steampunk');
  change('world', 'vault');
  assert.ok(field('theme').options.some(o => o.textContent === 'Pink vault' && o.value === 'bob/worlds:pink'));
  change('world', 'bob/worlds:steampunk');
  assert.equal(T.id, 'bob/worlds:steam');
}
console.log('packs ok');

// L4a: Settings > Status, a refused save, the remote view's states, the update's progress, the test notification, the CI switch.
{
  const prefs = document.getElementById('prefs'), opener = document.getElementById('prefs-open');
  const reopen = async () => { if (!prefs.hidden) { opener.click(); tick(400); } opener.click(); await flush(); };
  const tab = name => document.querySelector(`#prefs .cats [data-cat="${name}"]`);
  const NOW = Date.now();
  replies.integration_status = [
    { name: 'gh', state: 'warn', message: 'gh not logged in: run gh auth login', timeMs: NOW - 5 * 60000 },
    { name: 'remote', state: 'error', message: 'port 8765 in use', timeMs: NOW - 30_000 },
    { name: 'toast', state: 'ok', message: 'ready', timeMs: NOW - 3 * 3600_000 },
  ];
  await reopen();
  assert.equal(invoked('integration_status').length > 0, true, 'opening the panel reads the status');
  tab('status').click(); await flush();
  const rows = [...document.querySelectorAll('#prefs .st-row')];
  assert.deepEqual(rows.map(r => r.querySelector('.st-name').textContent), ['gh', 'remote', 'toast']);
  const err = rows[1];
  assert.equal(err.dataset.state, 'error');
  assert.equal(err.querySelector('.st-state').textContent, 'Error', 'the state is a word, not a colour alone');
  assert.equal(err.querySelector('.st-mark').textContent, '✕');
  assert.equal(err.querySelector('.st-mark').getAttribute('aria-hidden'), 'true');
  assert.equal(err.querySelector('.st-msg').textContent, 'port 8765 in use');
  assert.equal(err.querySelector('.st-ago').textContent, '<1m ago');
  assert.equal(rows[0].querySelector('.st-ago').textContent, '5m ago');
  assert.equal(rows[2].querySelector('.st-ago').textContent, '3h ago');
  assert.notEqual(rows[0].querySelector('.st-mark').textContent, rows[2].querySelector('.st-mark').textContent, 'warn and ok differ by mark');
  assert.equal(document.querySelector('#prefs section[data-cat="status"]').hidden, false);
  // refreshed every few seconds while the panel is open
  const n = invoked('integration_status').length;
  tick(4000); await flush();
  assert.ok(invoked('integration_status').length > n, 'refreshed while open');
  replies.integration_status = [];
  tick(4000); await flush();
  assert.equal(document.querySelectorAll('#prefs .st-row').length, 0);
  assert.equal(document.querySelector('#prefs .st-empty').textContent, t('prefs.status.empty'), 'an empty list says so');
  replies.integration_status = new Error('backend down');
  tick(4000); await flush();
  assert.equal(document.querySelector('#prefs .st-empty').textContent, 'Status unavailable: backend down');

  // I6: the adm.ci switch saves like the others; the gh line shows the backend's gh entry
  replies.integration_status = [{ name: 'gh', state: 'warn', message: 'gh not logged in: run gh auth login', timeMs: NOW }];
  tab('work').click();
  assert.equal(MONITOR.ci, '0');
  assert.equal(store.get('adm.ci', MONITOR.ci), '0', 'off by default');
  const reads = invoked('integration_status').length;
  change('ci', true);
  assert.equal(store.get('adm.ci'), '1');
  await flush();
  assert.equal(last('settings_save').values['adm.ci'], '1', 'saved to the file');
  assert.ok(invoked('integration_status').length > reads, 'the gh line is read again after the switch');
  assert.equal(document.querySelector('#prefs .ci-gh').textContent, 'gh not logged in: run gh auth login');
  assert.equal(field('ci').checked, true);
  replies.integration_status = [{ name: 'gh', state: 'ok', message: 'gh ready', timeMs: NOW }];
  tick(2000); await flush();
  assert.equal(document.querySelector('#prefs .ci-gh').textContent, 'gh ready');
  change('ci', false);
  assert.equal(store.get('adm.ci'), '0');

  // F5: a refused settings_save shows an inline line; the next good one clears it
  const saveErr = document.querySelector('#prefs .save-err');
  assert.equal(saveErr.hidden, true);
  replies.settings_save = new Error('disk full');
  await store.flush();
  assert.equal(saveErr.hidden, false);
  assert.equal(saveErr.textContent, 'Not saved: disk full');
  replies.settings_save = undefined;
  await store.flush();
  assert.equal(saveErr.hidden, true);
  assert.equal(saveErr.textContent, '');

  // F5: remote_status failing keeps the category and says why; the new states are shown
  replies.remote_status = new Error('settings unreadable');
  await reopen();
  assert.equal(tab('remote').hidden, false, 'the remote category stays');
  const rv = document.getElementById('remote'), rvErr = rv.querySelector('.rv-err'), rvState = rv.querySelector('.rv-state');
  assert.equal(rv.hidden, false);
  assert.equal(rvErr.hidden, false);
  assert.equal(rvErr.textContent, 'The remote view could not be read: settings unreadable');
  replies.remote_status = { enabled: false, saved: true, loopback: false, error: 'address in use', actions_allowed: false, port: 8765, urls: [], qr_svg: null };
  await reopen();
  assert.equal(rvErr.hidden, true);
  assert.equal(rvState.hidden, false);
  assert.equal(rvState.textContent, 'Left on, but not listening on the network: address in use');
  assert.equal(field('remoteOn').checked, true, 'the saved choice stays shown');
  assert.equal(rv.querySelector('.rv-on').hidden, true, 'no pairing while nothing listens');
  replies.remote_status = { enabled: false, saved: false, loopback: true, error: null, actions_allowed: false, port: 8765, urls: [], qr_svg: null };
  await reopen();
  assert.equal(rvState.textContent, 'The network view is off. This PC still answers on 127.0.0.1 only, with the pairing token, for the local command-line tool.');
  replies.remote_status = { enabled: true, saved: true, loopback: false, error: null, actions_allowed: false, port: 8765, urls: [], qr_svg: null };
  await reopen();
  assert.equal(rvState.hidden, true, 'a healthy view says nothing');

  // F18: the update's progress on its line; a percent when the total is known, bytes otherwise
  replies.check_update = { current: '0.6.5', available: '0.7.0' };
  replies.install_update = new Promise(() => {}); // never answers: the download goes on
  const up = document.getElementById('updates');
  tab('system').click();
  up.querySelector('.up-check').click(); await flush();
  up.querySelector('.up-install').click();
  emit('update-progress', { downloaded: 250, total: 1000 });
  assert.equal(up.querySelector('.up-line').textContent, 'Downloading the update… 25%');
  emit('update-progress', { downloaded: 1000, total: 1000 });
  assert.equal(up.querySelector('.up-line').textContent, 'Downloading the update… 100%');
  emit('update-progress', { downloaded: 3 * 1048576, total: null });
  assert.equal(up.querySelector('.up-line').textContent, 'Downloading the update… 3.0 MB');

  // F18: the test notification button calls the command and says whether it was sent
  const btn = document.querySelector('#prefs .test-notify'), line = document.querySelector('#prefs .test-line');
  replies.test_notification = null;
  btn.click(); await flush();
  assert.equal(invoked('test_notification').length, 1);
  assert.equal(line.textContent, 'Test notification sent.');
  assert.equal(btn.disabled, false);
  replies.test_notification = new Error('notifications are blocked');
  btn.click(); await flush();
  assert.equal(invoked('test_notification').length, 2);
  assert.equal(line.textContent, 'Not sent: notifications are blocked');
}
console.log('status ok');
