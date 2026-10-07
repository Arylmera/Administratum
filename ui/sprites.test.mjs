import assert from 'node:assert/strict';
import {
  BASE, MAPS, SCRIBE, ADEPT, MAGOS, RES, ART,
  FAMILIES39, SCRIBE39, SCRIBE39_AT, ADEPT39, ADEPT39_AT, MAGOS39, MAGOS39_AT, SKULL39, SKULL39_AT, checkComplete39, resolve39,
} from './sprites.js';
import { TIER_II } from './theme.js';

// [width, height] in logical px of every sprite (the art is RES times that). The drawing code places them by these
// sizes, so a redraw in ui/art/ keeps them unless the code moves too (design note: depth C).
const LOW = {
  ARM: [4, 8], ARM_L: [4, 8], SCROLL: [6, 7], QSCROLL: [6, 7], DESK: [32, 21], LECTERN: [22, 21], SHELF: [32, 21], SKULL: [10, 10],
  COG_MECH: [20, 18], SEAL: [6, 10], CANDLES: [12, 9], THRONE: [20, 20], LORD_DESK: [44, 13], BRAZIER: [10, 13],
  RECAFF: [16, 18], COGITATOR: [82, 50], CONSOLE: [14, 10], WINDOW: [16, 17], BANNER: [12, 15], WINDOW_TALL: [18, 42], HANGING: [13, 50], CRATE: [14, 12], PAPER_STACK: [8, 12],
  SCROLL_PILE: [18, 7], BOOKS: [10, 9], LOOSE_A: [5, 4], LOOSE_B: [4, 5], GAUGE: [6, 6], CENSER: [5, 10],
  GATE: [32, 30], GATE_L: [8, 22], GATE_R: [8, 22], GATE_VOID: [16, 22], COMMIT_SEAL: [4, 7.5], COMMIT_TAG: [4, 7.5], COMMIT_STAMP: [4, 6], SCROLL_HELD: [14, 7], TABLE: [46, 8], BENCH: [46, 4],
};

assert.equal(RES, 2);
assert.equal(TIER_II.sash.length, 8);
const check = (name, map, [w, h]) => {
  assert.equal(map.length, 2 * h, `${name}: height`);
  map.forEach((row, j) => {
    assert.equal(row.length, 2 * w, `${name}: row ${j} length`);
    for (const c of row) assert.ok(c === '.' || c in BASE, `${name}: bad char '${c}' row ${j}`);
  });
};
assert.deepEqual(Object.keys(MAPS).sort(), Object.keys(LOW).sort());
for (const [name, map] of Object.entries(MAPS)) check(name, map, LOW[name]);
for (const dir of ['up', 'down', 'left', 'right']) {
  assert.equal(SCRIBE[dir].length, 3, `${dir}: frames`);
  SCRIBE[dir].forEach((f, i) => check(`SCRIBE.${dir}[${i}]`, f, [16, 17]));
}
SCRIBE.right.forEach((f, i) => assert.deepEqual(SCRIBE.left[i], f.map(r => [...r].reverse().join(''))));
for (const dir of ['up', 'down', 'left', 'right']) ADEPT[dir].forEach((f, i) => check(`ADEPT.${dir}[${i}]`, f, [12, 14]));
check('MAGOS.body', MAGOS.body, [24, 24]);
check('MAGOS.arm', MAGOS.arm, [5, 24]);
const flip = r => [...r].reverse().join('');
for (const n of ['THRONE', 'LORD_DESK', 'COG_MECH']) MAPS[n].forEach((r, j) => assert.equal(r.replace(/[^.]/g, '#'), flip(r).replace(/[^.]/g, '#'), `${n}: silhouette row ${j}`));
MAPS.THRONE.forEach((r, j) => assert.equal(r.replace(/[^.k]/g, '#'), flip(r).replace(/[^.k]/g, '#'), `THRONE: outline row ${j}`));

// 39° character families (wave 2, no art yet): no ui/art/*39.* file in this repo, so the app still loads and every
// export is empty. At RUNTIME an incomplete file degrades instead of throwing (resolve39 below); completeness is
// enforced by THIS TEST instead, over every file actually committed, so an incomplete one can never land.
assert.deepEqual(FAMILIES39, ['scribe39', 'adept39', 'magos39', 'skull39']);
for (const f of FAMILIES39) if (Object.keys(ART.base[f].frames).length) assert.equal(checkComplete39(f, ART.base[f]), true, `ui/art/${f}.json: incomplete`);
for (const [themeId, families] of Object.entries(ART.themed)) {
  for (const f of FAMILIES39) if (families[f] && Object.keys(families[f].frames).length) assert.equal(checkComplete39(f, families[f]), true, `ui/art/${themeId}/${f}.json: incomplete`);
}
for (const [obj, at] of [[SCRIBE39, SCRIBE39_AT], [ADEPT39, ADEPT39_AT], [MAGOS39, MAGOS39_AT], [SKULL39, SKULL39_AT]]) {
  assert.deepEqual(obj, {}); assert.deepEqual(at, {});
}
// Any 39 family that does land (e.g. once an art agent has run) must be complete: every row still a key-palette char.
const dirRows = (obj, name) => ['E', 'W', 'S', 'N'].flatMap(d => (obj[d] ?? []).map((rows, i) => [`${name}.${d}[${i}]`, rows]));
for (const [name, obj, extra] of [['SCRIBE39', SCRIBE39, ['arm', 'armL', 'scroll']], ['ADEPT39', ADEPT39, []], ['MAGOS39', MAGOS39, ['body', 'arm']], ['SKULL39', SKULL39, ['skull']]]) {
  if (!Object.keys(obj).length) continue;
  for (const [label, rows] of [...dirRows(obj, name), ...extra.map(n => [`${name}.${n}`, obj[n]])]) {
    for (const row of rows) for (const c of row) assert.ok(c === '.' || c in BASE, `${label}: bad char '${c}'`);
  }
}

// Mutation-check: checkComplete39 must fail on a sheet missing a required frame (proves the "complete" check is not
// vacuous), and must fail on one missing a required anchor too. A fully empty sheet (no file yet) is not a failure.
assert.equal(checkComplete39('skull39', { frames: {}, anchors: {} }), false);
assert.throws(() => checkComplete39('skull39', { frames: { skull: ['k'] }, anchors: { centre: [0, 0], carry: [0, 0] } }), /anchor beam/);
assert.throws(() => checkComplete39('magos39', { frames: { arm: ['k'] }, anchors: { arm: [0, 0], chest: [0, 0], eyeL: [0, 0], eyeR: [0, 0] } }), /body/);
assert.equal(checkComplete39('skull39', { frames: { skull: ['k'] }, anchors: { centre: [0, 0], carry: [0, 0], beam: [0, 0] } }), true);

// resolve39 (the runtime degrade seam, built from fabricated sheets, no files under ui/art touched): themed missing
// or incomplete falls back to base; both bad falls back to empty; degrading logs console.error instead of throwing.
{
  const complete = { frames: { skull: ['k'] }, anchors: { centre: [0, 0], carry: [0, 0], beam: [0, 0] } };
  const incomplete = { frames: { skull: ['k'] }, anchors: { centre: [0, 0], carry: [0, 0] } }; // missing anchor beam
  const empty = { frames: {}, anchors: {} };
  const logged = [], realError = console.error;
  console.error = (...a) => logged.push(a.join(' '));
  try {
    assert.equal(resolve39('skull39', null, complete, "theme 'x'"), complete, 'no themed file: base used');
    assert.equal(resolve39('skull39', incomplete, complete, "theme 'x'"), complete, 'themed incomplete: falls back to base');
    assert.ok(logged.some(m => m.includes("theme 'x'") && m.includes('skull39') && m.includes('beam')), 'degrade should log the family, theme and the missing anchor');
    logged.length = 0;
    assert.deepEqual(resolve39('skull39', incomplete, empty, "theme 'x'"), { frames: {}, anchors: {}, tiles: {}, meta: {} }, 'both bad: empty, still no throw');
    // only the themed attempt logs (incomplete, not absent); the base attempt is wholly absent (empty frames), which
    // checkComplete39 treats as false without throwing, so no second log. Mutation-check: a version that always
    // falls through to base without checking themed first would log 0 here, not 1.
    assert.equal(logged.length, 1, 'the themed attempt should log, the empty base attempt should not');
  } finally { console.error = realError; }
}
console.log('sprites ok');
