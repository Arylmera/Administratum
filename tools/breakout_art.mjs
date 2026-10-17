// Writes a theme's break-out room sheet: node tools/breakout_art.mjs <theme id>. Its frames come from
// tools/breakout_art/<id>.mjs (default export: () => { name: rows of key.gpl chars }); tier2's is the base family
// (ui/art/breakout.*), every other theme's ui/art/<id>/breakout.*. Sizes: ui/layout.js BREAKOUT_SIZES.
import { sizedSheet } from './sheet_writer.mjs';
import { BREAKOUT_SIZES } from '../ui/layout.js';

const id = process.argv[2] ?? 'tier2';
const frames = (await import(`./breakout_art/${id}.mjs`)).default();
sizedSheet(id === 'tier2' ? 'breakout' : `${id}/breakout`, id, frames, BREAKOUT_SIZES);
