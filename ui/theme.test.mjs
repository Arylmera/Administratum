import assert from 'node:assert/strict';
import { BASE, TIER_II, THEMES, T, resolve, defineTheme, setTheme, onTheme, themed, hexA } from './theme.js';
import { MAPS, SCRIBE, ADEPT } from './sprites.js';

const COLOR = /^(#[0-9a-f]{6}|rgba\(\d+,\d+,\d+,[\d.]+\))$/;
const RGB = /^\d+,\d+,\d+$/;
const tier = resolve(TIER_II);

// Tier II is the art as it was before themes: spot-check values the drawing code used to hard-code.
assert.equal(tier.px.k, '#0e0a08');
assert.equal(tier.ink.brass, '#b8742e');
assert.equal(tier.ink.copper, '#c8853a');
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
assert.equal(blue.ink.copper, tier.ink.copper);
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
console.log('theme ok');
