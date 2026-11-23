// The back wall's slow life (backwall.js): clouds over the window glass. Run: node ui/backwall.test.mjs
import assert from 'node:assert/strict';
const ctx = log => new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { log.push([k, ...a]); return { addColorStop() {}, data: new Uint8ClampedArray(1e6) }; }), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { createElement: () => { const log = [], c = { width: 0, height: 0, log }; c.getContext = () => ctx(log); return c; } };
const { drawClouds, cloudAt } = await import('./backwall.js');
const { loadAllArt } = await import('./sprites.js');
const { THEMES, setTheme } = await import('./theme.js');
await import('./themes.js');
await loadAllArt();
const { wallArt } = await import('./wallart.js');

// ---- only a sky has clouds ----
const sky = {};
for (const id of Object.keys(THEMES)) {
  setTheme(id);
  const log = []; drawClouds(ctx(log), [78], 5, true, 1); sky[id] = log.some(l => l[0] === 'drawImage');
}
for (const id of ['tier2', 'forge', 'xenos', 'night', 'contrast', 'tower', 'cyber', 'rain']) assert.equal(sky[id], true, id);
for (const id of ['orbital', 'vault']) assert.equal(sky[id], false, `${id}: no sky`);
setTheme('tier2');

// ---- clouds ----
const ks = Array.from({ length: 400 }, (_, i) => cloudAt(78, i / 4));
assert.ok(Math.min(...ks) < -0.7 && Math.max(...ks) > 1.7, 'in and out of sight, so the wrap is unseen');
assert.notEqual(cloudAt(78, 3), cloudAt(292, 3));
const panes = (k, day = true) => { const log = []; drawClouds(ctx(log), [78, 292], 5, day, k); return log.filter(l => l[0] === 'drawImage').map(l => l.slice(2, 4)); };
assert.deepEqual(panes(0), []);
assert.deepEqual(panes(1), [[78 + wallArt().winDx, 10], [292 + wallArt().winDx, 10]]);
assert.equal(panes(1, false).length, 2, 'by night too');
console.log('backwall ok');
