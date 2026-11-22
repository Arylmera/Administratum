// Writes a world's room computer (the rooms plan: one a room, where its shells run): node tools/roomcog_art.mjs <id>,
// or `all` for every world. Its frames come from tools/roomcog_art/<id>.mjs (default export: () => { <frame name>: rows
// of key.gpl chars }); tier2's is the base family (ui/art/roomcog.*), every other world's ui/art/<id>/roomcog.* (each
// world draws its own, listed in its theme.json art). Sizes, anchors and helpers: tools/roomcog_art/kit.mjs.
import { writeSheet } from './sheet_writer.mjs';
import { SIZES, NAMES, ANCHORS } from './roomcog_art/kit.mjs';

const WORLDS = ['tier2', 'forge', 'xenos', 'night', 'contrast', 'cyber', 'orbital', 'corpo', 'rain', 'matrix', 'synth', 'tower', 'vault', 'darwin'];
const arg = process.argv[2] ?? 'tier2';
for (const id of arg === 'all' ? WORLDS : [arg]) {
  const frames = (await import(`./roomcog_art/${id}.mjs`)).default();
  for (const [n, [w, h]] of Object.entries(SIZES)) {
    const f = frames[n];
    if (!f || f.length !== h || f.some(r => r.length !== w)) throw new Error(`${id} ${n}: want ${w}x${h}`);
  }
  // the base sheet carries the anchors; a world's sheet lays its frames over them (sprites.js sheetOf)
  writeSheet(id === 'tier2' ? 'roomcog' : `${id}/roomcog`, frames, [NAMES], id === 'tier2' ? { anchors: ANCHORS } : {});
}
