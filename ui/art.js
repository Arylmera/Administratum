// Art files: ui/art/<family>.png (a sprite sheet drawn in the key palette, ui/art/key.gpl) and <family>.json
// (Aseprite-style json-hash: frame rects, plus meta.anchors in art px). A sheet loads into the same text rows the
// maps in sprites.js use, so themes and the sprite cache work on both alike. tools/map_to_art.mjs made the first ones.
import { decodePng } from './png.js';

const node = typeof window === 'undefined';
export const ART = new URL('./art/', import.meta.url).href; // the art folder, ui/art/
// A file of an art folder (`root`: a folder URL, default ui/art/; or a pack's reader, name => Promise<Uint8Array>), as
// bytes or parsed JSON. Works under Node (fs) and in the page (fetch); an error names the file, with its theme's
// folder when it is under ui/art/ (a pack's reader names it itself: themes.js).
export async function readArt(name, as, root = ART) {
  const fn = typeof root === 'function', url = fn ? null : new URL(name, root);
  const label = url?.href.startsWith(ART) ? url.href.slice(ART.length) : name;
  const json = buf => {
    try { return JSON.parse(new TextDecoder().decode(buf)); } catch (e) { throw new Error(`${label}: ${e.message}`, { cause: e }); }
  };
  if (fn) { // a pack's file: only bytes, never anything to run
    const buf = await Promise.resolve().then(() => root(name)).catch(e => { throw Object.assign(new Error(`${name}: ${e?.message ?? e}`, { cause: e }), { code: e?.code }); });
    if (!(buf instanceof Uint8Array)) throw new Error(`${name}: not bytes`);
    return as === 'json' ? json(buf) : buf;
  }
  if (node) {
    const { readFile } = await import('node:fs/promises');
    const buf = await readFile(url);
    return as === 'json' ? json(buf) : new Uint8Array(buf);
  }
  const r = await fetch(url, { credentials: 'same-origin' });
  if (!r.ok) throw new Error(`${label}: HTTP ${r.status}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  // the installed app (Tauri) answers a missing file with index.html, status 200: that is a 404 too
  if (/^<!doctype/i.test(new TextDecoder().decode(buf.subarray(0, 9)))) throw new Error(`${label}: HTTP 404`);
  return as === 'json' ? json(buf) : buf;
}

// key.gpl -> 'r,g,b' -> palette char (the first letter of each colour's name)
let keyP = null;
const key = () => (keyP ??= readArt('key.gpl').then(bytes => {
  const text = new TextDecoder().decode(bytes), map = new Map();
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S)/);
    if (m) map.set(`${m[1]},${m[2]},${m[3]}`, m[4]);
  }
  return map;
}));

// A pack's PNG (a reader as root) at most PNG_MAX px a side, checked in its header before it is inflated: a small file
// cannot claim a buffer the size of the screen many times over. The largest shipped sheet is 502x570.
const PNG_MAX = 2048;
const sized = (b, root, file) => {
  const at = o => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0, w = at(16), h = at(20);
  if (typeof root === 'function' && b.length >= 24 && (w > PNG_MAX || h > PNG_MAX)) throw new Error(`${file}: ${w}x${h} px, at most ${PNG_MAX} a side`);
  return b;
};

// -> { frames: { name: rows[] }, anchors (art px), tiles (fill rules, room.js), meta (the JSON's whole meta) }. Throws on a colour outside the key palette or a
// half-transparent pixel, naming the file and the pixel, so a bad export fails loudly (and in the tests). `root`: the
// folder holding the sheet (a theme's own art: themes.js artRootOf; a pack's reader), default ui/art/.
export async function loadSheet(family, root) {
  const json = await readArt(`${family}.json`, 'json', root); // a sheet without frames (a world's face rects) has no PNG
  const [img, map] = Object.keys(json.frames ?? {}).length ? await Promise.all([readArt(`${family}.png`, 'bytes', root).then(b => decodePng(sized(b, root, `${family}.png`))), key()]) : [];
  const frames = {};
  for (const [name, { frame: r }] of Object.entries(json.frames ?? {})) {
    frames[name] = Array.from({ length: r.h }, (_, j) => {
      let row = '';
      for (let i = 0; i < r.w; i++) {
        const x = r.x + i, y = r.y + j, o = (y * img.w + x) * 4, a = img.rgba[o + 3];
        if (a === 0) { row += '.'; continue; }
        const c = a === 255 && map.get(`${img.rgba[o]},${img.rgba[o + 1]},${img.rgba[o + 2]}`);
        if (!c) throw new Error(`${typeof root === 'function' ? `${family}.png` : new URL(`${family}.png`, root ?? ART).href.replace(ART, 'art/')}: pixel ${x},${y} (${name}) is ${a < 255 ? 'half transparent' : `rgb(${img.rgba[o]},${img.rgba[o + 1]},${img.rgba[o + 2]}), not a key.gpl colour`}`);
        row += c;
      }
      return row;
    });
  }
  return { frames, anchors: json.meta?.anchors ?? {}, tiles: json.meta?.tiles ?? {}, meta: json.meta ?? {} };
}
