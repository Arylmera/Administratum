import assert from 'node:assert/strict';
import { install, tick } from './testdom.mjs';

// A small page with one parchment panel: a close button, a tab list (one tab in the tab order), fields that Tab must skip
// (disabled, in a hidden section, in a disabled fieldset) and a last button. A second tab list sits outside the panel.
const html = `<html><body><main>
<button id="open">Open</button><button id="other">Other</button>
<div id="auto" role="tablist"><button role="tab" id="u1">1</button><button role="tab" id="u2">2</button></div>
<div id="p" class="panel" role="dialog" aria-modal="true" hidden>
  <button type="button" class="close">x</button>
  <div class="tabs" role="tablist"><button role="tab" tabindex="0" id="t1">1</button><button role="tab" tabindex="-1" id="t2">2</button><button role="tab" tabindex="-1" id="t3">3</button></div>
  <input id="field"><input id="off" disabled><section hidden><input id="gone"></section><fieldset disabled><input id="locked"></fieldset>
  <button id="last" type="button">z</button>
</div></main></body></html>`;
const { windowListeners } = install(html);
const { panel, tablist, focusables } = await import('./panel.js');
const $ = id => document.getElementById(id);
const root = $('p'), opener = $('open'), other = $('other');
const key = (el, k, extra = {}) => { const seen = {}; el.dispatch('keydown', { key: k, preventDefault() { seen.prevented = true; }, ...extra }); return seen; };
const esc = () => { for (const f of windowListeners.keydown ?? []) f({ key: 'Escape' }); };

panel(root, [opener, other]);
assert.equal(root.getAttribute('aria-modal'), 'true');

// Open: the panel unrolls and focus goes to its close button.
opener.click();
assert.equal(root.hidden, false);
assert.ok(root.classList.contains('open'));
assert.equal(document.activeElement, root.querySelector('.close'));

// What Tab can reach: no disabled field, nothing in a hidden section or a disabled fieldset, only the tab in the tab order.
assert.deepEqual(focusables(root).map(e => e.id || e.className), ['close', 't1', 'field', 'last']);

// Tab on the last stop wraps to the first; Shift+Tab on the first wraps to the last; in between the browser moves it.
$('last').focus();
assert.equal(key($('last'), 'Tab').prevented, true);
assert.equal(document.activeElement, root.querySelector('.close'), 'Tab from the last goes to the first');
assert.equal(key(root.querySelector('.close'), 'Tab', { shiftKey: true }).prevented, true);
assert.equal(document.activeElement, $('last'), 'Shift+Tab from the first goes to the last');
$('t1').focus();
assert.equal(key($('t1'), 'Tab').prevented, undefined, 'in the middle: left to the browser');
assert.equal(key($('t1'), 'Tab', { shiftKey: true }).prevented, undefined);
// Focus that is somewhere unknown (not a stop) is brought back in.
$('t2').focus();
assert.equal(key($('t2'), 'Tab').prevented, true);
assert.equal(document.activeElement, root.querySelector('.close'));
// Other keys are left alone.
assert.equal(key($('field'), 'a').prevented, undefined);

// Esc closes and gives focus back to the element that opened it (the second opener here, not always the first).
$('field').focus();
esc();
assert.ok(!root.classList.contains('open'), 'Esc closes');
assert.equal(document.activeElement, opener);
tick(300);
assert.equal(root.hidden, true);
other.click();
assert.equal(document.activeElement, root.querySelector('.close'));
esc();
assert.equal(document.activeElement, other, 'focus returns to the opener that opened it');
tick(300);
// Closed: Tab is not trapped and Esc does nothing.
const before = document.activeElement;
assert.equal(key($('last'), 'Tab').prevented, undefined);
esc();
assert.equal(document.activeElement, before);

// The close button gives focus back too.
opener.click();
root.querySelector('.close').click();
assert.equal(document.activeElement, opener);
tick(300);

// A tab list: the arrow keys move the focus with wrap, Home and End jump, one tab stays in the tab order; Up and Down too
// (a vertical list); other keys are left alone; a hidden tab is skipped.
{
  const list = root.querySelector('.tabs'), tabs = list.querySelectorAll('[role="tab"]');
  const { rove } = tablist(list);
  const stops = () => tabs.map(b => b.getAttribute('tabindex'));
  assert.equal(key($('t1'), 'ArrowRight').prevented, true);
  assert.equal(document.activeElement, $('t2'));
  assert.deepEqual(stops(), ['-1', '0', '-1']);
  key($('t2'), 'ArrowRight'); key($('t3'), 'ArrowRight');
  assert.equal(document.activeElement, $('t1'), 'wraps forward');
  key($('t1'), 'ArrowLeft');
  assert.equal(document.activeElement, $('t3'), 'wraps back');
  key($('t3'), 'Home');
  assert.equal(document.activeElement, $('t1'));
  key($('t1'), 'End');
  assert.equal(document.activeElement, $('t3'));
  key($('t3'), 'ArrowUp');
  assert.equal(document.activeElement, $('t2'));
  key($('t2'), 'ArrowDown');
  assert.equal(document.activeElement, $('t3'));
  assert.equal(key($('t3'), 'x').prevented, undefined);
  tabs[0].setAttribute('hidden', '');
  key($('t3'), 'End'); key($('t3'), 'Home');
  assert.equal(document.activeElement, $('t2'), 'a hidden tab is skipped');
  tabs[0].removeAttribute('hidden');
  rove($('t1'));
  assert.deepEqual(stops(), ['0', '-1', '-1']);
}
// activate: the move also picks (a click on the new tab); without it, nothing is clicked.
{
  const clicked = [];
  for (const b of $('auto').querySelectorAll('[role="tab"]')) b.onclick = () => clicked.push(b.id);
  tablist($('auto'), { activate: true });
  key($('u1'), 'ArrowRight');
  assert.deepEqual(clicked, ['u2']);
  assert.equal(document.activeElement, $('u2'));
  const plain = [];
  for (const b of root.querySelectorAll('.tabs [role="tab"]')) b.onclick = () => plain.push(b.id);
  key($('t1'), 'ArrowRight');
  assert.deepEqual(plain, [], 'the plain list only moves the focus');
}
console.log('panel ok');
