// Writes the 40k rank bodies into the base character sheets (spec 2026-11-21-rank-art):
//   node tools/rank_art.mjs <scribe|adept|scribe39|adept39>
// Reads the sheet's plain frames back from ui/art/<family>.png (any rank frame in it is dropped first, so a rerun
// gives the same sheet), adds the frames of tools/rank_art/<family>.mjs (default export: plain frames by name ->
// { frames: { '<rank> <frame>': rows }, anchors: { <rank>: { name: [x, y] } } }, art px, ui/art/key.gpl chars), checks
// each rank frame against its plain frame's size, and rewrites ui/art/<family>.png + .json: the plain frames in their
// rows as they were, then one row per rank. tools/map_to_art.mjs repacks only the plain frames: rerun this after it.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeSheet, keyPalette, artDir } from './sheet_writer.mjs';
import { ART } from '../ui/sprites.js';
import { RANKS, RANK_FAMILIES, rankPart } from '../ui/ranks.js';
import { SEATED_FRAME } from '../ui/gestures.js';

const family = process.argv[2];
if (!RANK_FAMILIES.includes(family)) throw new Error(`usage: rank_art.mjs <${RANK_FAMILIES.join('|')}>`);
const json = JSON.parse(fs.readFileSync(path.join(artDir, `${family}.json`), 'utf8')), sheet = ART.base[family];
const plainNames = Object.keys(json.frames).filter(n => !rankPart(n));
const plain = Object.fromEntries(plainNames.map(n => [n, sheet.frames[n]]));
const { frames: drawn, anchors: rankAnchors = {} } = (await import(`./rank_art/${family}.mjs`)).default(plain);

const key = keyPalette();
for (const [n, f] of Object.entries(drawn)) {
  const rp = rankPart(n), p = rp && plain[rp[1]];
  if (!p) throw new Error(`${family} '${n}': not '<rank> <a plain frame>'`);
  if (f.length !== p.length || f.some(r => r.length !== p[0].length)) throw new Error(`${family} '${n}': want ${p[0].length}x${p.length}`);
  f.forEach((r, j) => { for (const c of r) if (c !== '.' && !key[c]) throw new Error(`${family} '${n}' row ${j}: '${c}' is no key.gpl char`); });
}
// the plain frames' rows as the sheet has them (grouped by their y), then a row per rank, in the plain order
const plainRows = Object.values(Object.groupBy(plainNames, n => json.frames[n].frame.y));
const rankRows = RANKS.map(r => plainNames.map(n => `${r} ${n}`).filter(n => drawn[n])).filter(row => row.length);
const anchors = { ...Object.fromEntries(Object.entries(json.meta.anchors).filter(([k]) => !RANKS.includes(k))), ...rankAnchors };
const { W, H } = writeSheet(family, { ...plain, ...drawn }, [...plainRows, ...rankRows], { app: 'tools/rank_art.mjs', anchors, tiles: json.meta.tiles });
console.log(`wrote ui/art/${family}.png (${W}x${H}): ${plainNames.length} plain frames, ${Object.keys(drawn).length} rank frames`);
// the scribe's gestures are drawn from the bodies just written (a rank's own dropped above): gesture_art.mjs adds them back
if (SEATED_FRAME[family]) execFileSync(process.execPath, [fileURLToPath(new URL('./gesture_art.mjs', import.meta.url)), family], { stdio: 'inherit' });
