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
import { view as viewMode, viewName, setView, onView, stripKind } from './view.js';
import { rooms, roomsOf, setRooms, MAX_ROOMS } from './rooms.js';

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
const STRIP_SIZES = ['S', 'M', 'L']; // the strip's pixel size (stripwin.js stripScale)
const SIDES = ['left', 'right']; // the desktop column's screen edge (stripwin.js); right by default: desktop icons sit on the left
const DEFAULTS = { onTop: true, stripSize: 'M', stripSide: 'right', stripBackdrop: false, isoBackdrop: true, ...Object.fromEntries(Object.entries(NUM).map(([k, [d]]) => [k, d])) };
const clamp = (k, v) => { const [d, lo, hi] = NUM[k]; v = Math.round(+v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
function load() {
  let saved = {};
  try { saved = JSON.parse(store.get('adm.settings', '{}')) ?? {}; } catch { /* corrupt: defaults */ }
  const s = { ...DEFAULTS };
  if (typeof saved.onTop === 'boolean') s.onTop = saved.onTop;
  if (STRIP_SIZES.includes(saved.stripSize)) s.stripSize = saved.stripSize;
  if (SIDES.includes(saved.stripSide)) s.stripSide = saved.stripSide;
  if (typeof saved.stripBackdrop === 'boolean') s.stripBackdrop = saved.stripBackdrop;
  if (typeof saved.isoBackdrop === 'boolean') s.isoBackdrop = saved.isoBackdrop;
  for (const k in NUM) if (k in saved) s[k] = clamp(k, saved[k]);
  return s;
}
// Shared, read live by actors.js (thresholds) and card.js (context windows).
export const settings = load();
// 2.5D, Backdrop off: no plates round the hall, the transparent window shows the desktop (index.html html.bare).
const applyBackdrop = () => globalThis.document?.documentElement?.classList.toggle('bare', !settings.isoBackdrop);
applyBackdrop();

// Re-applies the saved always-on-top choice to the current window; stripwin.js calls this leaving the
// strip, whose watcher re-asserts topmost every tick regardless of this setting.
export const applyTop = () => tauri()?.window?.getCurrentWindow()?.setAlwaysOnTop(settings.onTop).catch(err => console.warn('setAlwaysOnTop', err));

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
// Night Vigil deadline (adm.vigilDeadline, minutes after midnight, '' = none): the backend reads it when the vigil is armed.

// Monitoring (monitor.rs reads these adm.* strings from settings.json at start and after each save): checkboxes are
// '1' / '0', the numbers are clamped like monitor.rs does, the rest is kept as typed (empty token alert: off).
export const MONITOR = { tokenAlert: '', stuck: '1', stuckToast: '1', stuckMin: '15', stuckRepeat: '5', reportOn: '0', reportDir: '' };
// The numbers as monitor.rs config_from uses them: [default, min, max]. The token alert is a plain integer string (0 or empty: off).
const MON_NUM = { stuckMin: [15, 5, 120], stuckRepeat: [5, 3, 20] };
const monitorNorm = (k, v) => {
  if (k === 'tokenAlert') { const n = Math.floor(Math.min(+v, Number.MAX_SAFE_INTEGER)); return n > 0 ? String(n) : ''; }
  if (!(k in MON_NUM)) return v;
  const [d, lo, hi] = MON_NUM[k], n = Math.round(+v);
  return String(Number.isFinite(n) && v !== '' ? Math.min(hi, Math.max(lo, n)) : d);
};
const monitorGet = k => store.get(`adm.${k}`, MONITOR[k]);

// Custom rooms (adm.rooms, one JSON string; rooms.rs reads it at start and after each save): in force from the start.
// Reset to defaults leaves them alone.
rooms.list = roomsOf(store.get('adm.rooms', '[]'));

// Settings > Rooms: per rule its name, pattern, colour, order and delete, and a live line. A pattern is checked by the
// backend (rooms_test, 200 ms after typing stops): an error turns it red (the message in its title) and is never saved,
// the last valid pattern staying in force; a new rule enters adm.rooms once its pattern first compiles. The live line at
// rest names the departments whose sessions are in the room now; while the pattern is typed, every department it would
// match, "(→ room)" where an earlier rule takes it, "(break-out)" for a temp folder. The remote view: read only, at rest.
// The row inputs have no name: onChange (the form's) only refreshes the panel, never rebuilds the rows.
function initRooms(form, hooks) {
  const box = form.querySelector('.rooms'), add = form.querySelector('.room-add');
  const rows = rooms.list.map(r => ({ ...r, saved: true })); // + drafts, in rule order
  const commit = () => { store.set('adm.rooms', setRooms(rows.filter(r => r.saved).map(({ id, name, pattern, color }) => ({ id, name, pattern, color })))); hooks.roomsChanged?.(); };
  const roster = () => hooks.roster?.() ?? [];
  const nameOf = id => { const r = rooms.list.find(q => q.id === id); return r ? r.name || r.pattern : ''; };
  const list = depts => (depts.length ? depts.join(', ') : 'No session here now');
  const atRest = r => list([...new Set(roster().filter(s => s.room === r.id).map(s => s.dept))]);
  // the raw hits of a pattern being typed: each department once, with where its sessions really go
  const typed = (r, hits, ss) => { // ss: the roster the hits were asked for
    const i = rows.indexOf(r), by = new Map();
    ss.forEach((s, k) => {
      if (!hits[k]) return;
      const j = rows.findIndex(q => q.id === s.room), earlier = j >= 0 && j < i;
      by.set(s.dept, s.temp ? `${s.dept} (break-out)` : earlier ? `${s.dept} (→ ${nameOf(s.room)})` : s.dept);
    });
    return list([...by.values()]);
  };
  // an invalid pattern keeps its red line until fixed; while typing the hits stay
  const live = (r, el) => { if (!r.typing && !r.err) { el.textContent = r.saved ? atRest(r) : 'Not saved: no valid pattern yet'; el.classList.remove('bad'); } };
  let views = [];
  const render = () => {
    views = rows.map((r, i) => {
      const row = document.createElement('div'); row.className = 'room-row'; row.style.setProperty('--room', r.color);
      const input = (type, cls, label, value, max) => {
        const el = document.createElement('input'); el.type = type; el.className = cls; el.value = value; el.setAttribute('aria-label', label);
        if (max) el.setAttribute('maxlength', max);
        if (type === 'text') el.setAttribute('spellcheck', 'false');
        el.disabled = REMOTE; row.appendChild(el); return el;
      };
      const button = (cls, text, label, off) => { const b = document.createElement('button'); b.type = 'button'; b.className = `step ${cls}`; b.textContent = text; b.title = label; b.setAttribute('aria-label', label); b.disabled = REMOTE || off; row.appendChild(b); return b; };
      const name = input('text', 'room-name', 'Room name', r.name, 32), pattern = input('text', 'room-pattern', 'Folder pattern', r.draft ?? r.pattern, 200);
      pattern.placeholder = '**/git/Terra/**';
      const color = input('color', 'room-color', 'Room colour', r.color);
      const up = button('room-up', '↑', 'Move up', i === 0), down = button('room-down', '↓', 'Move down', i === rows.length - 1), del = button('room-del', '✕', 'Delete room');
      const line = document.createElement('p'); line.className = 'room-live'; row.appendChild(line);
      if (r.err) { pattern.classList.add('bad'); pattern.title = r.err; }
      name.addEventListener('input', () => { r.name = name.value.slice(0, 32); if (r.saved) commit(); });
      color.addEventListener('input', () => { r.color = color.value; row.style.setProperty('--room', r.color); if (r.saved) commit(); });
      let timer;
      pattern.addEventListener('input', () => {
        r.draft = pattern.value; r.typing = true; clearTimeout(timer);
        timer = setTimeout(() => {
          const asked = pattern.value;
          const ss = roster(); // the hits answer this roster, not the next tick's
          invoke('rooms_test', { pattern: asked, cwds: ss.map(s => s.cwd) }).then(hits => {
            if (pattern.value !== asked) return; // typed on since
            r.err = null; pattern.classList.remove('bad'); pattern.title = '';
            const fresh = !r.saved || r.pattern !== asked;
            Object.assign(r, { pattern: asked, saved: true });
            if (fresh) commit();
            if (r.typing) { line.textContent = typed(r, hits, ss); line.classList.remove('bad'); }
          }, err => {
            if (pattern.value !== asked) return;
            r.err = String(err); pattern.classList.add('bad'); pattern.title = r.err;
            line.textContent = r.saved ? `Invalid, not saved: the room keeps ${r.pattern}` : 'Invalid, not saved'; line.classList.add('bad');
          });
        }, 200);
      });
      pattern.addEventListener('change', () => { r.typing = false; if (!r.err) live(r, line); });
      up.onclick = () => { rows.splice(i - 1, 0, rows.splice(i, 1)[0]); commit(); render(); };
      down.onclick = () => { rows.splice(i + 1, 0, rows.splice(i, 1)[0]); commit(); render(); };
      del.onclick = () => { rows.splice(i, 1); commit(); render(); };
      live(r, line);
      return { r, line, row };
    });
    box.replaceChildren(...views.map(v => v.row));
    add.disabled = REMOTE || rows.length >= MAX_ROOMS;
  };
  add.onclick = () => {
    if (rows.length >= MAX_ROOMS) return;
    const used = new Set(rows.map(r => r.color.toLowerCase()));
    const color = T.sash.find(c => !used.has(c.toLowerCase())) ?? T.sash[rows.length % T.sash.length];
    let n = Date.now();
    while (rows.some(r => r.id === 'r' + n.toString(36))) n++; // set once; two in the same ms stay apart
    rows.push({ id: 'r' + n.toString(36), name: `Room ${rows.length + 1}`, pattern: '', color, saved: false });
    render();
  };
  render();
  return () => { for (const { r, line } of views) live(r, line); }; // the live lines at rest (sync)
}

// Scale (adm.scale): CSS px per logical px (1-3, the slider), or 'auto' (app.js); read live by viewport.js's fit().
const okScale = v => (v === 'auto' || (+v >= 1 && +v <= 3) ? v : 'auto');
export const view = { scale: okScale(store.get('adm.scale')) };
const setScale = v => { view.scale = okScale(String(v)); store.set('adm.scale', view.scale); };

// The panel's writes: the theme and view pickers, the saved settings, and what the backend is told.
const styles = world => Object.values(THEMES).filter(th => th.world === world); // theme.js + themes.js
const pickTheme = id => { store.set('adm.theme', id); setTheme(id); };
const pickView = mode => {
  if (stripKind(mode) && !viewMode.strip) store.set('adm.hallView', viewMode.mode); // the way back (stripwin.js toggleStrip)
  if (stripKind(mode)) store.set('adm.stripKind', mode); // the tray's strip item goes back to it
  store.set('adm.view', mode); setView(mode);
};
const save = () => store.set('adm.settings', JSON.stringify(settings));
const pushStale = () => invoke('set_stale_minutes', { minutes: settings.staleMin }).catch(() => {});
const pushQuestions = () => invoke('set_question_prefs', { enabled: questions.on, toast: questions.toast }).catch(() => {});
const pushQuiet = () => invoke('set_quiet', { enabled: quiet.on, fromMin: quiet.from, toMin: quiet.to }).catch(() => {});

let sync = () => {};
export const renderSettings = () => sync(); // the header controls changed: refresh the panel's copy

// Remote view (host only): serve on the LAN, allow actions, port, pairing QR (remote_status / remote_set).
function initRemote(form, root, field) {
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
  return { readRemote, applyRemote };
}

// Firewall rule for the remote view's port (firewall_status, read-only; firewall_allow / firewall_remove, elevated: UAC).
// isWin: a getter, the backend's OS arrives after init.
function initFirewall(form, field, isWin) {
  const rv = form.querySelector('#remote');
  const fwLine = rv.querySelector('.rv-fw'), fwPublic = rv.querySelector('.rv-public'), fwBtns = rv.querySelectorAll('.rv-fw-btn');
  const fwPort = () => { const p = +field('remotePort').value; return Number.isInteger(p) && p >= 1024 && p <= 65535 ? p : null; };
  const showFw = st => { fwLine.textContent = st.detail; fwLine.dataset.rule = st.rule; fwPublic.hidden = st.network !== 'public'; };
  const fwErr = err => { fwLine.textContent = String(err); delete fwLine.dataset.rule; };
  let fwBusy = false, fwTimer;
  const readFw = () => {
    const port = fwPort();
    if (fwBusy || !isWin()) return;
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
  return readFw;
}

// Updates (host only): check_update / install_update (main.rs). The startup check only offers; a click installs.
function initUpdates(form, opener) {
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
}

// Categories: a side button shows its section of the form, one at a time.
function initCategories(root, form) {
  const cats = root.querySelectorAll('.cats [data-cat]'), sections = form.querySelectorAll('section[data-cat]');
  for (const b of cats) b.onclick = () => {
    for (const c of cats) if (c === b) c.setAttribute('aria-current', 'page'); else c.removeAttribute('aria-current');
    for (const s of sections) s.hidden = s.dataset.cat !== b.dataset.cat;
  };
}

// The panel's fields from the live values (sync); a field being typed in keeps its text. login: on, off, or null (unknown).
function syncForm(form, field, hooks, login) {
  field('onTop').checked = settings.onTop;
  const auto = view.scale === 'auto';
  field('scaleAuto').checked = auto; field('scale').disabled = auto;
  for (const b of form.querySelectorAll('.step')) b.disabled = auto;
  if (!auto) field('scale').value = view.scale;
  field('scaleOut').value = auto ? 'Auto' : `${view.scale}x`;
  field('mode').value = hooks.mode();
  const world = THEMES[T.id]?.world ?? 'w40k';
  field('world').value = world;
  field('theme').replaceChildren(...styles(world).map(th => new Option(th.name, th.id)));
  field('theme').value = T.id;
  field('view').value = viewName();
  for (const e of form.querySelectorAll('.strip-only')) e.hidden = !viewMode.strip; // the strip's own rows, only while it is on
  for (const e of form.querySelectorAll('.column-only')) e.hidden = !viewMode.column;
  field('stripSize').value = settings.stripSize;
  field('stripSide').value = settings.stripSide;
  field('stripBackdrop').checked = settings.stripBackdrop;
  for (const e of form.querySelectorAll('.iso-only')) e.hidden = viewMode.mode !== '39';
  field('isoBackdrop').checked = settings.isoBackdrop;
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
  const dl = minutes(store.get('adm.vigilDeadline', ''), null);
  if (document.activeElement !== field('vigilDeadline')) field('vigilDeadline').value = dl === null ? '' : hhmmOf(dl);
  field('login').checked = !!login;
  field('login').disabled = login === null;
  field('updateCheck').checked = store.get('adm.updateCheck', '1') !== '0';
  for (const k in MONITOR) {
    const el = field(k);
    if (el.type === 'checkbox') el.checked = monitorGet(k) === '1';
    else if (document.activeElement !== el) el.value = monitorGet(k);
  }
  field('stuckToast').disabled = field('stuckMin').disabled = field('stuckRepeat').disabled = monitorGet('stuck') !== '1';
  field('reportDir').disabled = monitorGet('reportOn') !== '1';
}

// A changed field: store it, apply it, tell the backend, then refresh the panel.
function onChange(e, { field, hooks, setPlace, readLogin, applyRemote }) {
  const el = e.target, k = el.name;
  if (k.startsWith('remote')) { applyRemote(); return; }
  if (k === 'onTop') { settings.onTop = el.checked; save(); applyTop(); }
  else if (k === 'scaleAuto') { setScale(el.checked ? 'auto' : field('scale').value); hooks.rescaled(); }
  else if (k === 'mode') hooks.setMode(el.value);
  else if (k === 'world') pickTheme(styles(el.value)[0].id);
  else if (k === 'theme') pickTheme(el.value);
  else if (k === 'view') pickView(el.value);
  else if (k === 'stripSize') { settings.stripSize = STRIP_SIZES.includes(el.value) ? el.value : 'M'; save(); hooks.rescaled(); }
  else if (k === 'stripSide') { settings.stripSide = SIDES.includes(el.value) ? el.value : 'right'; save(); hooks.sided?.(); }
  else if (k === 'stripBackdrop') { settings.stripBackdrop = el.checked; save(); }
  else if (k === 'isoBackdrop') { settings.isoBackdrop = el.checked; save(); applyBackdrop(); }
  else if (k === 'chime') hooks.setMuted(!el.checked);
  else if (k === 'idleFps' || k === 'pauseHidden') setPerf(field('idleFps').value, field('pauseHidden').checked);
  else if (k === 'questions' || k === 'questionToast') { setQuestions(field('questions').checked, field('questionToast').checked); pushQuestions(); }
  else if (k === 'quietOn' || k === 'quietFrom' || k === 'quietTo') {
    setQuiet(field('quietOn').checked, minutesOf(field('quietFrom').value) ?? quiet.from, minutesOf(field('quietTo').value) ?? quiet.to);
    pushQuiet(); hooks.quieted?.();
  }
  else if (k === 'vigilDeadline') store.set('adm.vigilDeadline', String(minutesOf(el.value) ?? '')); // read by the backend at arm time
  else if (k === 'openWith' || k === 'openCmd') store.set(`adm.${k}`, el.value);
  else if (k === 'login') { el.disabled = true; readLogin(el.checked); return; }
  else if (k === 'updateCheck') store.set('adm.updateCheck', el.checked ? '1' : '0');
  else if (k in MONITOR) {
    store.set(`adm.${k}`, el.type === 'checkbox' ? (el.checked ? '1' : '0') : monitorNorm(k, el.value.trim()));
    if (el.type !== 'checkbox') el.value = monitorGet(k); // show what is used, even while focused
  }
  else if (k in RANGE) { setPlace(coord('lat', field('lat').value), coord('lon', field('lon').value)); el.value = Number.isNaN(place[k]) ? '' : place[k]; }
  else if (k in NUM) { settings[k] = clamp(k, el.value); el.value = settings[k]; save(); if (k === 'staleMin') pushStale(); }
  sync();
}

// Reset: every setting back to its default, the backend told, the panel refreshed.
function resetAll(hooks, setPlace) {
  Object.assign(settings, DEFAULTS);
  setPlace(NaN, NaN);
  setPerf(12, true);
  setQuestions(true, true);
  setQuiet(false, 1320, 480);
  store.set('adm.openWith', 'explorer');
  store.set('adm.updateCheck', '1');
  store.set('adm.vigilDeadline', '');
  for (const k in MONITOR) store.set(`adm.${k}`, MONITOR[k]);
  setScale('auto'); hooks.rescaled();
  save(); applyTop(); pushStale(); pushQuestions(); pushQuiet();
  hooks.setMode('auto'); hooks.setMuted(false);
  pickTheme('tier2');
  pickView('flat');
  sync();
  hooks.quieted?.();
}

// hooks: { mode(), setMode(m), muted(), setMuted(b), placed(), rescaled(), quieted(), sided(), roster(), roomsChanged() } from app.js.
export function initSettings(hooks) {
  const root = document.getElementById('prefs'), form = root.querySelector('form'), opener = document.getElementById('prefs-open');
  const field = name => form.elements[name];
  field('world').replaceChildren(...Object.entries(WORLDS).map(([id, name]) => new Option(name, id)));
  let login = null;
  let isWin = true; // the backend's OS (platform): the firewall rule and the desktop icon are Windows-only
  if (REMOTE) {
    // The PC's settings, read only; window, login, remote view and reset belong to the PC.
    for (const f of form.querySelectorAll('[data-host]')) f.disabled = true;
    for (const e of form.querySelectorAll('.host-only')) e.hidden = true;
    form.querySelector('.remote-only').hidden = false;
  } else {
    applyTop(); // tauri.conf.json starts on top; restore the saved choice
    pushStale(); pushQuestions(); pushQuiet();
    // Desktop strip and column: offered only where the backend can place them (Windows, macOS). Removed elsewhere, not
    // left hidden: WebKitGTK's list (Linux) shows a hidden option.
    const strips = ['strip', 'vstrip'].map(v => form.querySelector(`[value="${v}"]`));
    invoke('strip_supported').then(ok => { for (const o of strips) if (ok) o.hidden = false; else o.remove(); }, () => { for (const o of strips) o.remove(); });
    // Always on top: not under Wayland, where only the compositor stacks windows (a Hyprland rule, README).
    invoke('on_top_supported').then(ok => { if (!ok) field('onTop').closest('label').hidden = true; }, () => {});
    invoke('platform').then(os => {
      isWin = os === 'windows';
      if (isWin) return;
      for (const e of form.querySelectorAll('.win-only')) e.hidden = true;
      if (os === 'macos') form.querySelector('[name="openWith"] [value="explorer"]').textContent = 'Finder';
      field('openCmd').placeholder = '/path/to/app {path}';
    }, () => {});
  }

  const syncRooms = initRooms(form, hooks);
  setInterval(syncRooms, 2000); // the live lines follow the roster
  sync = () => { syncForm(form, field, hooks, login); syncRooms(); };
  const readLogin = (enable) => invoke('start_at_login', enable === undefined ? {} : { enable })
    .then(on => { login = on; }, () => { login = null; }).finally(sync);
  listen('autostart', e => { login = e.payload; sync(); });

  const { readRemote, applyRemote } = initRemote(form, root, field);
  const readFw = initFirewall(form, field, () => isWin);

  initUpdates(form, opener);

  const setPlace = (lat, lon) => {
    Object.assign(place, { lat, lon });
    for (const k in RANGE) store.set(`adm.${k}`, Number.isNaN(place[k]) ? '' : String(place[k]));
    hooks.placed();
  };
  form.onsubmit = e => e.preventDefault();
  // The slider rescales while it is dragged, not only on release (9 steps: at most 9 relayouts per drag).
  form.oninput = e => { if (e.target.name === 'scale') { setScale(e.target.value); hooks.rescaled(); sync(); } };
  // − / + beside it: one step per click, for where dragging the slider fails (the macOS app's window).
  for (const b of form.querySelectorAll('.step')) b.onclick = () => {
    const s = field('scale'); s.value = Math.min(+s.max, Math.max(+s.min, +s.value + b.dataset.step * s.step));
    setScale(s.value); hooks.rescaled(); sync();
  };
  form.onchange = e => onChange(e, { field, hooks, setPlace, readLogin, applyRemote });
  initCategories(root, form);
  const desk = form.querySelector('.desk-icon');
  desk.onclick = () => invoke('desktop_shortcut').then(() => { desk.textContent = 'Desktop icon added'; }, err => { desk.textContent = String(err); });
  form.querySelector('.clear').onclick = () => { setPlace(NaN, NaN); sync(); };
  form.querySelector('.reset').onclick = () => resetAll(hooks, setPlace);

  onView(() => sync()); // the tray or the handle switched the view under an open panel
  panel(root, [opener], { onOpen: () => { if (!REMOTE) { readLogin(); readRemote().then(readFw); } sync(); } }); // readLogin: the tray may have changed it
}
