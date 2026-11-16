// The themes beyond Ordo Administratum (theme.js), loaded from their data files: ui/art/themes.json lists them in
// order, each in its own folder ui/art/<id>/ with its theme.json (themepack.js: the format, the check) beside its art.
// A theme is parsed, never evaluated. Picked in Settings (adm.theme); the gallery renders any of them
// (node tools/sprite_sheet.mjs --theme <id>). Then the packs (loadPacks): themes from outside, never trusted.
import { defineTheme, setTheme, T, THEMES, WORLDS } from './theme.js';
import { checkTheme, scoped, themeOf } from './themepack.js';
import { ART, readArt } from './art.js';

// The folder of a theme's own files (theme.json, its art): where loadThemes read it from; else ui/art/<id>/, or
// ui/art/ itself for Ordo Administratum. A pack's theme: its pack's reader over its folder (art.js takes either).
const roots = new Map();
const shipped = id => (id === 'tier2' ? ART : new URL(`${id}/`, ART).href);
export const artRootOf = id => roots.get(id) ?? shipped(id);

// The ids a style may name as its base: Ordo Administratum and every world theme registered so far.
const bases = new Set(['tier2']);
const isId = id => typeof id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(id); // it names a folder
// Registers the themes of `ids` in order, each from theme.json in the folder rootOf(id); a style's base must come
// before it. The files are read all at once, then checked and registered one by one. Throws
// Error('theme <id>: <problem>') at the first problem, before registering that theme.
export async function loadThemes(ids, rootOf) {
  const at = ids.map(id => (isId(id) ? rootOf(id) : null));
  const reads = at.map(root => root && readArt('theme.json', 'json', root).then(json => ({ json }), e => ({ e })));
  for (const [i, id] of ids.entries()) {
    const fail = (problem, cause) => { throw new Error(`theme ${id}: ${problem}`, { cause }); };
    if (!isId(id)) fail('an id is lower-case letters, digits and -');
    if (THEMES[id]) fail('already registered');
    const { json, e } = await reads[i];
    if (e) fail(`cannot read ${id}/theme.json (${e.message})`, e);
    const bad = checkTheme(json, { bases, worlds: new Set(Object.keys(WORLDS)) });
    if (bad.length) fail(bad.join('; '));
    defineTheme(themeOf(id, json, json.base && THEMES[json.base]));
    roots.set(id, at[i]);
    if (!json.base) bases.add(id);
    if (json.worldName && !WORLDS[json.world]) WORLDS[json.world] = json.worldName;
  }
}

await loadThemes(await readArt('themes.json', 'json'), shipped);

// ---- packs ---------------------------------------------------------------------------------------------------------
// A pack: a folder of themes from outside (owner/repo, or local/<folder>), listed and read by the backend. Its themes
// are `<pack>:<folder>`, its worlds `<pack>:<world>` unless a shipped world's (themepack.js scoped). Those ids are
// registry keys only: a pack's files are read through its reader, by `<folder>/<file>`, never by a path built from an
// id. A pack's failure is recorded in PACKS and leaves that theme out; it never throws, never touches a shipped theme.
// PACKS: pack id -> { dir, themes: [{ id, name, world, style }], problems: [{ theme: folder | null, message }] }.
export const PACKS = new Map();
const packed = new Map(); // a pack's theme id -> { pack, folder }
export const packOf = id => packed.get(id);
const SHIPPED_BASES = new Set(bases), SHIPPED_WORLDS = new Set(Object.keys(WORLDS));
const isFolder = f => typeof f === 'string' && /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(f); // a plain name, no leading .
const say = e => { try { return String(e?.message ?? e); } catch { return 'unreadable error'; } };

// Registers the packs' themes after the shipped ones, each pack's world themes first, then its styles, in its order.
// `packs`: [{ id, dir, themes: [folder] }]; `read(dir, path)`: the bytes of `<folder>/<file>` in pack folder `dir`
// (a missing file rejects with code ENOENT). Call it before sprites.js and faces.js load: they read every theme's art
// once. Never throws.
export async function loadPacks(packs, read) {
  for (const pack of Array.isArray(packs) ? packs : []) {
    try { await loadPack(pack, read); } catch (e) { console.error(`theme pack: ${say(e)}`); }
  }
}
async function loadPack({ id, dir, themes }, read) {
  if (typeof id !== 'string' || !id || id.includes(':') || PACKS.has(id) || typeof dir !== 'string') throw new Error(`refused: ${JSON.stringify(id)}`);
  const entry = { dir, themes: [], problems: [] }, problem = (theme, message) => entry.problems.push({ theme, message });
  PACKS.set(id, entry);
  if (!Array.isArray(themes)) return problem(null, 'themes: must be a list of folders');
  const folders = [];
  for (const f of themes) {
    if (!isFolder(f)) problem(String(f), 'not a plain folder name');
    else if (folders.includes(f)) problem(f, 'listed twice');
    else folders.push(f);
  }
  const root = f => name => read(dir, `${f}/${name}`);
  const files = await Promise.all(folders.map(f => readArt('theme.json', 'json', root(f)).then(json => ({ f, json }), e => ({ f, e }))));
  const ok = files.filter(({ f, json, e }) => {
    if (e) problem(f, `cannot read ${f}/theme.json (${say(e)})`);
    else if (!json || typeof json !== 'object' || Array.isArray(json)) problem(f, `${f}/theme.json: theme: not an object`);
    else return true;
    return false;
  });
  const own = new Set(SHIPPED_BASES), worlds = new Set(Object.keys(WORLDS));
  for (const { f, json } of [...ok.filter(x => !x.json.base), ...ok.filter(x => x.json.base)]) {
    try {
      const s = scoped(id, f, json, { own: folders, shipped: [...SHIPPED_WORLDS] });
      if (THEMES[s.id]) { problem(f, 'already registered'); continue; }
      const bad = checkTheme(s.json, { bases: own, worlds });
      if (bad.length) { problem(f, `${f}/theme.json: ${bad.join('; ')}`); continue; }
      const t = defineTheme(themeOf(s.id, s.json, s.json.base && THEMES[s.json.base]));
      packed.set(s.id, { pack: id, folder: f });
      roots.set(s.id, root(f));
      if (!s.json.base) { own.add(s.id); worlds.add(s.json.world); }
      if (s.json.worldName && !WORLDS[s.json.world]) WORLDS[s.json.world] = s.json.worldName;
      entry.themes.push({ id: s.id, name: t.name, world: t.world, style: !!s.json.base });
    } catch (e) { delete THEMES[`${id}:${f}`]; packed.delete(`${id}:${f}`); problem(f, `${f}/theme.json: ${say(e)}`); }
  }
}

// Leaves a pack's theme out, with its reason on its pack's line: its styles in the pack go with it, and its world when
// no theme is left in it. Throws for a shipped theme (nothing changes).
export function dropTheme(id, message) {
  const p = packed.get(id);
  if (!p) throw new Error(`dropTheme: ${id} is not a pack's theme`);
  if (!THEMES[id]) return;
  const { world } = THEMES[id], entry = PACKS.get(p.pack);
  delete THEMES[id];
  entry.themes = entry.themes.filter(t => t.id !== id);
  entry.problems.push({ theme: p.folder, message: String(message) });
  for (const t of Object.values(THEMES)) if (t.artOf === id && packed.has(t.id)) dropTheme(t.id, `its base ${p.folder} is left out`);
  if (!SHIPPED_WORLDS.has(world) && !Object.values(THEMES).some(t => t.world === world)) delete WORLDS[world];
}

// A frame function behind the second net: when it throws under a pack's theme, that theme is left out and the hall
// goes back to Ordo Administratum (the next frame draws with it); under a shipped theme it throws as before.
export const guarded = draw => function (...args) {
  try { return draw.apply(this, args); } catch (e) {
    if (!packed.has(T.id)) throw e;
    console.error(`theme ${T.id}: ${say(e)}`);
    dropTheme(T.id, `drawing: ${say(e)}`);
    setTheme('tier2');
  }
};
