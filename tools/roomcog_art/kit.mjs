// Shared sizes and helpers for the rooms plan's room computer (tools/roomcog_art.mjs): a small floor-standing cogitator
// bank, one a room (scene.js drawComputers), drawn by every world. Frames are rows of key.gpl chars, '.' clear, art px;
// the hall draws it 16 x 12 logical, its bottom on the room's first computer spot.
// The envelope every world keeps (ui/art/faces.json ROOMCOG builds the 39° volume from it): rows 0..5 the crest (a
// thin box set back on the body), rows 6..23 the body and its plinth, the screen's glass in SCREEN (recessed in 39°).
export const W = 32, H = 24;
export const NAMES = ['ROOMCOG', 'ROOMCOG.off']; // lit (someone runs code there), unlit
export const SIZES = Object.fromEntries(NAMES.map(n => [n, [W, H]]));
export const SCREEN = [10, 8, 12, 8]; // x, y, w, h
// light: where the screen's glow sits; shadow: [dx, dy, w, h] the contact shadow under the plinth.
export const ANCHORS = { ROOMCOG: { light: [16, 12], screen: SCREEN, shadow: [2, 24, 28, 2] } };

// A symmetric frame from its left half (16 chars a row): each row and its mirror.
export function sym(left) {
  left.forEach((r, j) => { if (r.length !== W / 2) throw new Error(`left half row ${j}: ${r.length} chars, want ${W / 2}`); });
  return left.map(r => r + [...r].reverse().join(''));
}
// Lays rows `over` on `rows` with its top-left at (x, y); '.' in over keeps what is under it.
export const put = (rows, x, y, over) => rows.map((r, j) => {
  const o = over[j - y];
  return o ? [...r].map((c, i) => (o[i - x] && o[i - x] !== '.' ? o[i - x] : c)).join('') : r;
});
// Several patches in turn: [[x, y, rows], ...].
export const patch = (rows, list) => list.reduce((r, [x, y, o]) => put(r, x, y, o), rows);
// The two frames: the unlit drawing, and the same with the lit patches (the screen's writing, the lamps) laid on it.
export const frames = (off, lit) => ({ ROOMCOG: patch(off, lit), 'ROOMCOG.off': off });
