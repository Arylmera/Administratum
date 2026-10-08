// Checks that the face sheets (tools/faces.mjs) rebuild today's flat frames pixel for pixel, so the flat hall can be
// drawn from the same art as the 39 deg view. Run: node tools/faces.test.mjs
import assert from 'node:assert/strict';
import { MAPS } from '../ui/sprites.js';
import { deskSheet, shelfSheet, cogSheet, composeFlat } from './faces.mjs';

const diff = (a, b) => { let n = 0; a.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== b[y]?.[x]) n++; }); return n; };
for (const s of [deskSheet(), shelfSheet(), cogSheet()]) {
  const flat = composeFlat(s), today = MAPS[s.name];
  assert.equal(flat.length, today.length, `${s.name}: height`);
  assert.deepEqual(flat, today, `${s.name}: ${diff(flat, today)} pixels differ from today's frame`);
  // the flat-only retouch is really needed (or absent): without it the frame must differ
  if (s.flatOnly?.length) {
    const bare = composeFlat(s, { retouch: false });
    console.log(`${s.name}: matches; without its flat-only retouch (${s.flatOnly.map(d => d.name).join(', ')}) ${diff(bare, today)} pixels differ`);
    assert.ok(diff(bare, today) > 0);
  } else console.log(`${s.name}: matches, no retouch`);
}
// a broken sheet must fail: drop a detail and the desk no longer matches
const broken = deskSheet(); broken.details.pop();
assert.notDeepEqual(composeFlat(broken), MAPS.DESK);
console.log('faces: ok');
