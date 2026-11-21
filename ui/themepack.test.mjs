import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TIER_II, resolve } from './theme.js';
import { recolour, checkTheme, themeOf, scoped, FONTS, LOCKED } from './themepack.js';

// recolour: the arithmetic of the old rehue, pinned on five inputs (computed with the old themes.js code)
const bands = [{ hue: [300, 345], to: 356, sat: 1, light: -0.04 }, { hue: [210, 260], to: 0, sat: 0.12 }];
assert.equal(recolour('#ff2bd6', bands), '#ff1726');
assert.equal(recolour('#1a1f3a', bands), '#2c2828');
assert.equal(recolour('rgba(255,43,214,.5)', bands), 'rgba(255,23,38,.5)');
assert.equal(recolour('20,24,60', bands), '42,38,38');
assert.equal(recolour('#7cff9e', bands), '#7cff9e', 'out of every range');
// a range from > to wraps past 360
const wrap = [{ hue: [345, 15], to: 120 }];
assert.notEqual(recolour('#ff0a33', wrap), '#ff0a33', 'hue 350');
assert.notEqual(recolour('#ff1500', wrap), '#ff1500', 'hue 5');
assert.equal(recolour('#ff5500', wrap), '#ff5500', 'hue 20');
// shape kept
assert.deepEqual(recolour({ a: ['#ff2bd6', { b: '20,24,60' }], n: 3 }, bands), { a: ['#ff1726', { b: '42,38,38' }], n: 3 });

// checkTheme
const ok = { format: 1, name: 'X', world: 'w40k', px: { r: '#102030' }, ui: { '--display': FONTS[0], '--bg': '#000000' }, light: { night: '10,20,30' } };
assert.deepEqual(checkTheme(ok, { bases: new Set(['tier2']) }), []);
const bases = new Set(['tier2']);
const one = (patch, key, drop = []) => {
  const j = { ...ok, ...patch };
  for (const d of drop) delete j[d];
  const p = checkTheme(j, { bases });
  assert.equal(p.length, 1, `${key}: ${JSON.stringify(p)}`);
  assert.ok(p[0].includes(key), `${key} in ${p[0]}`);
};
one({ format: 2 }, 'format');
one({}, 'name', ['name']);
one({ base: 'tier2' }, 'base');
one({}, 'base', ['world']);
one({ world: undefined, base: 'nope' }, 'nope');
one({ script: 'x' }, 'script');
one({ px: { rr: '#102030' } }, 'px.rr');
one({ px: { r: 'red' } }, 'px.r');
one({ ui: { '--bg': 'url(http://x)' } }, 'ui.--bg');
one({ ui: { '--display': 'Comic Sans' } }, 'ui.--display');
one({ ink: { brass: 12 } }, 'ink.brass');
one({ ink: { windowDay: { u: 'blue' } } }, 'ink.windowDay');
assert.deepEqual(checkTheme({ ...ok, ink: { windowDay: { u: '#102030' }, lamp: { on: ['#102030', '#ffffff'] } } }, { bases }), [], 'ink: sets of colours');
one({ text: { nope: 'x' } }, 'text.nope');
assert.deepEqual(checkTheme({ ...ok, notes: 'a note' }, { bases }), [], 'notes: a text');
assert.deepEqual(checkTheme({ ...ok, notes: ['a note', 'px: another'] }, { bases }), [], 'notes: texts');
one({ notes: ['a note', 3] }, 'notes');
one({ notes: { a: 'x' } }, 'notes');
one({ world: undefined, base: 'tier2', bands: [{ hue: [300], to: 10 }] }, 'bands[0].hue');
assert.equal(checkTheme({ ...ok, bands: [{ hue: [0, 20], to: 10 }] }, { bases }).length, 1, 'bands on a world theme');
// px, rank and sash are #rrggbb only (what theme.js rgb() reads); px, ink and light take only the keys of Ordo Administratum
one({ px: { r: '#123' } }, 'px.r');
one({ px: { r: 'rgba(1,2,3,.5)' } }, 'px.r');
one({ ui: { '--bg': '#123' } }, 'ui.--bg');
one({ sash: ['#102030', '#123'] }, 'sash');
one({ rank: { high: { robe: { r: '10,20,30' } } } }, 'rank.high.robe.r');
one({ ink: { windowDya: '#102030' } }, 'ink.windowDya');
one({ light: { nihgt: '10,20,30' } }, 'light.nihgt');
// world: a string, a known world or one brought with its worldName
one({ world: 3 }, 'world');
one({ world: 'mars' }, 'mars');
assert.deepEqual(checkTheme({ ...ok, world: 'mars', worldName: 'Mars' }, { bases }), [], 'a new world with its name');
assert.deepEqual(checkTheme({ ...ok, world: 'mars' }, { bases, worlds: new Set(['mars']) }), [], 'worlds: the known ones');
one({ world: 'mars', worldName: 3 }, 'worldName');

// art: with `families` given, every entry is one of them (a pack's art is a file name: no path gets through)
const art = { format: 1, name: 'X', world: 'w40k', art: ['scribe', '../x'] };
const pa = checkTheme(art, { families: ['scribe'] });
assert.equal(pa.length, 1); assert.ok(pa[0].includes('../x'), pa[0]);
assert.deepEqual(checkTheme(art, {}), [], 'no families, no check');
assert.deepEqual(checkTheme({ ...art, art: ['scribe'] }, { families: new Set(['scribe']) }), []);
// a colour's components: 0 to 255, alpha 0 to 1
one({ ui: { '--bg': 'rgb(300,0,0)' } }, 'ui.--bg');
one({ ui: { '--bg': 'rgba(0,0,0,2)' } }, 'ui.--bg');
one({ light: { night: '10,20,999' } }, 'light.night');
assert.deepEqual(checkTheme({ ...ok, ui: { '--bg': 'rgba(255,170,80,.38)' }, light: { night: '10,20,30' } }, { bases }), []);

// locked wording: a pack cannot reword the safety and pack-management texts; a shipped theme's check (no `locked`) may
assert.deepEqual(LOCKED, ['risky', 'rejectAll', 'toast.failed', 'prefs.packs']);
for (const [key, text] of [['risky', { risky: 'ok: {reason}' }], ['rejectAll', { rejectAll: 'Fine' }], ['toast.failed', { toast: { failed: 'sent' } }],
  ['prefs.packs', { prefs: { packs: { remove: 'Update' } } }], ['prefs.packs', { prefs: { packs: {} } }]]) {
  const p = checkTheme({ ...ok, text }, { bases, locked: LOCKED });
  assert.equal(p.length, 1, `${key}: ${JSON.stringify(p)}`);
  assert.ok(p[0].startsWith(`text.${key}:`) && p[0].includes('a pack cannot reword'), p[0]);
  assert.deepEqual(checkTheme({ ...ok, text }, { bases }), [], `${key}: a shipped theme may`);
}
assert.deepEqual(checkTheme({ ...ok, text: { toast: { petition: 'P {name}' }, watch: { name: 'Owl', button: 'Night Vigil: Owl watches' }, prefs: { theme: 'Look' } } }, { bases, locked: LOCKED }), [], 'the keys beside them stay free, the Night Vigil button too (it names the watchman)');
// a wording key is the reference's own, never one it inherits: a parsed theme.json can hold __proto__ as its own key
for (const text of [JSON.parse('{"__proto__":{}}'), JSON.parse('{"prefs":{"__proto__":{}}}'), { constructor: {} }, { toString: 'x' }, { prefs: { hasOwnProperty: {} } }]) {
  const p = checkTheme({ ...ok, text }, { bases, locked: LOCKED });
  assert.equal(p.length, 1, JSON.stringify(p));
  assert.match(p[0], /: not a wording key$/, p[0]);
}

// every shipped world passes the check a pack's theme gets: a full world can be a pack
const artDir = new URL('./art/', import.meta.url);
const listed = JSON.parse(readFileSync(new URL('themes.json', artDir), 'utf8'));
const worldThemes = listed.map(id => [id, JSON.parse(readFileSync(new URL(`${id}/theme.json`, artDir), 'utf8'))]).filter(([, j]) => j.world !== undefined && j.base === undefined);
assert.ok(worldThemes.length > 0 && worldThemes.some(([, j]) => j.text?.watch?.button), 'some shipped worlds reword the Night Vigil button');
for (const [id, j] of worldThemes) assert.deepEqual(checkTheme(j, { bases: new Set(listed), locked: LOCKED }), [], `${id}: a shipped world as a pack`);

// scoped: a pack's theme gets pack-scoped ids; what it names in its own pack follows, what is shipped stays
const shipped = ['w40k', 'vault'], own = ['pink', 'steam', 'rose'];
const sc = (id, json) => scoped('alice/p', id, { format: 1, name: 'P', ...json }, { own, shipped });
assert.deepEqual([sc('pink', { base: 'vault' }).id, sc('pink', { base: 'vault' }).json.base], ['alice/p:pink', 'vault']);
assert.equal(sc('rose', { base: 'steam' }).json.base, 'alice/p:steam');
assert.equal(sc('steam', { world: 'steampunk', worldName: 'Steampunk' }).json.world, 'alice/p:steampunk');
assert.equal(sc('steam', { world: 'w40k' }).json.world, 'w40k');
const frozen = Object.freeze({ format: 1, name: 'P', base: 'steam' });
assert.equal(scoped('a/b', 'rose', frozen, { own, shipped }).json.base, 'a/b:steam');
assert.equal(frozen.base, 'steam', 'the input is kept');

// themeOf
assert.deepEqual(themeOf('x', { format: 1, name: 'X', world: 'w40k', notes: 'n', worldName: 'W', px: { r: '#102030' } }), { id: 'x', name: 'X', world: 'w40k', px: { r: '#102030' } });
const j = { format: 1, name: 'S', base: 'tier2', bands: [{ hue: [0, 20], to: 200 }] };
const s = themeOf('s', j, TIER_II);
assert.equal(s.world, 'w40k');
assert.equal(s.artOf, 'tier2');
assert.equal(resolve(s).px[':'], resolve(TIER_II).px[':']);
assert.notEqual(resolve(s).px.x, resolve(TIER_II).px.x);
assert.equal(resolve(themeOf('s', { ...j, px: { x: '#123456' } }, TIER_II)).px.x, '#123456');
// a style's rank: its base's, recoloured, with its own keys laid over key by key, robe and adept apart
const rb = resolve(TIER_II).rank, rs = themeOf('s', { ...j, rank: { high: { robe: { r: '#123456' } } } }, TIER_II).rank;
for (const c of Object.keys(rb)) for (const p of ['robe', 'adept'])
  for (const k of Object.keys(rb[c][p])) assert.equal(rs[c][p][k], c === 'high' && p === 'robe' && k === 'r' ? '#123456' : recolour(rb[c][p][k], j.bands), `rank.${c}.${p}.${k}`);
// a style's text: its base's authored text, its own sections laid over whole (a shallow merge)
const base = { ...TIER_II, text: { motto: 'base motto', prefs: { a: 'A', b: 'B' } } };
const tx = themeOf('s', { ...j, text: { subtitle: 'own', prefs: { a: 'own A' } } }, base).text;
assert.deepEqual(tx, { motto: 'base motto', subtitle: 'own', prefs: { a: 'own A' } });
console.log('themepack ok');
