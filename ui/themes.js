// The themes beyond Ordo Administratum (theme.js), loaded from their data files: ui/art/themes.json lists them in
// order, each in its own folder ui/art/<id>/ with its theme.json (themepack.js: the format, the check) beside its art.
// A theme is parsed, never evaluated. Picked in Settings (adm.theme); the gallery renders any of them
// (node tools/sprite_sheet.mjs --theme <id>).
import { defineTheme, THEMES, WORLDS } from './theme.js';
import { checkTheme, themeOf } from './themepack.js';
import { ART, readArt } from './art.js';

// The folder of a theme's own files (theme.json, its art): where loadThemes read it from; else ui/art/<id>/, or
// ui/art/ itself for Ordo Administratum.
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
