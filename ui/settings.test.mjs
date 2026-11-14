import assert from 'node:assert/strict';
import { install, replies, calls, invoked, tick, flush, emit } from './testdom.mjs';

// The host app (not the remote view: bridge.js reads REMOTE once per process). Saved values come from settings.json.
install();
Object.assign(replies, {
  settings_load: { 'adm.settings': JSON.stringify({ staleMin: 999, onTop: false, stripSize: 'XL' }), 'adm.scale': '2' },
  platform: 'windows', strip_supported: true, on_top_supported: true, start_at_login: true,
  check_update: { current: '0.6.5', available: '0.7.0' },
  remote_status: { enabled: false, actions_allowed: false, port: 8765, urls: [], qr_svg: null },
  firewall_status: ({ port }) => ({ detail: `rule for ${port}`, rule: 'on', network: 'private' }),
});
await import('./themes.js'); // every world's styles, as app.js loads them
const { settings, store, view, quiet, place, initSettings, MONITOR } = await import('./settings.js');
const { T } = await import('./theme.js');

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
form.querySelector('fieldset .clear:not(.desk-icon)').click();
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

// Categories: one section at a time.
const cat = name => document.querySelector(`#prefs .cats [data-cat="${name}"]`);
cat('petitions').click();
assert.equal(cat('petitions').getAttribute('aria-current'), 'page');
assert.equal(cat('hall').getAttribute('aria-current'), null);
for (const s of form.querySelectorAll('section[data-cat]')) assert.equal(s.hidden, s.dataset.cat !== 'petitions', s.dataset.cat);

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

// Reset: every value back to its default, theme and view included.
seen.length = 0;
form.querySelector('.reset').click();
assert.equal(settings.staleMin, 5);
assert.equal(settings.onTop, true);
assert.deepEqual(quiet, { on: false, from: 1320, to: 480 });
assert.equal(view.scale, 'auto');
assert.equal(T.id, 'tier2');
assert.equal(store.get('adm.view'), 'flat');
assert.deepEqual(last('set_stale_minutes'), { minutes: 5 });
assert.deepEqual(seen.filter(s => s[0] === 'mode' || s[0] === 'muted'), [['mode', 'auto'], ['muted', false]]);
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
  const sec = form.querySelector('section[data-cat="rooms"]'), add = sec.querySelector('.room-add');
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
  form.querySelector('.reset').click();
  assert.deepEqual(rooms.list.map(r => r.id), [second]);
}
