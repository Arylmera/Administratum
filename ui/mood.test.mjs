// The hall's mood (mood.js): load and alarm, eased; its effect on the light, the pulses, the Magos. Run: node ui/mood.test.mjs
import assert from 'node:assert/strict';
import { moodOf, makeMood, stepMood, moodLevel } from './mood.js';
import { lightLevel } from './layout.js';

const S = (status, more = {}) => ({ status, sinceMs: Date.now(), ...more });
const old = Date.now() - 24 * 3600e3;
// ---- the target ----
assert.deepEqual(moodOf([]), { energy: 0, alarm: 0 });
assert.deepEqual(moodOf([S('idle'), S('waiting')]), { energy: 0, alarm: 0 }, 'idle and fresh petitions are calm');
assert.equal(moodOf([S('busy')]).energy, 0.25);
assert.equal(moodOf([S('busy'), S('shell')]).energy, 0.5, 'a shell command is work');
assert.equal(moodOf(Array(9).fill(S('busy'))).energy, 1, 'at most 1');
assert.equal(moodOf([S('waiting', { sinceMs: old })]).alarm, 1, 'a stale petition');
// busy <-> shell flips don't move it
assert.deepEqual(moodOf([S('busy')]), moodOf([S('shell')]));

// ---- eased: no step jumps, it gets there, the frame rate does not matter ----
const run = (fps, s, target, m = makeMood()) => { for (let i = 0; i < s * fps; i++) stepMood(m, 1 / fps, target, 1); return m; };
const up = { energy: 1, alarm: 0 };
const one = stepMood(makeMood(), 1 / 12, up, 1);
assert.ok(one.energy > 0 && one.energy < 0.05, `eased (${one.energy})`);
assert.ok(run(12, 30, up).energy > 0.98, 'there within 30 s');
assert.ok(Math.abs(run(6, 8, up).energy - run(30, 8, up).energy) < 0.02, 'any frame rate');
// the clocks only go forward, faster when busy, by a bounded pace
const calm = run(12, 30, { energy: 0, alarm: 0 }), busy = run(12, 30, up);
assert.ok(calm.flow > 0 && busy.flow > 1.5 * calm.flow, `pulses: ${calm.flow} < ${busy.flow}`);
assert.ok(busy.clock > calm.clock && busy.clock < 2 * 30 && calm.clock > 0.5 * 30, `Magos: ${calm.clock} < ${busy.clock}`);
// off: the Magos on real time, no mood
const off = makeMood(); for (let i = 0; i < 120; i++) stepMood(off, 1 / 12, { energy: 1, alarm: 1 }, 0);
assert.ok(Math.abs(off.clock - 10) < 1e-6 && off.energy === 0 && off.alarm === 0);

// ---- the light: brighter when busy, dimmer in alarm, off untouched, beams and glow as they are ----
for (const mode of ['full', 'candles']) {
  const L = lightLevel(mode, 12);
  const d = (e, a, k = 1) => moodLevel(L, { energy: e, alarm: a }, k).dark;
  assert.ok(d(1, 0) < d(0, 0) && d(1, 1) > d(1, 0), mode);
  for (const e of [0, 1]) for (const a of [0, 1]) assert.ok(Math.abs(d(e, a) - L.dark) <= 0.1 && d(e, a) >= 0 && d(e, a) < 0.9, 'a hint, never a blackout');
  assert.ok(Math.abs(d(1, 0, 0.5) - L.dark) < Math.abs(d(1, 0) - L.dark), 'subtle: less');
  assert.equal(moodLevel(L, { energy: 1, alarm: 1 }, 0), L, 'off: the very level');
  const { dark, ...rest } = moodLevel(L, { energy: 1, alarm: 0 }, 1), { dark: _, ...same } = L;
  assert.deepEqual(rest, same);
}
console.log('mood ok');
