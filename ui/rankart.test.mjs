// Rank art (docs/superpowers/specs/2026-11-21-rank-art-design.md): rank-prefixed frames ('high up 0') drawn instead of
// the plain frame, only from the plain frame's own source; per-rank anchors laid over the base anchors.
import assert from 'node:assert/strict';
import { SCRIBE, ADEPT, SCRIBE_AT, ADEPT_AT, SCRIBE39, RES, ART, marked, rankLayer, rankAnchors, anchorsOf, checkComplete39 } from './sprites.js';
import { bodyOf, bodyOf39 } from './actors.js';
import { catalog } from '../tools/sprite_catalog.mjs';
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

// Actors draw their rank's frame (tier2, rank layers filled by hand, then refilled by a theme switch)
{
  setTheme('forge'); setTheme('tier2');
  const size = m => F('h', m[0].length, m.length);
  const H = SCRIBE.up.map(size), HG = size(SCRIBE.up[0]), AH = ADEPT.up.map(m => F('q', m[0].length, m.length));
  SCRIBE.rank.high = { ...rankLayer('scribe', { 'up 0': SCRIBE.up[0], 'up 1': SCRIBE.up[1], 'up 2': SCRIBE.up[2], 'down 0': SCRIBE.down[0], 'down 1': SCRIBE.down[1], 'down 2': SCRIBE.down[2], 'right 0': SCRIBE.right[0], 'right 1': SCRIBE.right[1], 'right 2': SCRIBE.right[2], 'high up 0': H[0], 'high up 1': H[1], 'high up 2': H[2] }, all).high, gesture: { think: HG } };
  const scribe = (model, extra = {}) => ({ id: 's1', s: { status: 'busy', context: { model } }, x: 50, y: 50, pose: 'walk', dir: 'up', walked: 0, t: 0, ...extra });
  // body at rank
  assert.equal(bodyOf(scribe('claude-opus-5-5')).map, H[0], 'body at rank: high walks in its rank frame');
  assert.equal(bodyOf(scribe('claude-sonnet-5-5')).map, SCRIBE.up[0], 'body at rank: standard keeps the plain frame');
  // seated rank gesture: some moment of a busy turn at the desk shows think, in the rank's frame
  let seen = false;
  for (let t = 0; t < 60 && !seen; t += 0.1) {
    const b = bodyOf(scribe('claude-opus-5-5', { pose: 'desk', t }));
    if (b.gesture === 'think') { assert.equal(b.map, HG, 'seated rank gesture'); seen = true; }
  }
  assert.ok(seen, 'a busy high scribe thinks at some moment');
  // rank feet
  SCRIBE_AT.rank.high = { ...SCRIBE_AT, feet: { x: 9, y: 17 } };
  assert.equal(bodyOf(scribe('claude-opus-5-5')).x, 50 - 9, 'rank feet');
  assert.equal(bodyOf(scribe('claude-haiku-5-5')).x, 50 - SCRIBE_AT.feet.x, 'plain feet for a rank without anchors');
  // glyph on rank body
  ADEPT.rank.high = { up: AH, down: AH, right: AH, left: AH, gesture: {} };
  ADEPT_AT.rank.high = { ...ADEPT_AT, 'glyph up': { x: 2, y: 5 } };
  const adept = { h: { kind: 'Plan', model: 'claude-opus-5-5' }, x: 50, y: 50, pose: 'console', target: { dir: 'up' } };
  const map = bodyOf(adept).map, g = ADEPT.marks['glyph plan'];
  assert.equal(map, marked(AH[0], ADEPT, ADEPT_AT.rank.high, 'up', 'plan'), 'glyph on rank body');
  g.forEach((row, j) => [...row].forEach((c, i) => c === '.' || assert.equal(map[5 * RES + j][2 * RES + i], c, 'the glyph at the rank anchor')));
  // 39°: the rank frame too
  const N = SCRIBE39.N.map(size);
  SCRIBE39.rank.high = { E: SCRIBE39.E, W: SCRIBE39.W, S: SCRIBE39.S, N, gesture: {} };
  assert.equal(bodyOf39(scribe('claude-opus-5-5')).map, N[0], '39° body at rank');
  // catalog rank rows: the viewer's rank rows show the rank's frames; 39° rank rows only once drawn, at the list's end
  const cat = catalog(), row = id => cat.find(e => e.id === id);
  assert.deepEqual(row('SCRIBE.high.up').cells.map(c => c.rows), H, 'catalog rank rows: high');
  assert.deepEqual(row('SCRIBE.standard.up').cells.map(c => c.rows), SCRIBE.up, 'catalog rank rows: standard plain');
  assert.equal(row('ADEPT.high.up').cells[0].rows, AH[0], 'catalog rank rows: adept');
  assert.deepEqual(row('SCRIBE39.high.N').cells.map(c => c.rows), N, 'catalog 39° rank row');
  assert.equal(row('SCRIBE39.standard.N'), undefined, 'no 39° row for an undrawn rank (standard draws none)');
  assert.ok(cat.indexOf(row('SCRIBE39.high.N')) > cat.findIndex(e => e.id.startsWith('ENCLAVE')), '39° rank rows after every earlier row');
  setTheme('forge'); setTheme('tier2'); // refill: the hand-made layers are gone
  assert.equal(SCRIBE.rank.high?.up[0], ART.base.scribe.frames['high up 0'], 'refilled from the art, the hand-made layer gone');
}

// The committed 40k rank bodies (tools/rank_art.mjs): every walk frame of high and novice drawn, a real redraw (a
// quarter of its drawn cells changed, not a recolour), and the department sash still seen from behind
const drawnRanks = (family, dirs, back) => {
  const fr = ART.base[family].frames;
  for (const r of ['high', 'novice']) for (const d of dirs) for (const i of [0, 1, 2]) {
    const n = `${d} ${i}`, f = fr[`${r} ${n}`], p = fr[n];
    assert.ok(f, `${family}: '${r} ${n}' drawn`);
    let cells = 0, changed = 0;
    p.forEach((row, y) => [...row].forEach((c, x) => { if (c !== '.' || f[y][x] !== '.') { cells++; if (f[y][x] !== c) changed++; } }));
    assert.ok(changed / cells >= 0.25, `${family} '${r} ${n}': a real redraw (${changed}/${cells})`);
    if (d === back && i === 0) assert.ok(f.join('').split('y').length - 1 >= 4, `${family} '${r} ${n}': the sash from behind`);
  }
};
drawnRanks('scribe', ['up', 'down', 'right'], 'up');
drawnRanks('adept', ['up', 'down', 'right'], null);
drawnRanks('scribe39', ['E', 'W', 'S', 'N'], 'N');
assert.ok(checkComplete39('scribe39', ART.base.scribe39), 'scribe39 still complete with its rank frames');
// the kind glyph's place is left as drawn on every rank body (marked lays the glyph there: sprites.js)
for (const r of ['high', 'novice']) for (const [n, [gx, gy]] of [['down 0', [6, 14]], ['up 0', [7, 14]]]) {
  const fr = ART.base.adept.frames, f = fr[`${r} ${n}`], p = fr[n];
  for (let y = gy; y < gy + 5; y++) assert.equal(f[y].slice(gx, gx + 10), p[y].slice(gx, gx + 10), `adept '${r} ${n}': the glyph's place kept, row ${y}`);
}
console.log('rankart: ok');
