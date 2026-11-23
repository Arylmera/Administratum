// Room ambience (ambience.js): the channels' pulses, the dust, the sparks. Run: node ui/ambience.test.mjs
import assert from 'node:assert/strict';
import { AMOUNT, flowLights, dust, sparks, drawAmbience, isFire } from './ambience.js';
import { hallOf, WALL_DY } from './layout.js';
import { setView } from './view.js';

assert.deepEqual(AMOUNT, { off: 0, subtle: 0.5, full: 1 });

// ---- pulses: on the floor channels' own lines, inside the scriptorium, moving with flow, none when off / no channel ----
const hall = hallOf(0), lines = Array.from({ length: hall.rows }, (_, j) => WALL_DY + (j ? 119 + 64 * j : 117));
const at = (f, k = 1, H = hall) => flowLights(H, f, k);
for (const f of [0, 33.3, 5000]) for (const l of at(f)) {
  assert.ok(lines.includes(l.y), `on a channel: ${l.y}`);
  assert.ok(l.x >= 0 && l.x <= hall.sw && l.z === 0 && l.r > 0 && l.color, JSON.stringify(l));
}
assert.equal(at(0).length, hall.rows);
assert.ok(at(0, 0.5).length > 0 && at(0, 0.5).length < hall.rows, 'subtle: fewer');
assert.deepEqual(at(0, 0), [], 'off: none');
assert.deepEqual(flowLights({ ...hall, strip: true }, 1, 1), []);
assert.deepEqual(flowLights({ ...hall, sanct: {} }, 1, 1), [], 'the rooms plan has no channel');
for (const [a, b] of at(10).map((l, i) => [l.x, at(13)[i].x])) assert.ok(Math.abs(b - a - 3) < 1e-6 || Math.abs(b - a + 3) < 1e-6 || Math.abs(b - a) > hall.sw / 2, 'moves by flow (or wraps)');
const wing = flowLights({ ...hall, wx: 120, base: hall }, 10, 1);
assert.deepEqual(wing.map(l => l.x - 120), at(10).map(l => l.x), 'a west wing moves them east');
assert.ok(at(hall.sw / 2).every(l => l.r <= 10) && at(0).some((l, i) => Math.abs(l.x - at(0)[(i + 1) % hall.rows].x) > 5), 'out of step');
// no jump: a pulse is faded out where it wraps round
for (let f = 0; f < 2 * hall.sw; f += 1) for (const l of at(f)) if (l.x < 1 || l.x > hall.sw - 1) assert.ok(l.r < 1.5, `faded at the wall: ${l.r}`);

// ---- dust and sparks: inside their unit box, faded at both ends, moving ----
for (const f of [dust, sparks]) {
  for (const t of [0, 3.21, 999]) for (const p of f('w1', t, 10)) assert.ok(p.u >= 0 && p.u <= 1 && p.v >= 0 && p.v <= 1 && p.a >= 0 && p.a <= 1, JSON.stringify(p));
  assert.equal(f('w1', 1, 10).length, 10);
  assert.deepEqual(f('w1', 1, 0), []);
  assert.notDeepEqual(f('w1', 1, 4), f('w1', 2, 4));
  assert.notDeepEqual(f('w1', 1, 4), f('w2', 1, 4));
  for (let t = 0; t < 30; t += 0.05) for (const p of f('w1', t, 6)) if (p.v < 0.02 || p.v > 0.98) assert.ok(p.a < 0.15, 'born and gone unseen');
}

// ---- drawing: dust only in the day's beams, sparks at fires only, nothing when off ----
const log = () => { const g = { n: 0, at: [], save() {}, restore() {}, fillRect(x, y, w, h) { g.n++; g.at.push([x, y, w, h]); } }; return g; };
const fire = { x: 100, y: 200, r: 26, flicker: true, color: 'rgba(1,2,3,.4)' }, lamp = { x: 50, y: 60, r: 14, color: 'x' };
assert.equal(isFire(fire), true);
assert.equal(isFire(lamp), false);
assert.equal(isFire({ ...fire, h: 20 }), false, 'a desk candle');
assert.equal(isFire({ ...fire, r: 60 }), false, 'the compaction flare has its own sparks');
const run = (lights, beams, windows, k) => { const g = log(); drawAmbience(g, { lights, level: { beams }, windows, t: 5, k }); return g; };
for (const v of ['flat', '39']) {
  setView(v);
  assert.equal(run([lamp], false, [78], 1).n, 0, `${v}: night, no fire: nothing`);
  assert.ok(run([lamp], true, [78], 1).n > 0, `${v}: dust in the beam`);
  assert.ok(run([fire], false, [], 1).n > 0, `${v}: sparks`);
  assert.equal(run([fire], true, [78], 0).n, 0, `${v}: off`);
  const full = run([fire], true, [78], 1).n, half = run([fire], true, [78], 0.5).n;
  assert.ok(half > 0 && half < full, `${v}: subtle is less`);
}
setView('flat');
for (const [x, y] of run([fire], false, [], 1).at) assert.ok(Math.abs(x - 100) < 12 && y <= 202 && y > 160, `sparks rise from the fire: ${x},${y}`);
console.log('ambience ok');
