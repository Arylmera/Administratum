// Rank art (docs/superpowers/specs/2026-11-21-rank-art-design.md): rank-prefixed frames ('high up 0') drawn instead of
// the plain frame, only from the plain frame's own source; per-rank anchors laid over the base anchors.
import assert from 'node:assert/strict';
import { SCRIBE, ADEPT, SCRIBE_AT, RES, rankLayer, rankAnchors, anchorsOf } from './sprites.js';
import { THEMES, setTheme } from './theme.js';

// A frame whose every pixel is `c`, w x h art px: identity is checkable by its char.
const F = (c, w = 4, h = 3) => Array.from({ length: h }, () => c.repeat(w));
const flat = extra => ({ ...Object.fromEntries(['up', 'down', 'right'].flatMap(d => [0, 1, 2].map(i => [`${d} ${i}`, F('p')]))), ...extra });
const all = () => true;

// rank frame picked: the rank's own frame where drawn, the plain one for the frames it did not draw
{
  const H = F('h'), L = rankLayer('scribe', flat({ 'high up 0': H }), all);
  assert.equal(L.high.up[0], H, 'rank frame picked');
  assert.deepEqual(L.high.up[1], F('p'), 'plain frame where the rank drew none');
  assert.equal(L.novice, undefined, 'a rank with no frame of its own is absent');
  assert.equal(L.standard, undefined, 'standard is absent unless drawn');
}
// same source: a rank frame from another source than its plain frame is never used
{
  const L = rankLayer('scribe', flat({ 'high up 0': F('h') }), n => !n.startsWith('high'));
  assert.equal(L.high, undefined, 'same source');
}
// left mirrors rank right
{
  const R1 = ['hp..', 'hp..', 'hp..'], L = rankLayer('scribe', flat({ 'high right 1': R1 }), all);
  assert.deepEqual(L.high.left[1], ['..ph', '..ph', '..ph'], 'left mirrors rank right');
  assert.deepEqual(L.high.left[0], F('p'), 'left falls back to the plain right, mirrored');
}
// rank gesture: only with the rank's own seated frame
{
  const HG = F('g'), H = F('h');
  assert.equal(rankLayer('scribe', flat({ 'up think': F('t'), 'high up think': HG, 'high up 0': H }), all).high.gesture.think, HG, 'rank gesture');
  const lone = rankLayer('scribe', flat({ 'up think': F('t'), 'high up think': HG, 'high down 0': H }), all);
  assert.equal(lone.high.gesture?.think, undefined, 'a rank gesture without its rank seated frame is dropped');
}
// 39° rank
{
  const N0 = F('n'), frames = Object.fromEntries(['E', 'W', 'S', 'N'].flatMap(d => [0, 1, 2].map(i => [`${d} ${i}`, F(d)])));
  const L = rankLayer('scribe39', { ...frames, 'novice N 0': N0 }, all);
  assert.equal(L.novice.N[0], N0, '39° rank frame');
  assert.deepEqual(L.novice.E[0], F('E'), '39° plain frame where the rank drew none');
  assert.equal(L.novice.left, undefined, 'no flat directions in a 39° layer');
}
// rank anchors: laid over the base anchors, in logical px; anchorsOf skips the rank keys
{
  const sheet = { anchors: { feet: [16, 34], arm: [28, 18], high: { arm: [26, 18] } } };
  const A = rankAnchors(sheet);
  assert.deepEqual(A.high.arm, { x: 26 / RES, y: 18 / RES }, 'rank anchor');
  assert.deepEqual(A.high.feet, { x: 16 / RES, y: 34 / RES }, 'base anchor kept for the rank');
  assert.equal(A.novice, undefined, 'no anchors for a rank that set none');
  assert.equal(anchorsOf(sheet).high, undefined, 'anchorsOf skips the rank keys');
}
// committed art: no world outside the 40k Ordos draws a rank frame, so their hall is as before
{
  const ORDOS = ['tier2', 'forge', 'xenos', 'night', 'contrast'];
  for (const id of Object.keys(THEMES).filter(id => !ORDOS.includes(id))) {
    setTheme(id);
    assert.deepEqual(SCRIBE.rank, {}, `${id}: no scribe rank frames`);
    assert.deepEqual(ADEPT.rank, {}, `${id}: no adept rank frames`);
  }
  setTheme('tier2');
  assert.ok(SCRIBE_AT.rank, 'SCRIBE_AT.rank refilled');
}
console.log('rankart: ok');
