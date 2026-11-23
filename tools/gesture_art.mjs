// Writes the 40k scribe's gesture frames (ui/gestures.js) into its base sheets, plain and per rank:
//   node tools/gesture_art.mjs <scribe|scribe39>
// Each is the seated frame it replaces, its hood moved and its own two mechadendrites (the `arm` art) drawn in:
//   think    the hood bowed, the right claw raised to its side
//   wonder   the hood leaning over, both claws half up
//   stretch  the hood sunk, both claws up
// Reruns give the same sheet (old gesture frames are dropped first). tools/rank_art.mjs runs it; run it after map_to_art.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { writeSheet, artDir } from './sheet_writer.mjs';
import { ART } from '../ui/sprites.js';
import { GESTURES, GESTURE_FRAMES, SEATED_FRAME } from '../ui/gestures.js';
import { RANKS } from '../ui/ranks.js';

const family = process.argv[2];
if (!SEATED_FRAME[family]) throw new Error('usage: gesture_art.mjs <scribe|scribe39>');
const json = JSON.parse(fs.readFileSync(path.join(artDir, `${family}.json`), 'utf8')), all = ART.base[family].frames;
const isGesture = n => GESTURE_FRAMES[family].some(f => n === f || n.endsWith(` ${f}`));
const names = Object.keys(json.frames).filter(n => !isGesture(n)), frames = Object.fromEntries(names.map(n => [n, all[n]]));

const HEAD = 18; // the hood's rows, above the shoulder seam
const bow = (f, n) => [...Array(n).fill('.'.repeat(f[0].length)), ...f.slice(0, HEAD - n), ...f.slice(HEAD)];
const left = (row, n) => row.slice(n) + '.'.repeat(n);
const lean = f => f.map((r, y) => (y < HEAD / 3 ? left(r, 2) : y < 2 * HEAD / 3 ? left(r, 1) : r));
const over = (f, part, x, y) => f.map((r, j) => {
  const p = part[j - y];
  return p ? [...r].map((c, i) => (p[i - x] && p[i - x] !== '.' ? p[i - x] : c)).join('') : r;
});
const mirror = m => m.map(r => [...r].reverse().join(''));
const armR = frames.arm, armL = frames.armL ?? mirror(armR), up = m => [...m].reverse();
const seat = SEATED_FRAME[family], W = frames[seat][0].length;
const R = (family === 'scribe39' ? 28 : 32) - armR[0].length; // the arm's west edge: against the body's east one
const draw = {
  think: f => over(over(bow(f, 1), up(armR), R, 8), armL, 0, 18),
  wonder: f => over(over(lean(f), up(armR), R, 10), up(armL), 0, 10),
  stretch: f => over(over(bow(f, 2), up(armR), R, 3), up(armL), 0, 3),
};
const rows = Object.values(Object.groupBy(names, n => json.frames[n].frame.y));
let made = 0;
for (const r of ['', ...RANKS]) {
  const pre = r ? `${r} ` : '', body = frames[pre + seat];
  if (!body) continue;
  rows.push(GESTURES.map((g, i) => {
    const n = pre + GESTURE_FRAMES[family][i];
    frames[n] = draw[g](body);
    if (frames[n].length !== body.length || frames[n].some(q => q.length !== W)) throw new Error(`${n}: size`);
    made++;
    return n;
  }));
}
writeSheet(family, frames, rows, { app: json.meta.app, anchors: json.meta.anchors, tiles: json.meta.tiles });
console.log(`wrote ui/art/${family}.png with ${made} gesture frames`);
