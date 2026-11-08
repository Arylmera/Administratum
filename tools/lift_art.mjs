// Writes a world's lift (the desktop column's shaft, car and floor slab): node tools/lift_art.mjs <theme id>. Its frames
// come from tools/lift_art/<id>.mjs (default export: () => { <frame name>: rows of key.gpl chars }); tier2's is the base
// family (ui/art/lift.*), every other world's ui/art/<id>/lift.* (its accent themes use it through artOf). Sizes:
// tools/lift_art/kit.mjs.
import { writeSheet } from './sheet_writer.mjs';
import { SIZES, NAMES } from './lift_art/kit.mjs';

const id = process.argv[2] ?? 'tier2';
const frames = (await import(`./lift_art/${id}.mjs`)).default();
for (const [n, [w, h]] of Object.entries(SIZES)) {
  const f = frames[n];
  if (!f || f.length !== h || f.some(r => r.length !== w)) throw new Error(`${id} ${n}: want ${w}x${h}`);
}
writeSheet(id === 'tier2' ? 'lift' : `${id}/lift`, frames, [NAMES.slice(0, 5), NAMES.slice(5, 8), NAMES.slice(8)]);
