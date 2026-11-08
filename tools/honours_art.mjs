// Writes a world's Hall of Honours plaque: node tools/honours_art.mjs <theme id>. Its frame comes from
// tools/honours_art/<id>.mjs (default export: () => { HONOURS: rows of key.gpl chars }); tier2's is the base family
// (ui/art/honours.*), every other world's ui/art/<id>/honours.* (its accent themes use it through artOf). Size and the
// text anchors the overlay reads: tools/honours_art/kit.mjs.
import { writeSheet } from './sheet_writer.mjs';
import { SIZES, ANCHORS } from './honours_art/kit.mjs';

const id = process.argv[2] ?? 'tier2';
const frames = (await import(`./honours_art/${id}.mjs`)).default();
for (const [n, [w, h]] of Object.entries(SIZES)) {
  const f = frames[n];
  if (!f || f.length !== h || f.some(r => r.length !== w)) throw new Error(`${id} ${n}: want ${w}x${h}`);
}
// the base sheet carries the anchors; a world's sheet lays its frame over them (sprites.js sheetOf)
writeSheet(id === 'tier2' ? 'honours' : `${id}/honours`, frames, [Object.keys(SIZES)], id === 'tier2' ? { anchors: ANCHORS } : {});
