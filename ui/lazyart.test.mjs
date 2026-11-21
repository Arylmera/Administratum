// Lazy theme art (F1): the page loads the base sheets and the active theme's own at start; another theme's sheets only
// when it is switched to. A counting fetch stub stands in for the page's loading path (art.js reads through fetch when
// there is a window), serving the files from disk.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const asked = [];
globalThis.window = {}; // art.js reads through fetch in a page
globalThis.fetch = async url => {
  asked.push(String(url.href ?? url));
  try {
    const buf = fs.readFileSync(fileURLToPath(url));
    return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  } catch { return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }; }
};
// the sheets asked for, by folder: '' the base art, 'cyber' a theme's own (theme.json and key.gpl are not sheets)
const folders = () => {
  const out = {};
  for (const u of asked) {
    const m = u.match(/\/ui\/art\/(?:([a-z0-9-]+)\/)?([a-z0-9-]+)\.(?:json|png)$/);
    if (m && m[2] !== 'theme' && m[2] !== 'themes') (out[m[1] ?? ''] ??= []).push(m[2]);
  }
  return out;
};

const { setTheme, switchTheme, T, THEMES } = await import('./theme.js');
await import('./themes.js'); // registers the themes (ui/art/themes.json)
setTheme('cyber');
asked.length = 0;
const sprites = await import('./sprites.js');
await import('./faces.js');

const start = folders();
console.log(`start, cyber active: ${asked.length} requests, folders: ${Object.keys(start).map(k => k || 'base').join(', ')}`);
assert.deepEqual(Object.keys(start).sort(), ['', 'cyber'], 'start: the base sheets and the active theme\'s own, no other theme\'s');
assert.ok(start[''].includes('scribe') && start[''].includes('faces'), 'start: the base sheets');
assert.ok(asked.length < 150, `start: ${asked.length} requests`);
assert.ok(!sprites.ART.themed.vault, 'vault\'s art is not loaded');

// a switch waits for the art: the old theme stays until it is ready
asked.length = 0;
const wait = switchTheme('vault');
assert.equal(T.id, 'cyber', 'switch: still the old theme while the art loads');
await wait;
assert.equal(T.id, 'vault');
assert.deepEqual(Object.keys(folders()), ['vault'], 'switch: only the new theme\'s sheets are asked for');
assert.ok(Object.values(sprites.SHEET_OF).some(s => s.startsWith('vault/')), 'switch: the hall reads the new theme\'s art');
const { sheetOf } = await import('./faces.js');
assert.ok(sheetOf('DESK', sprites.MAPS.DESK) !== undefined, 'switch: face sheets answer for the new theme');

// back to a loaded theme: nothing asked for
asked.length = 0;
await switchTheme('cyber');
assert.equal(T.id, 'cyber');
assert.equal(asked.length, 0, 'switch back: no request');

// the last switch wins when two overlap
const a = switchTheme('night'), b = switchTheme('vault');
await Promise.all([a, b]);
assert.equal(T.id, 'vault', 'overlapping switches: the last one wins');

// the explicit load-all (the tools, the gallery)
await sprites.loadAllArt();
for (const th of Object.values(THEMES)) if (th.art?.length) assert.ok(sprites.ART.themed[th.id], `loadAllArt: ${th.id}`);
console.log('lazyart.test.mjs ok');
