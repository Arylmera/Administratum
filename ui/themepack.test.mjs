import assert from 'node:assert/strict';
import { TIER_II, resolve } from './theme.js';
import { recolour, checkTheme, themeOf, FONTS } from './themepack.js';

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
