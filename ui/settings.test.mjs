import assert from 'node:assert/strict';
import { install, replies, calls, invoked, tick, flush, emit } from './testdom.mjs';

// The host app (not the remote view: bridge.js reads REMOTE once per process). Saved values come from settings.json.
install();
Object.assign(replies, {
  settings_load: { 'adm.settings': JSON.stringify({ staleMin: 999, onTop: false, stripSize: 'XL' }), 'adm.scale': '2' },
  platform: 'windows', strip_supported: true, start_at_login: true,
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
