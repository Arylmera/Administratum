// Writes a world's CI lamp (Settings > CI: the lamp of each department's last push): node tools/cilamp_art.mjs <theme id>.
// Its frames come from tools/cilamp_art/<id>.mjs (default export: () => { <frame name>: rows of key.gpl chars }); tier2's
// is the base family (ui/art/cilamp.*), every other world's would be ui/art/<id>/cilamp.* (none is drawn yet: every world
// uses the base lamp). Sizes and anchors: tools/cilamp_art/kit.mjs.
import { writeSheet } from './sheet_writer.mjs';
import { SIZES, NAMES, ANCHORS } from './cilamp_art/kit.mjs';

const id = process.argv[2] ?? 'tier2';
const frames = (await import(`./cilamp_art/${id}.mjs`)).default();
for (const [n, [w, h]] of Object.entries(SIZES)) {
  const f = frames[n];
  if (!f || f.length !== h || f.some(r => r.length !== w)) throw new Error(`${id} ${n}: want ${w}x${h}`);
}
// the base sheet carries the anchors; a world's sheet lays its frames over them (sprites.js sheetOf)
writeSheet(id === 'tier2' ? 'cilamp' : `${id}/cilamp`, frames, [NAMES], id === 'tier2' ? { anchors: ANCHORS } : {});
