// The back wall's window/hanging art: which sheet draws it (the default, or a theme's own tall art) and where the
// window's glass ends. Shared by scene.js (drawStatic, the static lights) and lighting.js (where the daylight beam
// starts), so neither needs to import the other.
import { MAPS, SHEET_OF, RES } from './sprites.js';

export const WIN_Y = 10; // every window's top
const dirOf = n => SHEET_OF[n].replace(/[^/]*$/, ''); // 'cyber/' or '' (the default art)
// win: the window's frame, drawn at (x + winDx, WIN_Y) for a 16 px window slot x (scene.js propsOf windows), its
// glass ending at winBottom (lighting.js starts the beams there). A theme without its own tall window/hanging
// (dirOf mismatch) falls back to the short WINDOW/BANNER, as before. hangB: the second hanging design (every other
// hanging, propsOf), the first one again where the theme's art has no HANGING_B of its own. shelfB: the name of the
// second shelf design (every other back-wall shelf, the same carcass and 39° faces as SHELF), gated the same way.
export function wallArt() {
  const tallWin = dirOf('WINDOW_TALL') === dirOf('WINDOW'), tallHang = dirOf('HANGING') === dirOf('BANNER');
  const win = MAPS[tallWin ? 'WINDOW_TALL' : 'WINDOW'];
  const hangB = MAPS[tallHang && MAPS.HANGING_B && dirOf('HANGING_B') === dirOf('HANGING') ? 'HANGING_B' : 'HANGING'];
  const shelfB = MAPS.SHELF_B && dirOf('SHELF_B') === dirOf('SHELF') ? 'SHELF_B' : 'SHELF';
  return { win, winDx: (16 - win[0].length / RES) / 2, winBottom: WIN_Y + win.length / RES, tallHang, hangB, shelfB };
}
