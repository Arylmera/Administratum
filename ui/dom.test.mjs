import assert from 'node:assert/strict';

// A bare document: only what el() may touch, so a property it sets without being asked would show.
const made = [];
globalThis.document = { createElement: tag => { const e = { tag }; made.push(e); return e; } };
const { el } = await import('./dom.js');

assert.deepEqual(el('div'), { tag: 'div' }, 'no class, no text: nothing set');
assert.deepEqual(el('p', 'quiet', 'Nothing'), { tag: 'p', className: 'quiet', textContent: 'Nothing' });
assert.deepEqual(el('span', null, 'x'), { tag: 'span', textContent: 'x' }, 'a null class is not written');
assert.deepEqual(el('span', '', 'x'), { tag: 'span', textContent: 'x' }, 'an empty class is not written');
assert.deepEqual(el('i', 'a b'), { tag: 'i', className: 'a b' });
assert.deepEqual(el('b', 'n', 0), { tag: 'b', className: 'n', textContent: 0 }, '0 is text');
assert.deepEqual(el('b', 'n', ''), { tag: 'b', className: 'n', textContent: '' }, "'' is text");
assert.deepEqual(el('b', 'n', null), { tag: 'b', className: 'n' }, 'null text is none');
assert.deepEqual(el('b', 'n', undefined), { tag: 'b', className: 'n' }, 'undefined text is none');
assert.equal(made.length, 9, 'one element per call');
console.log('dom ok');
