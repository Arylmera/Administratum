// Writes a theme's break-out room sheet: node tools/breakout_art.mjs <theme id>. Its frames come from
// tools/breakout_art/<id>.mjs (default export: () => { name: rows of key.gpl chars }); tier2's is the base family
// (ui/art/breakout.*), every other theme's ui/art/<id>/breakout.*. Sizes: ui/layout.js BREAKOUT_SIZES.
import { writeSheet } from './sheet_writer.mjs';
import { BREAKOUT_SIZES } from '../ui/layout.js';

const id = process.argv[2] ?? 'tier2';
const frames = (await import(`./breakout_art/${id}.mjs`)).default();
for (const [n, [w, h]] of Object.entries(BREAKOUT_SIZES)) {
  const f = frames[n];
  if (!f || f.length !== h || f.some(r => r.length !== w)) throw new Error(`${id} ${n}: want ${w}x${h}`);
}
writeSheet(id === 'tier2' ? 'breakout' : `${id}/breakout`, frames, [Object.keys(BREAKOUT_SIZES)]);
