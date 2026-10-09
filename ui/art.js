// Art files: ui/art/<family>.png (a sprite sheet drawn in the key palette, ui/art/key.gpl) and <family>.json
// (Aseprite-style json-hash: frame rects, plus meta.anchors in art px). A sheet loads into the same text rows the
// maps in sprites.js use, so themes and the sprite cache work on both alike. tools/map_to_art.mjs made the first ones.
import { decodePng } from './png.js';

const node = typeof window === 'undefined';
async function read(name, as) {
  const url = new URL(`./art/${name}`, import.meta.url);
  if (node) {
    const { readFile } = await import('node:fs/promises');
    const buf = await readFile(url);
    return as === 'json' ? JSON.parse(buf.toString('utf8')) : new Uint8Array(buf);
  }
  const r = await fetch(url, { credentials: 'same-origin' });
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  // the installed app (Tauri) answers a missing file with index.html, status 200: that is a 404 too
  if (/^<!doctype/i.test(new TextDecoder().decode(buf.subarray(0, 9)))) throw new Error(`${name}: HTTP 404`);
  return as === 'json' ? JSON.parse(new TextDecoder().decode(buf)) : buf;
}

// key.gpl -> 'r,g,b' -> palette char (the first letter of each colour's name)
let keyP = null;
const key = () => (keyP ??= read('key.gpl').then(bytes => {
  const text = new TextDecoder().decode(bytes), map = new Map();
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S)/);
    if (m) map.set(`${m[1]},${m[2]},${m[3]}`, m[4]);
  }
  return map;
}));

// -> { frames: { name: rows[] }, anchors (art px), tiles (fill rules, room.js), meta (the JSON's whole meta) }. Throws on a colour outside the key palette or a
// half-transparent pixel, naming the file and the pixel, so a bad export fails loudly (and in the tests).
export async function loadSheet(family) {
  const json = await read(`${family}.json`, 'json'); // a sheet without frames (a world's face rects) has no PNG
  const [img, map] = Object.keys(json.frames ?? {}).length ? await Promise.all([read(`${family}.png`).then(decodePng), key()]) : [];
  const frames = {};
  for (const [name, { frame: r }] of Object.entries(json.frames ?? {})) {
    frames[name] = Array.from({ length: r.h }, (_, j) => {
      let row = '';
      for (let i = 0; i < r.w; i++) {
        const x = r.x + i, y = r.y + j, o = (y * img.w + x) * 4, a = img.rgba[o + 3];
        if (a === 0) { row += '.'; continue; }
        const c = a === 255 && map.get(`${img.rgba[o]},${img.rgba[o + 1]},${img.rgba[o + 2]}`);
        if (!c) throw new Error(`art/${family}.png: pixel ${x},${y} (${name}) is ${a < 255 ? 'half transparent' : `rgb(${img.rgba[o]},${img.rgba[o + 1]},${img.rgba[o + 2]}), not a key.gpl colour`}`);
        row += c;
      }
      return row;
    });
  }
  return { frames, anchors: json.meta?.anchors ?? {}, tiles: json.meta?.tiles ?? {}, meta: json.meta ?? {} };
}
