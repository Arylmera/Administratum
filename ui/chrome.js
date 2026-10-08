// The page's chrome follows the theme: CSS colours, marked texts, toast wording, the riveted backdrop.
import { T, t } from './theme.js';
import { invoke, REMOTE } from './bridge.js';

// The page follows the theme: its chrome colours (CSS variables, T.ui), its marked texts (data-t, data-t-title,
// data-t-aria), and the wording of the PC's toasts (main.rs set_toast_text).
let chromeSet = [];
export function applyChrome() {
  const root = document.documentElement.style;
  for (const k of chromeSet) root.removeProperty(k);
  chromeSet = Object.keys(T.ui);
  for (const [k, v] of Object.entries(T.ui)) root.setProperty(k, v);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bar').trim());
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  for (const el of document.querySelectorAll('[data-t-title]')) el.title = t(el.dataset.tTitle);
  for (const el of document.querySelectorAll('[data-t-aria]')) el.setAttribute('aria-label', t(el.dataset.tAria));
  document.title = t('title');
  if (!REMOTE) invoke('set_toast_text', { petition: t('toast.petition'), question: t('toast.question'), stale: t('toast.stale'), needed: t('toast.needed'),
    limit: t('toast.limit'), limitMany: t('toast.limitMany'), failed: t('toast.failed') }).catch(() => {});
}

// Riveted iron plates behind the scene instead of plain black (40x40 art px tile), redrawn per theme.
export function backdrop() {
  const c = document.createElement('canvas'); c.width = c.height = 40;
  const t = c.getContext('2d'), r = (x, y, w, h, col) => { t.fillStyle = col; t.fillRect(x, y, w, h); }, I = T.ink;
  r(0, 0, 40, 40, I.backdrop); r(0, 0, 40, 1, I.backdropLit); r(0, 0, 1, 40, I.backdropEdge);
  r(0, 39, 40, 1, I.backdropDark); r(39, 0, 1, 40, I.backdropDark); r(1, 19, 38, 1, I.backdropSeam); r(1, 20, 38, 1, I.backdropSeamLit);
  for (const [x, y] of [[3, 3], [35, 3], [3, 35], [35, 35], [3, 16], [35, 16], [3, 23], [35, 23]]) { r(x, y, 2, 2, I.backdropRivet); r(x, y, 1, 1, I.backdropRivetLit); }
  document.body.style.backgroundImage = `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,.65)), url(${c.toDataURL()})`;
}
