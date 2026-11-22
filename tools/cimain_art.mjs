// Writes a world's main lamp (Settings > CI: the CI of each department's default branch, beside its consoles):
// node tools/cimain_art.mjs <theme id>. Its frames come from tools/cimain_art/<id>.mjs (default export: () => { <frame
// name>: rows of key.gpl chars }); tier2's is the base family (ui/art/cimain.*), every other world's would be
// ui/art/<id>/cimain.* (none is drawn yet: every world uses the base beacon). Sizes and anchors: tools/cimain_art/kit.mjs.
import { writeSheet } from './sheet_writer.mjs';
import { SIZES, NAMES, ANCHORS } from './cimain_art/kit.mjs';

const id = process.argv[2] ?? 'tier2';
const frames = (await import(`./cimain_art/${id}.mjs`)).default();
for (const [n, [w, h]] of Object.entries(SIZES)) {
  const f = frames[n];
  if (!f || f.length !== h || f.some(r => r.length !== w)) throw new Error(`${id} ${n}: want ${w}x${h}`);
}
// the base sheet carries the anchors; a world's sheet lays its frames over them (sprites.js sheetOf)
writeSheet(id === 'tier2' ? 'cimain' : `${id}/cimain`, frames, [NAMES], id === 'tier2' ? { anchors: ANCHORS } : {});
