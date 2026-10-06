// Writes an art sheet: ui/art/<family>.png (frames packed in rows, in the key palette ui/art/key.gpl) and its JSON
// (Aseprite-style json-hash frames + meta: anchors, tile fill rules). Shared by tools/map_to_art.mjs and the theme art
// tools; family may be a theme's ('cyber/walls' -> ui/art/cyber/walls.png).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { png } from './png_write.mjs';

export const artDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ui', 'art');

// key.gpl: palette char -> [r, g, b]
export function keyPalette() {
  const key = {};
  for (const line of fs.readFileSync(path.join(artDir, 'key.gpl'), 'utf8').split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S)/);
    if (m) key[m[4]] = [+m[1], +m[2], +m[3]];
  }
  return key;
}

// frames: name -> rows of palette chars ('.' transparent); rows: [[name, ...], ...] the layout (a row wraps past 512
// art px, frames 1 px apart); meta: { anchors?, tiles? }.
export function writeSheet(family, frames, rows, meta = {}) {
  const key = keyPalette();
  const wrapped = rows.flatMap(row => {
    const out = [[]];
    let w = 0;
    for (const n of row) {
      const fw = Math.max(...frames[n].map(r => r.length));
      if (w && w + fw > 512) { out.push([]); w = 0; }
      out.at(-1).push(n); w += fw + 1;
    }
    return out;
  });
  const rect = {};
  let y = 0, W = 0;
  for (const row of wrapped) {
    let x = 0, h = 0;
    for (const name of row) {
      const f = frames[name], w = Math.max(...f.map(r => r.length));
      rect[name] = { x, y, w, h: f.length };
      x += w + 1; h = Math.max(h, f.length);
    }
    W = Math.max(W, x - 1); y += h + 1;
  }
  const H = y - 1, cells = new Array(W * H).fill(null);
  for (const [name, r] of Object.entries(rect)) frames[name].forEach((row, j) => {
    for (let i = 0; i < row.length; i++) if (row[i] !== '.') {
      if (!key[row[i]]) throw new Error(`${family} ${name}: char '${row[i]}' has no key colour`);
      cells[(r.y + j) * W + r.x + i] = row[i];
    }
  });
  const file = path.join(artDir, `${family}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png(W, H, (x, yy) => { const c = cells[yy * W + x]; return c ? [...key[c], 255] : [0, 0, 0, 0]; }));
  const json = { frames: Object.fromEntries(Object.entries(rect).map(([n, r]) => [n, { frame: r }])),
    meta: { app: meta.app ?? 'tools/sheet_writer.mjs', image: `${path.basename(family)}.png`, format: 'RGBA8888', size: { w: W, h: H }, palette: 'key.gpl',
      anchors: meta.anchors ?? {}, ...(meta.tiles && { tiles: meta.tiles }) } };
  fs.writeFileSync(path.join(artDir, `${family}.json`), JSON.stringify(json, null, 2) + '\n');
  return { W, H, frames: Object.keys(rect).length };
}
