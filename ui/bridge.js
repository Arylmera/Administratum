// The one door to the backend. Inside the app: window.__TAURI__. In a browser on the LAN (the remote view,
// window.ADM_REMOTE from /remote.js, docs/remote-api.md): the same invoke/listen over HTTP and one shared
// EventSource. Callers keep Tauri's shapes: invoke resolves the result or rejects with the error string,
// listen callbacks get { payload }.
export const REMOTE = globalThis.ADM_REMOTE === true;
export const tauri = () => (REMOTE ? undefined : globalThis.__TAURI__);

const GETS = new Set(['chronicle_day', 'tithe_day', 'chronicle_days', 'settings_load', 'peek_petition']);
const notPaired = r => { if (r.status === 401) location.reload(); return r; }; // the reload shows "scan the QR code"
async function reply(r) {
  const text = await r.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* plain text error */ }
  if (r.ok) return body;
  throw body?.error ?? (text || `HTTP ${r.status}`);
}
const post = (name, args) => fetch(`/api/${name}`, {
  method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Adm': '1' }, body: JSON.stringify(args),
}).then(notPaired);

export function invoke(name, args = {}) {
  if (!REMOTE) return tauri()?.core?.invoke(name, args) ?? Promise.reject('no backend');
  if (GETS.has(name)) return fetch(`/api/${name}?${new URLSearchParams(args)}`, { credentials: 'same-origin' }).then(notPaired).then(reply);
  if (name === 'answer_petition') return post(name, args).then(r => (r.status === 403 ? Promise.reject('remote actions disabled') : reply(r)));
  if (name === 'vigil_arm' || name === 'vigil_cancel') return post('vigil', { arm: name === 'vigil_arm' }).then(r => (r.status === 403 ? Promise.reject('remote actions disabled') : reply(r)));
  return Promise.reject(`${name} is not available remotely`);
}

// Remote only: are actions allowed on the PC? The server checks that gate first (403), and an empty body
// fails validation (400) before any action is taken, so this probe answers without acting.
export const remoteActions = () => post('answer_petition', {}).then(r => r.status !== 403, () => false);

const handlers = {}; // event -> Set of callbacks
let es = null, started = false, wait = 1000, badge = null;
function linkDown(down) {
  if (down && !badge) {
    badge = document.createElement('span');
    badge.className = 'count link'; badge.textContent = 'reconnecting…'; badge.setAttribute('role', 'status');
    document.querySelector('header .grow')?.after(badge);
  } else if (!down && badge) { badge.remove(); badge = null; }
}
function connect() {
  es = new EventSource('/events');
  for (const name in handlers) attach(name);
  es.onopen = () => { wait = 1000; linkDown(false); };
  es.onerror = () => {
    linkDown(true);
    if (es.readyState !== EventSource.CLOSED) return; // the browser retries on its own (retry: 3000)
    // Refused (401 after a new token, 503 too many streams, server off): back off, check pairing, open again.
    es = null;
    setTimeout(() => fetch('/api/chronicle_days', { credentials: 'same-origin' }).then(notPaired).catch(() => {}).finally(connect), wait);
    wait = Math.min(30_000, wait * 2);
  };
}
function attach(name) {
  es.addEventListener(name, e => { let p; try { p = JSON.parse(e.data); } catch { return; } for (const cb of handlers[name]) cb({ payload: p }); });
}

export function listen(name, cb) {
  if (!REMOTE) return tauri()?.event?.listen(name, cb) ?? Promise.resolve(() => {});
  if (!handlers[name]) { handlers[name] = new Set(); if (es) attach(name); }
  handlers[name].add(cb);
  if (!started) { started = true; connect(); }
  return Promise.resolve(() => handlers[name].delete(cb));
}
