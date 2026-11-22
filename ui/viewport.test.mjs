import assert from 'node:assert/strict';
import { install } from './testdom.mjs';

// The 39° view at Auto scale (viewport.js fit): it shrinks to fit a big hall but never below the flat Auto scale; past that it pans.
install();
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });
const V = await import('./viewport.js'), { initViewport, fit, pannable, pan, centreOn, stepPan } = V; // live bindings: read scale, viewW, viewH off V
const { SCENE } = await import('./layout.js');

const doc = document.documentElement, header = document.querySelector('header');
let win = { w: 700, h: 500 };
doc.getBoundingClientRect = () => ({ width: win.w, height: win.h });
header.getBoundingClientRect = () => ({ bottom: 40 });
let S = { ...SCENE }, isoOn = true;
initViewport({ canvas: document.createElement('canvas'), overlay: document.createElement('div'), scene: () => S, iso: () => isoOn, strip: () => false,
  at: () => [0, 0], relayout: () => {}, setMouse: () => {} });

// Flat reference: the scale the flat Auto view uses for this window.
isoOn = false; S = { w: 300, h: 200 }; fit();
const flat = V.scale;
assert.ok(flat > 1 && flat < 3, 'flat auto scale is the original look');

// A hall that fits the window: the 39° scale is the flat one, nothing pans, as before.
isoOn = true; fit();
assert.equal(V.scale, flat, 'a hall that fits keeps the flat auto scale');
assert.ok(!pannable(), 'and does not pan');

// A hall a little too big for the window is no longer shrunk to fit: it keeps the flat scale and pans.
S = { w: (win.w - 24) / flat * 1.2, h: 200 }; fit();
assert.equal(V.scale, flat, 'an oversize hall keeps the flat auto scale');
assert.ok(pannable(), 'and pans');

// A hall far too big: the scale stops at the flat auto scale (readable pixels) and the stage pans.
S = { w: 2000, h: 2000 }; fit();
assert.equal(V.scale, flat, 'never below the flat auto scale');
assert.ok(pannable(), 'a big hall pans');
assert.ok(V.viewW <= win.w - 24 && V.viewH <= win.h - 40 - 24, 'the stage fits the window');
// both ends clamp to the scene's edges; a resize keeps the pan inside the scene
centreOn(0, 0); for (let i = 0; i < 60; i++) stepPan(16);
assert.equal(pan.x, 0); assert.equal(pan.y, 0);
centreOn(S.w, S.h); for (let i = 0; i < 60; i++) stepPan(16);
assert.equal(pan.x, V.viewW - S.w * V.scale); assert.equal(pan.y, V.viewH - S.h * V.scale);
win = { w: 800, h: 560 }; fit();
assert.ok(pan.x <= 0 && pan.x >= V.viewW - S.w * V.scale && pan.y <= 0 && pan.y >= V.viewH - S.h * V.scale, 'pan stays inside the scene after a resize');

// With a west wing (custom rooms) the flat view shrinks to fit the minimum hall and the wing; the 39° floor is that same scale.
const { rooms } = await import('./rooms.js'), { WING_X } = await import('./layout.js');
rooms.list = [{ id: 'rA', name: 'A', pattern: '**', color: '#aa0000' }];
isoOn = false; S = { w: 300, h: 200 }; fit();
const wing = V.scale;
assert.ok(wing < flat && Math.abs(wing - (win.w - 24) / (SCENE.w + WING_X)) < 1e-9, 'flat: shrinks for the wing');
isoOn = true; S = { w: 2000, h: 2000 }; fit();
assert.equal(V.scale, wing, 'the 39° view floors at the flat scale, wing included');
assert.ok(pannable());
console.log('viewport ok');
