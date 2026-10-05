// Settings: a parchment panel behind the header gear (opens and closes like the Chronicon).
// UI values (every adm.* key) live in the backend's settings.json (survives a reinstall that wipes
// the WebView), mirrored in memory and in localStorage as a cache; without a backend, localStorage
// alone. Always-on-top goes through the window API, start-at-login and the stale-petition mark
// through the backend (start_at_login, set_stale_minutes).
import { panel } from './panel.js';

const invokeTop = (cmd, args) => window.__TAURI__?.core?.invoke(cmd, args);
const mem = {};
let saved = null;
try { saved = await invokeTop('settings_load', {}); } catch { /* no backend or failed: the cache */ }
let saveTimer;
const persist = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { invokeTop('settings_save', { values: { ...mem } })?.catch(err => console.warn('settings_save', err)); } catch { /* no backend */ } }, 300); };
if (saved && typeof saved === 'object' && Object.keys(saved).length) Object.assign(mem, saved);
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

let sync = () => {};
export const renderSettings = () => sync(); // the header controls changed: refresh the panel's copy

// hooks: { mode(), setMode(m), muted(), setMuted(b), placed() } from app.js. T may be absent (plain browser).
export function initSettings(T, hooks) {
  const invoke = (cmd, args) => T?.core?.invoke(cmd, args) ?? Promise.reject(new Error('no backend'));
  const win = () => T?.window?.getCurrentWindow();
  const root = document.getElementById('prefs'), form = root.querySelector('form'), opener = document.getElementById('prefs-open');
  const field = name => form.elements[name];
  let login = null;

  const applyTop = () => win()?.setAlwaysOnTop(settings.onTop).catch(err => console.warn('setAlwaysOnTop', err));
  const save = () => store.set('adm.settings', JSON.stringify(settings));
  const pushStale = () => invoke('set_stale_minutes', { minutes: settings.staleMin }).catch(() => {});
  applyTop(); // tauri.conf.json starts on top; restore the saved choice
  pushStale();

  sync = () => {
    field('onTop').checked = settings.onTop;
    field('mode').value = hooks.mode();
    field('chime').checked = !hooks.muted();
    for (const k in NUM) if (document.activeElement !== field(k)) field(k).value = settings[k];
    for (const k in RANGE) if (document.activeElement !== field(k)) field(k).value = Number.isNaN(place[k]) ? '' : place[k];
    field('idleFps').value = String(perf.idleFps);
    field('pauseHidden').checked = perf.pauseHidden;
    field('login').checked = !!login;
    field('login').disabled = login === null;
  };
  const readLogin = (enable) => invoke('start_at_login', enable === undefined ? {} : { enable })
    .then(on => { login = on; }, () => { login = null; }).finally(sync);
  T?.event?.listen('autostart', e => { login = e.payload; sync(); });

  const setPlace = (lat, lon) => {
    Object.assign(place, { lat, lon });
    for (const k in RANGE) store.set(`adm.${k}`, Number.isNaN(place[k]) ? '' : String(place[k]));
    hooks.placed();
  };
  form.onsubmit = e => e.preventDefault();
  form.onchange = e => {
    const el = e.target, k = el.name;
    if (k === 'onTop') { settings.onTop = el.checked; save(); applyTop(); }
    else if (k === 'mode') hooks.setMode(el.value);
    else if (k === 'chime') hooks.setMuted(!el.checked);
    else if (k === 'idleFps' || k === 'pauseHidden') setPerf(field('idleFps').value, field('pauseHidden').checked);
    else if (k === 'login') { el.disabled = true; readLogin(el.checked); return; }
    else if (k in RANGE) { setPlace(coord('lat', field('lat').value), coord('lon', field('lon').value)); el.value = Number.isNaN(place[k]) ? '' : place[k]; }
    else if (k in NUM) { settings[k] = clamp(k, el.value); el.value = settings[k]; save(); if (k === 'staleMin') pushStale(); }
    sync();
  };
  form.querySelector('.clear').onclick = () => { setPlace(NaN, NaN); sync(); };
  form.querySelector('.reset').onclick = () => {
    Object.assign(settings, DEFAULTS);
    setPlace(NaN, NaN);
    setPerf(12, true);
    save(); applyTop(); pushStale();
    hooks.setMode('auto'); hooks.setMuted(false);
    sync();
  };

  panel(root, [opener], { onOpen: () => { readLogin(); sync(); } }); // readLogin: the tray may have changed it
}
