// The back wall's slow life (backwall.js): swaying hangings, clouds over the glass. Run: node ui/backwall.test.mjs
import assert from 'node:assert/strict';
const ctx = log => new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { log.push([k, ...a]); return { addColorStop() {}, data: new Uint8ClampedArray(1e6) }; }), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { createElement: () => { const log = [], c = { width: 0, height: 0, log }; c.getContext = () => ctx(log); return c; } };
const { swayMap, poseAt, POSES, hangingsOf, drawHangings, drawClouds, cloudAt } = await import('./backwall.js');
const { MAPS, loadAllArt } = await import('./sprites.js');
const { THEMES, setTheme } = await import('./theme.js');
await import('./themes.js');
await loadAllArt();
const { propsOf } = await import('./scene.js');
const { wallArt } = await import('./wallart.js');
const { hallOf } = await import('./layout.js');

// ---- sway: same size, same ink, rod still, never more than a px, every world's hangings ----
const ink = r => r.replaceAll('.', '');
for (const id of Object.keys(THEMES)) {
  setTheme(id);
  const art = wallArt();
  if (!art.tallHang) { assert.deepEqual(hangingsOf(propsOf(hallOf(0)).props), [], `${id}: no tall hanging`); continue; }
  for (const m of [MAPS.HANGING, art.hangB]) {
    assert.equal(swayMap(m, 0), m);
    for (let p = 1; p < POSES; p++) {
      const s = swayMap(m, p);
      assert.equal(s, swayMap(m, p), 'kept: the sprite cache goes by identity');
      assert.equal(s.length, m.length);
      s.forEach((r, y) => { assert.equal(r.length, m[y].length); assert.equal(ink(r), ink(m[y]), `${id} row ${y}: no pixel lost`); });
      assert.deepEqual(s.slice(0, 8), m.slice(0, 8), 'the rod is still');
      assert.ok(s.every((r, y) => [m[y], `.${m[y].slice(0, -1)}`, `${m[y].slice(1)}.`].includes(r)), 'at most a px');
    }
  }
}
// only cloth sways, only a sky has clouds
const moves = {}, sky = {};
for (const id of Object.keys(THEMES)) {
  setTheme(id);
  moves[id] = hangingsOf(propsOf(hallOf(0)).props).length > 0;
  const log = []; drawClouds(ctx(log), [78], 5, true, 1); sky[id] = log.some(l => l[0] === 'drawImage');
}
for (const id of ['tier2', 'forge', 'xenos', 'night', 'contrast']) assert.ok(moves[id] && sky[id], id);
for (const id of ['cyber', 'rain', 'orbital', 'vault', 'darwin']) assert.equal(moves[id], false, `${id}: no cloth`);
for (const id of ['orbital', 'vault']) assert.equal(sky[id], false, `${id}: no sky`);
console.log('sway:', Object.keys(moves).filter(i => moves[i]).join(), '| clouds:', Object.keys(sky).filter(i => sky[i]).join());
setTheme('tier2');
assert.ok(Array.from({ length: POSES - 1 }, (_, i) => swayMap(MAPS.HANGING, i + 1)).some(s => s.some((r, y) => r !== MAPS.HANGING[y])), 'it sways');

// ---- gusts ----
const poses = Array.from({ length: 1400 }, (_, i) => poseAt(97.5, i / 10));
assert.equal(new Set(poses).size, POSES);
const still = poses.filter(p => !p).length / poses.length;
assert.ok(still > 0.5 && still < 0.8, `calm most of the time (${still})`);
assert.notDeepEqual(poses, Array.from({ length: 1400 }, (_, i) => poseAt(273.5, i / 10)), 'out of step');

// ---- drawn: a covered one only with its cover redrawn (flat), never in 39°; off: nothing ----
const props = propsOf(hallOf(0)).props, hs = hangingsOf(props);
assert.ok(hs.length >= 2 && hs.some(h => h.over.some(q => q[0] === 'CENSER')) && hs.some(h => !h.over.length), 'the fixture has both');
const draws = (k, covered) => { const out = []; for (let t = 0; t < 14; t += 0.5) { const log = []; drawHangings(ctx(log), props, t, k, covered); out.push(log.filter(l => l[0] === 'drawImage').length); } return out; };
assert.ok(draws(0).every(n => n === 0), 'off');
const sum = a => a.reduce((p, q) => p + q, 0);
assert.ok(sum(draws(1, false)) > 0 && sum(draws(1, false)) < sum(draws(1, true)));

// ---- clouds ----
const ks = Array.from({ length: 400 }, (_, i) => cloudAt(78, i / 4));
assert.ok(Math.min(...ks) < -0.7 && Math.max(...ks) > 1.7, 'in and out of sight, so the wrap is unseen');
assert.notEqual(cloudAt(78, 3), cloudAt(292, 3));
const panes = (k, day = true) => { const log = []; drawClouds(ctx(log), [78, 292], 5, day, k); return log.filter(l => l[0] === 'drawImage').map(l => l.slice(2, 4)); };
assert.deepEqual(panes(0), []);
assert.deepEqual(panes(1), [[78 + wallArt().winDx, 10], [292 + wallArt().winDx, 10]]);
assert.equal(panes(1, false).length, 2, 'by night too');
console.log('backwall ok');
