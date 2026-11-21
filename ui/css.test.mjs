// The stylesheets (ui/css/*.css): scales, one focus ring, emphasis, one panel shell. They are plain CSS files linked
// from index.html and mobile.html, so the checks read the text.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const FILES = ['base', 'hall', 'panels', 'mobile'];
const read = f => fs.readFileSync(new URL(`./css/${f}.css`, import.meta.url), 'utf8');
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, ''); // comments out
const SRC = Object.fromEntries(FILES.map(f => [f, strip(read(f))]));
// The token block: base.css's :root rules (the only place a raw length for the scaled properties may stand).
const outsideRoot = css => css.replace(/:root\s*\{[^}]*\}/g, '');

// F9: a raw px / em / rem value for padding, margin, gap, font-size (and the font shorthand's size), border-radius or
// z-index. Allowed anywhere: 0, a percentage, auto / inherit, and any value held in var(). 1px borders are not in the
// list of properties, so they need no exception. The scales live in base.css's :root, which this skips.
const SCALED = /(?<![-\w])(padding(?:-[a-z]+)?|margin(?:-[a-z]+)?|gap|row-gap|column-gap|font-size|font|border-radius|z-index)\s*:\s*([^;}]+)/g;
export function rawScaled(css) {
  const bad = [];
  for (const m of outsideRoot(css).matchAll(SCALED)) {
    const [, prop, value] = m;
    if (prop === 'z-index' ? /^\s*-?\d+\s*$/.test(value) && value.trim() !== '0' : /-?\d*\.?\d+(px|em|rem)\b/.test(value.replace(/var\([^)]*\)/g, ''))) bad.push(`${prop}: ${value.trim()}`);
  }
  return bad;
}
assert.deepEqual(rawScaled('a { padding: 5px 0; z-index: 9; margin: 0 -.5em; font: 400 22px/1 x; gap: 0; font-size: calc(9px * var(--k, 1)); }'),
  ['padding: 5px 0', 'z-index: 9', 'margin: 0 -.5em', 'font: 400 22px/1 x', 'font-size: calc(9px * var(--k, 1))'], 'the check sees a raw value');
assert.deepEqual(rawScaled('a { padding: 0 var(--sp-4); z-index: var(--z-card); font-size: calc(var(--fs-9) * var(--k, 1)); border-radius: 50%; font: inherit; }'), []);
assert.deepEqual(rawScaled(':root { --sp-4: 4px; }'), [], 'the token block itself may hold raw values');
for (const f of FILES) assert.deepEqual(rawScaled(SRC[f]), [], `${f}.css: a raw length outside the token block`);

// Every token a file uses is defined in the block (a typo would silently drop the declaration).
const defined = new Set([...SRC.base.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]));
for (const f of FILES) for (const m of SRC[f].matchAll(/var\((--(?:sp|spe|fs|fse|r|z)-[a-z0-9]+)/g)) assert.ok(defined.has(m[1]), `${f}.css uses ${m[1]}, which base.css does not define`);

console.log('css ok');
