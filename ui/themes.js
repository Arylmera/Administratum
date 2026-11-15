// The themes beyond Ordo Administratum (theme.js), loaded from their data files: ui/art/themes.json lists them in
// order, each in its own folder ui/art/<id>/ with its theme.json (themepack.js: the format, the check) beside its art.
// A theme is parsed, never evaluated. Picked in Settings (adm.theme); the gallery renders any of them
// (node tools/sprite_sheet.mjs --theme <id>).
import { defineTheme, THEMES, WORLDS } from './theme.js';
import { checkTheme, themeOf } from './themepack.js';
import { readArt } from './art.js';

const ART = new URL('./art/', import.meta.url).href;
// The folder of a theme's own files (theme.json, its art): ui/art/<id>/, or ui/art/ itself for Ordo Administratum.
export const artRootOf = id => (id === 'tier2' ? ART : new URL(`${id}/`, ART).href);

// The ids a style may name as its base: Ordo Administratum and every world theme registered so far.
const bases = new Set(['tier2']);
// Registers the themes of `ids` in order, each from theme.json in the folder rootOf(id); a style's base must come
// before it. Throws Error('theme <id>: <problem>') at the first problem, before registering that theme.
export async function loadThemes(ids, rootOf) {
  for (const id of ids) {
    const fail = (problem, cause) => { throw new Error(`theme ${id}: ${problem}`, { cause }); };
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(id)) fail('an id is lower-case letters, digits and -'); // it names a folder
    if (THEMES[id]) fail('already registered');
    const json = await readArt('theme.json', 'json', rootOf(id)).catch(e => fail(`cannot read ${id}/theme.json (${e.message})`, e));
    const bad = checkTheme(json, { bases });
    if (bad.length) fail(bad.join('; '));
    defineTheme(themeOf(id, json, json.base && THEMES[json.base]));
    if (!json.base) bases.add(id);
    if (json.worldName && !WORLDS[json.world]) WORLDS[json.world] = json.worldName;
  }
}

await loadThemes(await readArt('themes.json', 'json'), artRootOf);
