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

// A pack's sheet (a reader as root): its PNG at most PNG_MAX px a side (png.js reads it in the header, before inflating),
// its frames at most FRAMES_MAX and PNG_MAX² px in all, so a few bytes cannot claim the memory of the start. The largest
// shipped sheet is 502x570, the most frames in one 257.
const PNG_MAX = 2048, FRAMES_MAX = 1024;
const isWhole = n => Number.isInteger(n) && n >= 0;

// -> { frames: { name: rows[] }, anchors (art px), tiles (fill rules, room.js), meta (the JSON's whole meta) }. Throws on a colour outside the key palette or a
// half-transparent pixel, naming the file and the pixel, so a bad export fails loudly (and in the tests). `root`: the
// folder holding the sheet (a theme's own art: themes.js artRootOf; a pack's reader), default ui/art/.
export async function loadSheet(family, root) {
  const json = await readArt(`${family}.json`, 'json', root); // a sheet without frames (a world's face rects) has no PNG
  const fn = typeof root === 'function', png = `${family}.png`;
  const decode = b => (fn ? decodePng(b, { max: PNG_MAX }).catch(e => { throw new Error(`${png}: ${e.message}`, { cause: e }); }) : decodePng(b));
  if (fn && Object.keys(json.frames ?? {}).length > FRAMES_MAX) throw new Error(`${family}.json: over ${FRAMES_MAX} frames`);
  const [img, map] = Object.keys(json.frames ?? {}).length ? await Promise.all([readArt(png, 'bytes', root).then(decode), key()]) : [];
  const frames = {};
  // every rect whole numbers inside the image, at least 1x1, checked before a row is built
  let area = 0;
  for (const [name, { frame: r } = {}] of Object.entries(json.frames ?? {})) {
    if (!r || ![r.x, r.y, r.w, r.h].every(isWhole) || !r.w || !r.h || r.x + r.w > img.w || r.y + r.h > img.h)
      throw new Error(`${family}.json: frame '${name}' must be whole numbers inside the ${img.w}x${img.h} image, at least 1x1, not ${JSON.stringify(r)}`);
    if (fn && (area += r.w * r.h) > PNG_MAX * PNG_MAX) throw new Error(`${family}.json: frames over ${PNG_MAX * PNG_MAX} px in all`);
  }
  for (const [name, { frame: r }] of Object.entries(json.frames ?? {})) {
    frames[name] = Array.from({ length: r.h }, (_, j) => {
      let row = '';
      for (let i = 0; i < r.w; i++) {
        const x = r.x + i, y = r.y + j, o = (y * img.w + x) * 4, a = img.rgba[o + 3];
        if (a === 0) { row += '.'; continue; }
        const c = a === 255 && map.get(`${img.rgba[o]},${img.rgba[o + 1]},${img.rgba[o + 2]}`);
        if (!c) throw new Error(`${fn ? png : new URL(`${family}.png`, root ?? ART).href.replace(ART, 'art/')}: pixel ${x},${y} (${name}) is ${a < 255 ? 'half transparent' : `rgb(${img.rgba[o]},${img.rgba[o + 1]},${img.rgba[o + 2]}), not a key.gpl colour`}`);
        row += c;
      }
      return row;
    });
  }
  return { frames, anchors: json.meta?.anchors ?? {}, tiles: json.meta?.tiles ?? {}, meta: json.meta ?? {} };
}
