// One-off for the move of the themes to data files (docs/superpowers/specs/2026-11-15-theme-packs-design.md),
// deletable once merged: writes ui/art/<id>/theme.json for every theme beyond Ordo Administratum from the JS themes of
// a git ref, and ui/art/themes.json (their order), then proves each one resolves exactly as before.
//   node tools/themes_to_packs.mjs --from <git ref>           write the files, exit 0 only if every theme is identical
//   node tools/themes_to_packs.mjs --from <git ref> --check   the same proof on the files as they are, nothing written
// An accent (a style of Neon Grid) recolours its base's resolved look where the old accent() recoloured only what the
// base declared: every value where the two differ is written into the accent's file as an override.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { resolve } from '../ui/theme.js';
import { checkTheme, themeOf } from '../ui/themepack.js';

const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const ref = arg('from'), check = process.argv.includes('--check');
if (!ref) throw new Error('usage: node tools/themes_to_packs.mjs --from <git ref> [--check]');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORDER = ['forge', 'xenos', 'night', 'contrast', 'cyber', 'orbital', 'corpo', 'rain', 'matrix', 'synth', 'tower', 'vault', 'darwin', 'breakingbad'];
const RANGES = { pink: [300, 345], violet: [260, 300], night: [210, 260], cyan: [165, 210] }; // the old BANDS
const KEYS = ['format', 'name', 'world', 'base', 'bands', 'art', 'px', 'sash', 'rank', 'ink', 'light', 'ui', 'text', 'notes'];
const PARTS = ['px', 'rank', 'ink', 'light', 'ui']; // where an accent's overrides go

// 1-3. The old modules of <ref>, accent() made to record its arguments, imported from a temporary folder.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-themes-'));
let old, authored, src;
try {
  fs.mkdirSync(path.join(tmp, 'ui'));
  for (const f of ['theme.js', 'themes.js', 'hallplan.js'])
    fs.writeFileSync(path.join(tmp, 'ui', f), execFileSync('git', ['show', `${ref}:ui/${f}`], { cwd: root, encoding: 'utf8' }));
  const file = path.join(tmp, 'ui', 'themes.js'), head = 'function accent(base, { bands, text, ...t }) {';
  src = fs.readFileSync(file, 'utf8');
  if (src.split('\n').filter(l => l === head).length !== 1) throw new Error(`themes.js of ${ref}: "${head}" not found exactly once`);
  fs.writeFileSync(file, src.replace(head, `${head}\n  globalThis.ACCENTS.push({ id: t.id, base: base.id, bands, text, rest: t });`));
  globalThis.ACCENTS = [];
  const was = await import(pathToFileURL(path.join(tmp, 'ui', 'theme.js')));
  await import(pathToFileURL(file));
  const ids = Object.keys(was.THEMES).filter(id => id !== 'tier2');
  assert.deepEqual(ids, ORDER, 'the themes of the ref, in order');
  old = Object.fromEntries(ORDER.map(id => [id, { look: was.resolve(was.THEMES[id]), theme: was.THEMES[id] }]));
  const accents = Object.fromEntries(globalThis.ACCENTS.map(a => [a.id, a]));
  authored = Object.fromEntries(ORDER.map(id => [id, accents[id] ?? was.THEMES[id]]));
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

// 4. A theme's notes: the // lines just above its call (over any helper constants in between), and its art: line's
// trailing comment.
const lines = src.split('\n');
function notesOf(id) {
  const at = lines.findIndex(l => l.includes(`id: '${id}'`));
  let i = at; while (!/^(const \w+ = )?(defineTheme|accent)\(/.test(lines[i])) i--;
  const call = i, above = [];
  for (i--; i >= 0 && lines[i].trim() && !lines[i].startsWith('//'); i--);
  for (; i >= 0 && lines[i].startsWith('//'); i--) above.unshift(lines[i].replace(/^\/\/ ?/, ''));
  const art = lines.slice(call).find(l => /\bart: \[/.test(l))?.match(/\],?\s*\/\/ ?(.*)$/)?.[1];
  return [above.join(' '), art].filter(Boolean).join(' ');
}
const ordered = o => Object.fromEntries(KEYS.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
function jsonOf(id) {
  const a = authored[id], notes = notesOf(id);
  if (a.rest) {
    const { id: _, ...rest } = a.rest, bands = Object.entries(a.bands).map(([n, [H, S, L]]) => ({ hue: RANGES[n], to: H, sat: S, light: L }));
    return ordered({ format: 1, ...rest, base: a.base, bands, text: a.text, notes });
  }
  const { id: _, ...t } = a;
  for (const k of Object.keys(t)) if (!KEYS.includes(k)) throw new Error(`${id}: ${k} has no place in a theme.json`);
  return ordered({ format: 1, ...t, notes });
}

// 5. An accent's overrides: what its resolved look still differs in from the old one, part by part.
const json = Object.fromEntries(ORDER.map(id => [id, jsonOf(id)]));
const built = id => themeOf(id, json[id], json[id].base && built(json[id].base));
for (const id of ORDER.filter(id => json[id].base)) {
  const now = resolve(built(id)), was = old[id].look, j = json[id], count = {};
  const put = (part, k, v) => { (j[part] ??= {})[k] = v; count[part] = (count[part] ?? 0) + 1; };
  for (const part of ['px', 'ink', 'light', 'ui'])
    for (const [k, v] of Object.entries(was[part])) if (!isDeepStrictEqual(now[part][k], v)) put(part, k, v);
  for (const [c, { robe, adept }] of Object.entries(was.rank)) for (const [p, o] of Object.entries({ robe, adept }))
    for (const [k, v] of Object.entries(o)) if (now.rank[c][p][k] !== v) {
      ((j.rank ??= {})[c] ??= {})[p] ??= {}; j.rank[c][p][k] = v; count.rank = (count.rank ?? 0) + 1;
    }
  json[id] = ordered(j);
  const total = Object.values(count).reduce((a, b) => a + b, 0);
  console.log(`${id}: ${total} overrides${total ? ` (${PARTS.filter(p => count[p]).map(p => `${p} ${count[p]}`).join(', ')})` : ''}`);
}

// 6. The files: two-space JSON, a short run of plain values (a band, a hue range, a window's colours) on one line.
const pretty = (v, pad = '') => {
  if (!v || typeof v !== 'object') return JSON.stringify(v);
  const arr = Array.isArray(v), items = Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => (arr ? '' : JSON.stringify(k) + ': ') + pretty(x, pad + '  '));
  const flat = arr ? `[${items.join(', ')}]` : `{ ${items.join(', ')} }`;
  if (!items.length) return arr ? '[]' : '{}';
  if (!items.some(s => s.includes('\n')) && Object.values(v).every(x => !x || typeof x !== 'object' || Array.isArray(x)) && pad.length + flat.length <= 100) return flat;
  return (arr ? '[' : '{') + items.map(s => `\n${pad}  ${s}`).join(',') + `\n${pad}` + (arr ? ']' : '}');
};
const files = { 'ui/art/themes.json': ORDER, ...Object.fromEntries(ORDER.map(id => [`ui/art/${id}/theme.json`, json[id]])) };
const text = Object.fromEntries(Object.entries(files).map(([f, v]) => [f, pretty(v) + '\n']));
let bad = 0;
for (const [f, t] of Object.entries(text)) {
  const at = path.join(root, f);
  if (!check) { fs.mkdirSync(path.dirname(at), { recursive: true }); fs.writeFileSync(at, t); }
  else if (!fs.existsSync(at) || fs.readFileSync(at, 'utf8') !== t) { console.log(`${f}: differs from what ${ref} gives`); bad++; }
}

// 7. The proof, on the files as written (parsed back): checked, built, resolved as before.
const read = f => JSON.parse(fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f), 'utf8') : 'null');
assert.deepEqual(read('ui/art/themes.json'), ORDER, 'ui/art/themes.json');
const disk = Object.fromEntries(ORDER.map(id => [id, read(`ui/art/${id}/theme.json`)]));
const bases = new Set(['tier2', ...ORDER.filter(id => disk[id] && !disk[id].base)]);
const make = id => themeOf(id, disk[id], disk[id].base && make(disk[id].base));
for (const id of ORDER) {
  try {
    assert.deepEqual(checkTheme(disk[id], { bases }), [], 'checkTheme');
    const b = make(id), o = old[id].theme;
    assert.deepStrictEqual(resolve(b), old[id].look);
    assert.deepStrictEqual({ world: b.world, art: b.art, artOf: b.artOf }, { world: o.world, art: o.art, artOf: o.artOf });
    console.log(`${id}: identical`);
  } catch (e) { console.log(`${id}: DIFFERS ${e.message.split('\n').slice(0, 12).join('\n  ')}`); bad++; }
}
if (bad) { console.log(`${bad} problems`); process.exit(1); }
console.log(`${ORDER.length} themes identical`);
