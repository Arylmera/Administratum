import assert from 'node:assert/strict';
import { BASE, MAPS, SCRIBE, ADEPT, RES } from './sprites.js';
import { TIER_II } from './theme.js';

// Low-res [width, height] of every map, recorded from the up()-only file before the HD redraw.
const LOW = {
  ARM: [4, 8], ARM_L: [4, 8], SCROLL: [6, 7], QSCROLL: [6, 7], DESK: [32, 21], LECTERN: [22, 21], SHELF: [32, 21], SKULL: [10, 10],
  COG_MECH: [20, 18], SEAL: [6, 10], CANDLES: [12, 9], THRONE: [20, 20], MAGOS: [24, 24], LORD_DESK: [44, 13], BRAZIER: [10, 13],
  RECAFF: [16, 18], COGITATOR: [82, 50], CONSOLE: [14, 10], WINDOW: [16, 17], BANNER: [12, 15], CRATE: [14, 12], PAPER_STACK: [8, 12],
  SCROLL_PILE: [18, 7], BOOKS: [10, 9], LOOSE_A: [5, 4], LOOSE_B: [4, 5], GAUGE: [6, 6], CENSER: [5, 10],
  GATE: [32, 30], GATE_L: [8, 22], GATE_R: [8, 22], TABLE: [46, 8], BENCH: [46, 4],
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
const flip = r => [...r].reverse().join('');
for (const n of ['THRONE', 'LORD_DESK', 'COG_MECH']) MAPS[n].forEach((r, j) => assert.equal(r.replace(/[^.]/g, '#'), flip(r).replace(/[^.]/g, '#'), `${n}: silhouette row ${j}`));
MAPS.THRONE.forEach((r, j) => assert.equal(r.replace(/[^.k]/g, '#'), flip(r).replace(/[^.k]/g, '#'), `THRONE: outline row ${j}`));
console.log('sprites ok');
