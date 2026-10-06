import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BASE, TIER_II, THEMES, T, TEXT, resolve, defineTheme, setTheme, onTheme, themed, hexA, t } from './theme.js';
import './themes.js';
import { MAPS, SCRIBE, ADEPT } from './sprites.js';

const COLOR = /^(#[0-9a-f]{6}|rgba\(\d+,\d+,\d+,[\d.]+\))$/;
const RGB = /^\d+,\d+,\d+$/;
const tier = resolve(TIER_II);

// Tier II is the art as it was before themes: spot-check values the drawing code used to hard-code.
assert.equal(tier.px.k, '#0e0a08');
assert.equal(tier.ink.brass, '#b8742e');
assert.equal(tier.px.X, '#c8853a');
assert.equal(tier.ink.copperShade, tier.px.Z, 'ink follows the room palette');
assert.equal(tier.ink.screenOff, '#2e6b47');
assert.equal(tier.light.amber, 'rgba(240,168,60,.26)');
assert.equal(hexA(tier.ink.smoke, 0.5), 'rgba(190,180,164,0.5)');
assert.equal(hexA(tier.ink.searchlight, 0.1), 'rgba(255,50,30,0.1)');

// Every map char has a colour in every theme.
const chars = new Set();
const scan = map => map.forEach(row => { for (const c of row) if (c !== '.') chars.add(c); });
Object.values(MAPS).forEach(scan);
for (const dir of ['up', 'down', 'left', 'right']) { SCRIBE[dir].forEach(scan); ADEPT[dir].forEach(scan); }

// A theme over Tier II: px edits flow into the derived ink, explicit ink wins, rank parts merge.
defineTheme({ id: 'test-blue', name: 'Test', px: { g: '#2244aa' }, ink: { wax: '#123456' }, rank: { high: { robe: { r: '#000080' } } }, light: { green: 'rgba(1,2,3,.4)' } });
const blue = resolve(THEMES['test-blue']);
assert.equal(blue.ink.brass, '#2244aa');
assert.equal(blue.ink.wax, '#123456');
assert.equal(blue.ink.coolant, tier.ink.coolant);
assert.equal(blue.rank.high.robe.r, '#000080');
assert.equal(blue.rank.high.robe.z, tier.rank.high.robe.z);
assert.equal(blue.light.green, 'rgba(1,2,3,.4)');
assert.equal(BASE.g, '#b8742e', 'a theme never edits BASE');

// Every registered theme is complete and well-formed.
const flat = (o, pre = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${pre}${k}.`) : [[pre + k, v]]));
for (const id of Object.keys(THEMES)) {
  const t = resolve(THEMES[id]);
  for (const c of chars) assert.match(t.px[c], COLOR, `${id}: px '${c}'`);
  assert.deepEqual(Object.keys(t.ink).sort(), Object.keys(tier.ink).sort(), `${id}: ink keys`);
  assert.deepEqual(Object.keys(t.light).sort(), Object.keys(tier.light).sort(), `${id}: light keys`);
  for (const [k, v] of flat(t.ink)) assert.match(v, COLOR, `${id}: ink.${k}`);
  for (const [k, v] of Object.entries(t.light)) assert.match(v, k === 'night' || k === 'beam' ? RGB : COLOR, `${id}: light.${k}`);
  assert.ok(t.sash.length >= 1 && t.sash.every(c => COLOR.test(c)), `${id}: sash`);
  for (const r of ['high', 'standard', 'novice']) for (const [k, v] of [...flat(t.rank[r].robe), ...flat(t.rank[r].adept)]) assert.match(v, COLOR, `${id}: rank ${r} ${k}`);
}

// Switching: the T objects stay, their colours change, listeners and themed() follow; unknown ids fall back.
const ink = T.ink, seen = [];
const off = onTheme(t => seen.push(t.id));
const winDay = themed(t => ({ ...t.ink.windowDay }));
const w0 = winDay();
assert.equal(winDay(), w0, 'themed keeps its identity between changes');
setTheme('test-blue');
assert.equal(T.ink, ink);
assert.equal(T.ink.brass, '#2244aa');
assert.equal(T.px.g, '#2244aa');
assert.notEqual(winDay(), w0, 'themed rebuilds after a change');
setTheme('test-blue');
assert.deepEqual(seen, ['test-blue'], 'same theme again: no change');
setTheme('no-such-theme');
assert.equal(T.id, 'tier2');
assert.equal(T.ink.brass, '#b8742e');
assert.deepEqual(seen, ['test-blue', 'tier2']);
off();
delete THEMES['test-blue'];
// The shipped themes are there (and so checked by the completeness loop above).
assert.deepEqual(Object.keys(THEMES).sort(), ['contrast', 'forge', 'night', 'tier2', 'xenos']);

// Chrome colours: a theme's ui keys are CSS variables index.html declares.
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const cssVars = new Set([...html.slice(html.indexOf(':root {'), html.indexOf('}', html.indexOf(':root {'))).matchAll(/(--[a-z0-9-]+):/g)].map(m => m[1]));
assert.ok(cssVars.size > 40, 'found the :root variables');
for (const id of Object.keys(THEMES)) for (const [k, v] of Object.entries(resolve(THEMES[id]).ui)) {
  assert.ok(cssVars.has(k), `${id}: ui ${k} is not a :root variable`);
  assert.match(v, COLOR, `${id}: ui ${k}`);
}

// Wording: a theme only changes keys TEXT has; every key the page and the code ask for exists.
const keysOf = (o, pre = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? keysOf(v, `${pre}${k}.`) : [pre + k]));
const all = new Set(keysOf(TEXT));
for (const id of Object.keys(THEMES)) {
  for (const k of keysOf(THEMES[id].text ?? {})) assert.ok(all.has(k), `${id}: text key ${k} is not in TEXT`);
  for (const k of keysOf(resolve(THEMES[id]).text)) {
    const v = k.split('.').reduce((o, p) => o[p], resolve(THEMES[id]).text);
    assert.ok(typeof v === 'string' || (Array.isArray(v) && v.length === 2 && v.every(x => typeof x === 'string')), `${id}: text ${k}`);
  }
}
const asked = new Set([...html.matchAll(/data-t(?:-title|-aria)?="([^"]+)"/g)].map(m => m[1]));
for (const f of ['app.js', 'chronicon.js']) for (const m of fs.readFileSync(new URL(`./${f}`, import.meta.url), 'utf8').matchAll(/\b(?:t|say)\('([a-zA-Z.-]+)'/g)) asked.add(m[1]);
assert.ok(asked.size > 25, 'found the texts asked for');
for (const k of asked) assert.ok(all.has(k), `text key '${k}' is asked for but not in TEXT`);
for (const k of ['busy', 'shell', 'idle', 'waiting']) assert.ok(all.has(`status.${k}`), `status.${k}`); // app.js: status.${s.status}
for (const k of ['high', 'standard', 'novice']) assert.ok(all.has(`rank.${k}`), `rank.${k}`);
// t(): placeholders, plurals, nested keys, a theme's wording, unknown keys
assert.equal(t('petitions', { n: 1 }), '1 petition');
assert.equal(t('petitions', { n: 0 }), '0 petitions');
assert.equal(t('adeptOf', { kind: 'Explore', owner: 'api' }), 'Explore · adept of api');
assert.equal(t('toast.stale', { name: 'api' }), 'Petition still waiting: api');
assert.equal(t('no.such.key'), 'no.such.key');
setTheme('xenos');
assert.equal(t('motto'), 'Suffer not the alien to live');
assert.equal(t('rank.high'), 'Magos', 'a theme keeps the wording it does not change');
setTheme('tier2');
console.log('theme ok');
