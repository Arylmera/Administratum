// Writes a world's Watchman sheets (Night Vigil): node tools/watch_art.mjs <base|cyber|orbital|tower|vault>. Frames come
// from tools/watch_art/<world>.mjs (default export: () => { flat: { 'up 0': rows, ..., ring }, iso: { 'E 0': rows, ...,
// ring }, flatAnchors: { feet, light }, isoAnchors: { feet, light } }, anchors in art px); base writes ui/art/watch.* and
// watch39.*, every other world ui/art/<world>/watch.* and watch39.*. Every frame is 32x36 art px of ui/art/key.gpl chars.
import { writeSheet, keyPalette } from './sheet_writer.mjs';

const W = 32, H = 36, WORLDS = ['base', 'cyber', 'orbital', 'tower', 'vault'];
const walk = dirs => dirs.flatMap(d => [0, 1, 2].map(i => `${d} ${i}`));
const FLAT = [...walk(['up', 'down', 'right']), 'ring'], ISO = [...walk(['E', 'W', 'S', 'N']), 'ring'];

const world = process.argv[2] ?? 'base';
if (!WORLDS.includes(world)) throw new Error(`usage: watch_art.mjs <${WORLDS.join('|')}>`);
const art = (await import(`./watch_art/${world}.mjs`)).default(), key = keyPalette();
const check = (set, names) => {
  for (const n of names) {
    const f = art[set][n];
    if (!f || f.length !== H || f.some(r => r.length !== W)) throw new Error(`${world} ${set} '${n}': want ${W}x${H}`);
    f.forEach((r, j) => { for (const c of r) if (c !== '.' && !key[c]) throw new Error(`${world} ${set} '${n}' row ${j}: '${c}' is no key.gpl char`); });
  }
};
check('flat', FLAT); check('iso', ISO);
const dir = world === 'base' ? '' : `${world}/`, app = 'tools/watch_art.mjs';
writeSheet(`${dir}watch`, art.flat, [walk(['down', 'up', 'right']), ['ring']], { app, anchors: art.flatAnchors });
writeSheet(`${dir}watch39`, art.iso, [walk(['E', 'W', 'S', 'N']), ['ring']], { app, anchors: art.isoAnchors });
console.log(`wrote ui/art/${dir}watch.png and watch39.png`);
