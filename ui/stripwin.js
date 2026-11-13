// The desktop strip's window: on/off the taskbar (or the desktop column on a screen edge), its size, click-through,
// the handle's menu.
import { STRIP_H } from './strip.js';
import { COL_W, columnScale } from './column.js';
import { settings, store, applyTop } from './settings.js';
import { view as viewMode, setView } from './view.js';
import { invoke, tauri } from './bridge.js';

const strip = () => viewMode.strip;
export const stripScale = () => ({ S: 1.5, M: 2, L: 2.5 })[settings.stripSize] ?? 2;
const stripCss = () => Math.round(STRIP_H * stripScale()); // the strip's CSS height
// The height the column has, CSS px: the work area's. On Linux the strip is a window of its own (label strip, a
// layer surface the compositor sizes), already that tall, and the screen's numbers there are not CSS px: its own.
const ownWindow = () => tauri()?.window?.getCurrentWindow?.().label === 'strip';
export const colHeight = () => (ownWindow() ? innerHeight : screen.availHeight);
// The column's scale: the Strip size's, smaller on a short work area (column.js columnScale); its CSS width.
export const colScale = () => columnScale(colHeight(), stripScale());
const colCss = () => Math.round(COL_W * colScale());
const baseCss = () => (viewMode.column ? colCss() : stripCss());
let actorAt, actorRects; // app.js's hit test on the cast and the cast's rects (initStripWin)
// Desktop strip: the window ignores the cursor except over a hit target; the backend reports the cursor while it
// is over the strip (it gets no pointer events while ignoring them).
let through = null;
const HIT = '.lbl, .plaque, #card, #prefs, #chron, #strip-handle, #strip-menu';
export function stripHit(x, y) {
  const el = document.elementFromPoint(x, y);
  return !!el?.closest(HIT) || !!actorAt({ clientX: x, clientY: y });
}
export function setThrough(on) {
  if (on === through) return;
  through = on;
  invoke('set_click_through', { on }).then(byRects => { if (byRects) watchHits(); }, () => { through = null; });
}
// Linux (Wayland): nobody tells the window where the cursor is outside it, so no strip-cursor comes. The window is
// told instead which places take clicks (the hit targets' rects and the cast's), every 200 ms while they change.
let hitsTimer = 0, hitsSent = '';
function watchHits() {
  if (hitsTimer) return;
  hitsSent = '';
  hitsTimer = setInterval(() => {
    if (!strip()) { clearInterval(hitsTimer); hitsTimer = 0; return; }
    const rects = [...document.querySelectorAll(HIT)].filter(el => el.offsetParent || el.getClientRects().length)
      .map(el => el.getBoundingClientRect()).map(r => [r.left, r.top, r.right, r.bottom]).concat(actorRects())
      .map(r => r.map(Math.round));
    const key = JSON.stringify(rects);
    if (key !== hitsSent) { hitsSent = key; invoke('set_strip_hits', { rects }).catch(() => { hitsSent = ''; }); }
  }, 200);
}
// Into the strip: the window moves onto the taskbar (place_strip returns the hall's rect the first time, kept for the
// way back in adm.hallRect). Out: the hall's rect back (place_hall turns click-through off). The tray check follows.
let grownTo = ''; // the window's last asked shape and CSS size in the strip (growStrip)
let bootStrip; // started in the strip: the window's rect is the last session's strip, not a hall (initStripWin)
// Every move onto the taskbar goes through here: the first one out of the hall returns the hall's rect, whoever calls.
// The column: its CSS width on its side (place_column); the bar: its CSS height (place_strip). Between the two the
// window stays the strip's (the backend's ON): no hall rect comes back, adm.hallRect keeps the hall's.
async function placeStrip(css) {
  const r = await invoke(viewMode.column ? 'place_column' : 'place_strip', viewMode.column ? { width: css, side: settings.stripSide } : { height: css });
  if (r && !bootStrip) store.set('adm.hallRect', JSON.stringify(r));
  bootStrip = false;
  return r;
}
async function enterStrip() {
  grownTo = shapeKey(baseCss());
  await placeStrip(baseCss());
  if (!strip()) return; // a leave was queued behind this enter: let it undo the move instead
  setThrough(true);
  invoke('set_strip_menu', { on: true }).catch(() => {});
  growStrip();
}
async function leaveStrip() {
  through = null; grownTo = '';
  const r = store.get('adm.hallRect');
  await invoke('place_hall', { rect: r ? JSON.parse(r) : null });
  applyTop(); // the strip's watcher re-asserts topmost every tick regardless of the user's setting
  if (strip()) return; // a newer enter is queued behind this leave: let it redo the move instead
  invoke('set_strip_menu', { on: false }).catch(() => {});
}
// Enter/leave touch the OS window and a shared backend rect: serialised through one chain so a quick switch back
// and forth can't let a leave read a stale/missing hallRect mid-enter, or land its set_strip_menu after a newer enter's.
let switching = Promise.resolve();
export function switchStrip(on) {
  switching = switching.then(() => (on ? enterStrip() : leaveStrip())).catch(err => console.warn('strip switch', err));
}
// The strip's window grows upward while a panel (card, Settings, Chronicon, the handle's menu) is open above it, and
// shrinks back when they close; the stage stays pinned to the bottom (index.html). Also replays a Strip size change.
// The column grows sideways instead (beside the panel), its height the work area's.
// The key holds the kind and the column's side, so a side change re-places the window even with a panel open.
const shapeKey = css => `${viewMode.column ? settings.stripSide : 'bar'}:${css}`;
export function growStrip() {
  if (!strip() || !tauri()) return;
  // the column's handle menu opens inside it (index.html), so only the panels widen it
  const open = [...document.querySelectorAll(viewMode.column ? '#card, #prefs, #chron' : '#card, #prefs, #chron, #strip-menu')].filter(el => el.offsetParent);
  const css = baseCss() + Math.max(0, ...open.map(el => (viewMode.column ? el.offsetWidth : el.offsetHeight) + 8));
  if (shapeKey(css) !== grownTo) { grownTo = shapeKey(css); placeStrip(css).catch(() => {}); }
}
// The column's classes (index.html html.vstrip, html.right): on its entry, its exit and a side change.
export function applyColumn() {
  const r = document.documentElement.classList;
  r.toggle('vstrip', viewMode.column); r.toggle('right', viewMode.column && settings.stripSide === 'right');
}
// Strip <-> hall (the tray's check item, the handle's Hall view): back to the hall view it left (adm.hallView), or into
// the strip kind last used (adm.stripKind: the bar or the column, one tray item for both).
export function toggleStrip() {
  const to = viewMode.strip ? store.get('adm.hallView', 'flat') : store.get('adm.stripKind', 'strip') === 'vstrip' ? 'vstrip' : 'strip';
  if (!viewMode.strip) store.set('adm.hallView', viewMode.mode);
  store.set('adm.view', to); setView(to);
}
// The handle: a cog at the strip's left end (over the gate) opening a small menu above it.
let stripMenu, stripHandle;
export const showMenu = on => { stripMenu.hidden = !on; stripHandle.setAttribute('aria-expanded', String(on)); };
export function initStripWin({ actorAt: hit, actorRects: rects, fromStrip, toggleVigil }) {
  actorAt = hit; actorRects = rects;
  bootStrip = fromStrip;
  const panels = document.querySelectorAll('#card, #prefs, #chron, #strip-menu');
  const ro = new ResizeObserver(growStrip), mo = new MutationObserver(growStrip);
  for (const el of panels) { ro.observe(el); mo.observe(el, { attributes: true, attributeFilter: ['hidden', 'class'] }); }
  stripMenu = document.getElementById('strip-menu'); stripHandle = document.getElementById('strip-handle');
  stripHandle.onclick = () => showMenu(stripMenu.hidden);
  stripMenu.onclick = e => {
    const act = e.target.closest('button')?.dataset.act;
    if (!act) return;
    showMenu(false);
    if (act === 'hall') toggleStrip();
    else if (act === 'vigil') toggleVigil();
    else document.getElementById(act).click(); // the header's own buttons (hidden in the strip): prefs-open, chron-open, hide
  };
  addEventListener('click', e => { if (!e.target.closest('#strip-menu, #strip-handle')) showMenu(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape') showMenu(false); });
  if (!tauri()) stripMenu.querySelector('[data-act="hide"]').remove(); // no window to hide in a browser
}
