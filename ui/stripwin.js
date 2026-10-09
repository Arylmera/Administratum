// The desktop strip's window: on/off the taskbar, its height, click-through, the handle's menu.
import { STRIP_H } from './strip.js';
import { settings, store, applyTop } from './settings.js';
import { view as viewMode, setView } from './view.js';
import { invoke, tauri } from './bridge.js';

const strip = () => viewMode.strip;
export const stripScale = () => ({ S: 1.5, M: 2, L: 2.5 })[settings.stripSize] ?? 2;
const stripCss = () => Math.round(STRIP_H * stripScale()); // the strip's CSS height
let actorAt; // app.js's hit test on the cast (initStripWin)
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
  invoke('set_click_through', { on }).catch(() => { through = null; });
}
// Into the strip: the window moves onto the taskbar (place_strip returns the hall's rect the first time, kept for the
// way back in adm.hallRect). Out: the hall's rect back (place_hall turns click-through off). The tray check follows.
let grownTo = 0; // the window's last asked CSS height in the strip (growStrip)
let bootStrip; // started in the strip: the window's rect is the last session's strip, not a hall (initStripWin)
// Every move onto the taskbar goes through here: the first one out of the hall returns the hall's rect, whoever calls.
async function placeStrip(height) {
  const r = await invoke('place_strip', { height });
  if (r && !bootStrip) store.set('adm.hallRect', JSON.stringify(r));
  bootStrip = false;
  return r;
}
async function enterStrip() {
  grownTo = stripCss();
  await placeStrip(grownTo);
  if (!strip()) return; // a leave was queued behind this enter: let it undo the move instead
  setThrough(true);
  invoke('set_strip_menu', { on: true }).catch(() => {});
  growStrip();
}
async function leaveStrip() {
  through = null; grownTo = 0;
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
export function growStrip() {
  if (!strip() || !tauri()) return;
  const open = [...document.querySelectorAll('#card, #prefs, #chron, #strip-menu')].filter(el => el.offsetParent);
  const h = stripCss() + Math.max(0, ...open.map(el => el.offsetHeight + 8));
  if (h !== grownTo) { grownTo = h; placeStrip(h).catch(() => {}); }
}
// Strip <-> hall (the tray's check item, the handle's Hall view): back to the hall view it left (adm.hallView).
export function toggleStrip() {
  const to = viewMode.strip ? store.get('adm.hallView', 'flat') : 'strip';
  if (to === 'strip') store.set('adm.hallView', viewMode.mode);
  store.set('adm.view', to); setView(to);
}
// The handle: a cog at the strip's left end (over the gate) opening a small menu above it.
let stripMenu, stripHandle;
export const showMenu = on => { stripMenu.hidden = !on; stripHandle.setAttribute('aria-expanded', String(on)); };
export function initStripWin({ actorAt: hit, fromStrip, toggleVigil }) {
  actorAt = hit;
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
