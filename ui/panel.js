// What Tab can reach inside `root`: buttons, links and fields that are enabled and shown (no hidden ancestor up to root), and
// not a roving tab left out of the tab order (tabindex -1).
const FOCUSABLE = 'button, a, input, select, textarea, summary, [tabindex]';
const shown = (e, root) => { for (; e && e !== root; e = e.parent ?? e.parentNode) if (e.hidden) return false; return true; };
export function focusables(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter(e => !e.disabled && e.getAttribute('tabindex') !== '-1' && !e.closest('fieldset[disabled]') && shown(e, root) && (e.localName !== 'a' || e.hasAttribute('href')));
}

// A list of tabs (role="tablist"): Left / Right (and Up / Down) move to the next / previous tab, Home / End to the first /
// last, wrapping; the tab in focus is the one in the tab order (roving tabindex). activate: the move also selects (a click),
// else Enter or Space selects. Tabs are looked up on each key, so a list rebuilt later (the Chronicon's days) still works.
export function tablist(list, { activate = false } = {}) {
  const tabs = () => [...list.querySelectorAll('[role="tab"]')].filter(b => !b.hidden && !b.disabled);
  const rove = on => { for (const b of list.querySelectorAll('[role="tab"]')) b.setAttribute('tabindex', b === on ? '0' : '-1'); };
  list.addEventListener('keydown', e => {
    const all = tabs(), at = all.indexOf(e.target.closest?.('[role="tab"]') ?? e.target);
    if (at < 0) return;
    const to = { ArrowRight: at + 1, ArrowDown: at + 1, ArrowLeft: at - 1, ArrowUp: at - 1, Home: 0, End: all.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const next = all[(to + all.length) % all.length];
    rove(next);
    next.focus({ preventScroll: true });
    if (activate) next.click();
  });
  return { rove };
}

// A parchment panel (Chronicon, Settings): its openers toggle it, it unrolls (the .open transition), and it closes on its
// X, Escape or a click outside (a click on the scene then only closes, it does not also pick a scribe). Closing by X or
// Escape gives focus back to the opener that opened it. While open, Tab and Shift+Tab cycle inside it (the dialogs are
// aria-modal). onOpen: render on open; onClosed: after the roll-up.
export function panel(root, openers, { onOpen, onClosed } = {}) {
  let closer = null, from = openers[0];
  const isOpen = () => !root.hidden;
  const expanded = v => { for (const o of openers) o.setAttribute('aria-expanded', String(v)); };
  function open(by = openers[0]) {
    clearTimeout(closer);
    from = by;
    root.hidden = false;
    void root.offsetHeight; // commit the rolled-up state so the unroll transitions
    root.classList.add('open');
    expanded(true);
    root.querySelector('.close').focus({ preventScroll: true });
    onOpen?.();
  }
  function close(refocus = false) {
    if (!isOpen()) return;
    root.classList.remove('open');
    expanded(false);
    if (refocus || root.contains(document.activeElement)) from.focus({ preventScroll: true });
    clearTimeout(closer);
    closer = setTimeout(() => { root.hidden = true; onClosed?.(); }, 300);
  }
  for (const o of openers) o.onclick = () => (root.classList.contains('open') ? close() : open(o));
  root.querySelector('.close').onclick = () => close(true);
  root.addEventListener('keydown', e => {
    if (e.key !== 'Tab' || !isOpen()) return;
    const f = focusables(root), at = f.indexOf(document.activeElement);
    if (!f.length) { e.preventDefault(); return; }
    if (e.shiftKey ? at <= 0 : at < 0 || at === f.length - 1) { e.preventDefault(); f[e.shiftKey ? f.length - 1 : 0].focus({ preventScroll: true }); }
  });
  addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) close(true); });
  addEventListener('click', e => {
    if (!root.classList.contains('open') || root.contains(e.target) || openers.some(o => o.contains(e.target))) return;
    close();
    if (e.target.closest('#scene, #overlay')) e.stopPropagation();
  }, true);
  return { isOpen };
}
