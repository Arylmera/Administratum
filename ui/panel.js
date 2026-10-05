// A parchment panel (Chronicon, Settings): its openers toggle it, it unrolls (the .open transition), and it closes on its
// X, Escape or a click outside (a click on the scene then only closes, it does not also pick a scribe). Closing by X or
// Escape gives focus back to the opener that opened it. onOpen: render on open; onClosed: after the roll-up.
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
  addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) close(true); });
  addEventListener('click', e => {
    if (!root.classList.contains('open') || root.contains(e.target) || openers.some(o => o.contains(e.target))) return;
    close();
    if (e.target.closest('#scene, #overlay')) e.stopPropagation();
  }, true);
  return { isOpen };
}
