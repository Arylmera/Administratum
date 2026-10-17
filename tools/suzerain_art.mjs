// Writes a world's Suzerain sheet: node tools/suzerain_art.mjs <theme id>. Its frames come from tools/suzerain_art/<id>.mjs
// (default export: () => { name: rows of key.gpl chars }); tier2's is the base family (ui/art/suzerain.*), every other
// world's ui/art/<id>/suzerain.* (its accent themes use it through artOf). Sizes: ui/layout.js SUZERAIN_SIZES.
import { sizedSheet } from './sheet_writer.mjs';
import { SUZERAIN_SIZES } from '../ui/layout.js';

const id = process.argv[2] ?? 'tier2';
const frames = (await import(`./suzerain_art/${id}.mjs`)).default();
sizedSheet(id === 'tier2' ? 'suzerain' : `${id}/suzerain`, id, frames, SUZERAIN_SIZES);
