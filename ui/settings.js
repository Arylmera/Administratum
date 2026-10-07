// Settings: a parchment panel behind the header gear (opens and closes like the Chronicon).
// UI values (every adm.* key) live in the backend's settings.json (survives a reinstall that wipes
// the WebView), mirrored in memory and in localStorage as a cache; without a backend, localStorage
// alone. Always-on-top goes through the window API, start-at-login and the stale-petition mark
// through the backend (start_at_login, set_stale_minutes). In the remote view (bridge.js) the PC's settings
// are read once and never written back: the view's own scale, lighting and chime stay in this browser.
import { panel } from './panel.js';
import { invoke, listen, tauri, REMOTE } from './bridge.js';
import { T, THEMES, WORLDS, setTheme } from './theme.js';
import { minutesOf, hhmmOf } from './quiet.js';
import { view as viewMode, setView } from './view.js';

const mem = {};
let saved = null;
try { saved = await invoke('settings_load', {}); } catch { /* no backend or failed: the cache */ }
let saveTimer;
const persist = () => { if (REMOTE) return; clearTimeout(saveTimer); saveTimer = setTimeout(() => invoke('settings_save', { values: { ...mem } }).catch(err => console.warn('settings_save', err)), 300); };
const LOCAL = ['adm.mode', 'adm.muted', 'adm.scale', 'adm.theme', 'adm.view']; // the remote view's own choices
if (REMOTE) {
  if (saved && typeof saved === 'object') Object.assign(mem, saved);
  try { for (const k of LOCAL) { const v = localStorage.getItem(k); if (v != null) mem[k] = v; } } catch { /* storage blocked */ }
} else if (saved && typeof saved === 'object' && Object.keys(saved).length) Object.assign(mem, saved);
else {
  // First run with the file (or no backend): take the cached adm.* keys, and write them to the file.
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('adm.')) mem[k] = localStorage.getItem(k); } } catch { /* storage blocked */ }
  if (Object.keys(mem).length) persist();
}

export const store = {
  get(k, d) { return mem[k] ?? d; },
  set(k, v) {
    mem[k] = v;
    try { localStorage.setItem(k, v); } catch { /* storage blocked: memory + file */ }
    persist();
  },
};

// Numbers: [default, min, max]. Context windows are in k tokens.
const NUM = { staleMin: [5, 1, 120], napMin: [2, 1, 120], cogHoldS: [10, 0, 120], ctxHaiku: [200, 8, 10_000], ctxOther: [1000, 8, 10_000] };
const DEFAULTS = { onTop: true, ...Object.fromEntries(Object.entries(NUM).map(([k, [d]]) => [k, d])) };
const clamp = (k, v) => { const [d, lo, hi] = NUM[k]; v = Math.round(+v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
function load() {
  let saved = {};
  try { saved = JSON.parse(store.get('adm.settings', '{}')) ?? {}; } catch { /* corrupt: defaults */ }
  const s = { ...DEFAULTS };
  if (typeof saved.onTop === 'boolean') s.onTop = saved.onTop;
  for (const k in NUM) if (k in saved) s[k] = clamp(k, saved[k]);
  return s;
}
// Shared, read live by actors.js (thresholds) and app.js (context windows).
export const settings = load();

// Where Auto lighting takes its sun (adm.lat / adm.lon, degrees, 4 decimals); NaN = unset: fixed hours.
const RANGE = { lat: 90, lon: 180 };
const coord = (k, v) => (v === '' || v == null || !Number.isFinite(+v) ? NaN : Math.round(1e4 * Math.min(RANGE[k], Math.max(-RANGE[k], +v))) / 1e4);
export const place = { lat: coord('lat', store.get('adm.lat', '')), lon: coord('lon', store.get('adm.lon', '')) };

// Performance (adm.idleFps, adm.pauseHidden): read live by app.js's frame loop.
const IDLE_FPS = [6, 8, 12, 30];
const fpsOf = v => (IDLE_FPS.includes(+v) ? +v : 12);
export const perf = { idleFps: fpsOf(store.get('adm.idleFps', 12)), pauseHidden: store.get('adm.pauseHidden', '1') !== '0' };
const setPerf = (idleFps, pauseHidden) => {
  Object.assign(perf, { idleFps: fpsOf(idleFps), pauseHidden });
  store.set('adm.idleFps', String(perf.idleFps)); store.set('adm.pauseHidden', pauseHidden ? '1' : '0');
};

// Question petitions (adm.questions, adm.questionToast): a turn ending on a question queues like a petition;
// read live by actors.js and app.js, pushed to the backend (set_question_prefs) for its toast and chime.
export const questions = { on: store.get('adm.questions', '1') !== '0', toast: store.get('adm.questionToast', '1') !== '0' };
const setQuestions = (on, toast) => {
  Object.assign(questions, { on, toast });
  store.set('adm.questions', on ? '1' : '0'); store.set('adm.questionToast', toast ? '1' : '0');
};

// Quiet hours (adm.quiet, adm.quietFrom, adm.quietTo; minutes after midnight): read live by app.js (chimes, the header
// moon), pushed to the backend (set_quiet) for its toasts.
const minutes = (v, d) => (v !== '' && Number.isInteger(+v) && +v >= 0 && +v < 1440 ? +v : d);
export const quiet = { on: store.get('adm.quiet', '0') === '1', from: minutes(store.get('adm.quietFrom', '1320'), 1320), to: minutes(store.get('adm.quietTo', '480'), 480) };
const setQuiet = (on, from, to) => {
  Object.assign(quiet, { on, from, to });
  store.set('adm.quiet', on ? '1' : '0'); store.set('adm.quietFrom', String(from)); store.set('adm.quietTo', String(to));
};

// Scale (adm.scale): CSS px per logical px (1-3, the slider), or 'auto' (app.js); read live by app.js's fit().
const okScale = v => (v === 'auto' || (+v >= 1 && +v <= 3) ? v : 'auto');
export const view = { scale: okScale(store.get('adm.scale')) };
const setScale = v => { view.scale = okScale(String(v)); store.set('adm.scale', view.scale); };

let sync = () => {};
export const renderSettings = () => sync(); // the header controls changed: refresh the panel's copy

// hooks: { mode(), setMode(m), muted(), setMuted(b), placed(), rescaled(), quieted() } from app.js.
export function initSettings(hooks) {
  const win = () => tauri()?.window?.getCurrentWindow();
  const root = document.getElementById('prefs'), form = root.querySelector('form'), opener = document.getElementById('prefs-open');
  const field = name => form.elements[name];
  field('world').replaceChildren(...Object.entries(WORLDS).map(([id, name]) => new Option(name, id)));
  const styles = world => Object.values(THEMES).filter(th => th.world === world); // theme.js + themes.js
  const pickTheme = id => { store.set('adm.theme', id); setTheme(id); };
  const pickView = mode => { store.set('adm.view', mode); setView(mode); };
  let login = null;

  const applyTop = () => win()?.setAlwaysOnTop(settings.onTop).catch(err => console.warn('setAlwaysOnTop', err));
  const save = () => store.set('adm.settings', JSON.stringify(settings));
  const pushStale = () => invoke('set_stale_minutes', { minutes: settings.staleMin }).catch(() => {});
  const pushQuestions = () => invoke('set_question_prefs', { enabled: questions.on, toast: questions.toast }).catch(() => {});
  const pushQuiet = () => invoke('set_quiet', { enabled: quiet.on, fromMin: quiet.from, toMin: quiet.to }).catch(() => {});
  if (REMOTE) {
    // The PC's settings, read only; window, login, remote view and reset belong to the PC.
    for (const f of form.querySelectorAll('[data-host]')) f.disabled = true;
    for (const e of form.querySelectorAll('.host-only')) e.hidden = true;
    form.querySelector('.remote-only').hidden = false;
  } else {
    applyTop(); // tauri.conf.json starts on top; restore the saved choice
    pushStale(); pushQuestions(); pushQuiet();
  }

  sync = () => {
    field('onTop').checked = settings.onTop;
    const auto = view.scale === 'auto';
    field('scaleAuto').checked = auto; field('scale').disabled = auto;
    if (!auto) field('scale').value = view.scale;
    field('scaleOut').value = auto ? 'Auto' : `${view.scale}x`;
    field('mode').value = hooks.mode();
    const world = THEMES[T.id]?.world ?? 'w40k';
    field('world').value = world;
    field('theme').replaceChildren(...styles(world).map(th => new Option(th.name, th.id)));
    field('theme').value = T.id;
    field('view').value = viewMode.mode;
    field('chime').checked = !hooks.muted();
    for (const k in NUM) if (document.activeElement !== field(k)) field(k).value = settings[k];
    for (const k in RANGE) if (document.activeElement !== field(k)) field(k).value = Number.isNaN(place[k]) ? '' : place[k];
    field('idleFps').value = String(perf.idleFps);
    field('pauseHidden').checked = perf.pauseHidden;
    field('openWith').value = store.get('adm.openWith', 'explorer');
    if (document.activeElement !== field('openCmd')) field('openCmd').value = store.get('adm.openCmd', '');
    field('openCmd').disabled = field('openWith').value !== 'custom';
    field('questions').checked = questions.on;
    field('questionToast').checked = questions.toast;
    field('questionToast').disabled = !questions.on;
    field('quietOn').checked = quiet.on;
    for (const k of ['quietFrom', 'quietTo']) {
      if (document.activeElement !== field(k)) field(k).value = hhmmOf(quiet[k === 'quietFrom' ? 'from' : 'to']);
      field(k).disabled = !quiet.on;
    }
    field('login').checked = !!login;
    field('login').disabled = login === null;
    field('updateCheck').checked = store.get('adm.updateCheck', '1') !== '0';
  };
  const readLogin = (enable) => invoke('start_at_login', enable === undefined ? {} : { enable })
    .then(on => { login = on; }, () => { login = null; }).finally(sync);
  listen('autostart', e => { login = e.payload; sync(); });

  // Remote view (host only): serve on the LAN, allow actions, port, pairing QR (remote_status / remote_set).
  const rv = form.querySelector('#remote'), rvErr = rv.querySelector('.rv-err'), regen = rv.querySelector('.rv-regen');
  const showRemote = st => {
    rvErr.hidden = true;
    field('remoteOn').checked = st.enabled;
    field('remoteActions').checked = st.actions_allowed;
    if (document.activeElement !== field('remotePort')) field('remotePort').value = st.port;
    rv.querySelector('.rv-on').hidden = !st.enabled;
    const urls = rv.querySelector('.rv-urls');
    urls.replaceChildren(...(st.urls.length ? st.urls : ['No private network address found on this PC.']).map(u => { const li = document.createElement('li'); li.textContent = u; return li; }));
    const qr = rv.querySelector('.rv-qr');
    qr.hidden = !st.qr_svg;
    if (st.qr_svg) qr.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(st.qr_svg)}`;
  };
  const rvCall = (cmd, args) => {
    const els = rv.querySelectorAll('input, button:not(.rv-fw-btn)');
    for (const el of els) el.disabled = true;
    return invoke(cmd, args).then(showRemote, err => { rvErr.textContent = String(err); readRemote(true); })
      .finally(() => { for (const el of els) el.disabled = false; });
  };
  const readRemote = keepErr => invoke('remote_status').then(st => { showRemote(st); rvErr.hidden = !keepErr; }, () => { rv.hidden = true; root.querySelector('.cats [data-cat="remote"]').hidden = true; });
  const applyRemote = () => rvCall('remote_set', { enabled: field('remoteOn').checked, port: Math.round(+field('remotePort').value), actionsAllowed: field('remoteActions').checked });
  // Firewall rule for the port (firewall_status, read-only; firewall_allow / firewall_remove, elevated: UAC).
  const fwLine = rv.querySelector('.rv-fw'), fwPublic = rv.querySelector('.rv-public'), fwBtns = rv.querySelectorAll('.rv-fw-btn');
  const fwPort = () => { const p = +field('remotePort').value; return Number.isInteger(p) && p >= 1024 && p <= 65535 ? p : null; };
  const showFw = st => { fwLine.textContent = st.detail; fwLine.dataset.rule = st.rule; fwPublic.hidden = st.network !== 'public'; };
  const fwErr = err => { fwLine.textContent = String(err); delete fwLine.dataset.rule; };
  let fwBusy = false, fwTimer;
  const readFw = () => {
    const port = fwPort();
    if (fwBusy) return;
    if (port === null) { fwErr('Port must be between 1024 and 65535.'); return; }
    invoke('firewall_status', { port }).then(st => { if (!fwBusy && port === fwPort()) showFw(st); }, fwErr);
  };
  for (const b of fwBtns) b.onclick = () => {
    const port = fwPort();
    if (port === null) { readFw(); return; }
    fwBusy = true;
    for (const x of fwBtns) x.disabled = true;
    fwLine.textContent = 'Waiting for Windows…'; delete fwLine.dataset.rule;
    invoke(b.dataset.cmd, { port }).then(showFw, fwErr)
      .finally(() => { fwBusy = false; for (const x of fwBtns) x.disabled = false; });
  };
  field('remotePort').addEventListener('input', () => { clearTimeout(fwTimer); fwTimer = setTimeout(readFw, 600); });

  let armed;
  regen.onclick = () => {
    if (!armed) { // confirm first: a second click within 4 s
      regen.textContent = 'Click again: unpair every device';
      armed = setTimeout(() => { armed = null; regen.textContent = 'Regenerate token'; }, 4000);
      return;
    }
    clearTimeout(armed); armed = null; regen.textContent = 'Regenerate token';
    rvCall('remote_regenerate_token');
  };

  // Updates (host only): check_update / install_update (main.rs). The startup check only offers; a click installs.
  const up = form.querySelector('#updates'), upLine = up.querySelector('.up-line');
  const upCheck = up.querySelector('.up-check'), upInstall = up.querySelector('.up-install');
  const showUpdate = st => {
    upLine.textContent = st.available ? `Version ${st.current}. Version ${st.available} is available.` : `Version ${st.current}, up to date.`;
    upInstall.hidden = !st.available;
    opener.classList.toggle('update', !!st.available);
  };
  const checkUpdate = () => {
    upCheck.disabled = true;
    return invoke('check_update').then(showUpdate, err => { upLine.textContent = `Update check failed: ${err}`; })
      .finally(() => { upCheck.disabled = false; });
  };
  upCheck.onclick = checkUpdate;
  upInstall.onclick = () => {
    upInstall.disabled = upCheck.disabled = true;
    upLine.textContent = 'Downloading the update…';
    invoke('install_update').catch(err => { upLine.textContent = `Update failed: ${err}`; upInstall.disabled = upCheck.disabled = false; });
  };
  if (!REMOTE) {
    tauri()?.app?.getVersion().then(v => { upLine.textContent = `Version ${v}`; }).catch(() => {});
    if (store.get('adm.updateCheck', '1') !== '0') checkUpdate();
  }

  const setPlace = (lat, lon) => {
    Object.assign(place, { lat, lon });
    for (const k in RANGE) store.set(`adm.${k}`, Number.isNaN(place[k]) ? '' : String(place[k]));
    hooks.placed();
  };
  form.onsubmit = e => e.preventDefault();
  // The slider rescales while it is dragged, not only on release (9 steps: at most 9 relayouts per drag).
  form.oninput = e => { if (e.target.name === 'scale') { setScale(e.target.value); hooks.rescaled(); sync(); } };
  form.onchange = e => {
    const el = e.target, k = el.name;
    if (k.startsWith('remote')) { applyRemote(); return; }
    if (k === 'onTop') { settings.onTop = el.checked; save(); applyTop(); }
    else if (k === 'scaleAuto') { setScale(el.checked ? 'auto' : field('scale').value); hooks.rescaled(); }
    else if (k === 'mode') hooks.setMode(el.value);
    else if (k === 'world') pickTheme(styles(el.value)[0].id);
    else if (k === 'theme') pickTheme(el.value);
    else if (k === 'view') pickView(el.value);
    else if (k === 'chime') hooks.setMuted(!el.checked);
    else if (k === 'idleFps' || k === 'pauseHidden') setPerf(field('idleFps').value, field('pauseHidden').checked);
    else if (k === 'questions' || k === 'questionToast') { setQuestions(field('questions').checked, field('questionToast').checked); pushQuestions(); }
    else if (k === 'quietOn' || k === 'quietFrom' || k === 'quietTo') {
      setQuiet(field('quietOn').checked, minutesOf(field('quietFrom').value) ?? quiet.from, minutesOf(field('quietTo').value) ?? quiet.to);
      pushQuiet(); hooks.quieted?.();
    }
    else if (k === 'openWith' || k === 'openCmd') store.set(`adm.${k}`, el.value);
    else if (k === 'login') { el.disabled = true; readLogin(el.checked); return; }
    else if (k === 'updateCheck') store.set('adm.updateCheck', el.checked ? '1' : '0');
    else if (k in RANGE) { setPlace(coord('lat', field('lat').value), coord('lon', field('lon').value)); el.value = Number.isNaN(place[k]) ? '' : place[k]; }
    else if (k in NUM) { settings[k] = clamp(k, el.value); el.value = settings[k]; save(); if (k === 'staleMin') pushStale(); }
    sync();
  };
  // Categories: a side button shows its section of the form, one at a time.
  const cats = root.querySelectorAll('.cats [data-cat]'), sections = form.querySelectorAll('section[data-cat]');
  for (const b of cats) b.onclick = () => {
    for (const c of cats) if (c === b) c.setAttribute('aria-current', 'page'); else c.removeAttribute('aria-current');
    for (const s of sections) s.hidden = s.dataset.cat !== b.dataset.cat;
  };
  const desk = form.querySelector('.desk-icon');
  desk.onclick = () => invoke('desktop_shortcut').then(() => { desk.textContent = 'Desktop icon added'; }, err => { desk.textContent = String(err); });
  form.querySelector('.clear').onclick = () => { setPlace(NaN, NaN); sync(); };
  form.querySelector('.reset').onclick = () => {
    Object.assign(settings, DEFAULTS);
    setPlace(NaN, NaN);
    setPerf(12, true);
    setQuestions(true, true);
    setQuiet(false, 1320, 480);
    store.set('adm.openWith', 'explorer');
    store.set('adm.updateCheck', '1');
    setScale('auto'); hooks.rescaled();
    save(); applyTop(); pushStale(); pushQuestions(); pushQuiet();
    hooks.setMode('auto'); hooks.setMuted(false);
    pickTheme('tier2');
    pickView('flat');
    sync();
    hooks.quieted?.();
  };

  panel(root, [opener], { onOpen: () => { if (!REMOTE) { readLogin(); readRemote().then(readFw); } sync(); } }); // readLogin: the tray may have changed it
}
