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

// F10: one focus ring. Every rule that selects :focus-visible and sets `outline` sets it from var(--focus), and only one rule does;
// the others may only move it (outline-offset). --focus is a theme variable (base.css :root), the parchment surfaces rebind it.
const rules = css => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), body: m[2] }));
export function rings(files) {
  return Object.entries(files).flatMap(([f, css]) => rules(css).filter(r => r.sel.includes(':focus-visible')).map(r => ({ f, ...r })));
}
const all = rings(SRC);
const drawn = all.filter(r => /(^|[;\s])outline\s*:/.test(r.body));
assert.equal(drawn.length, 1, `one :focus-visible rule draws the ring, found ${drawn.map(r => `${r.f}: ${r.sel}`).join(' | ')}`);
assert.match(drawn[0].body, /outline\s*:[^;]*var\(--focus\)/, 'the ring is drawn on --focus');
for (const r of all) assert.ok(r === drawn[0] || /^\s*outline-offset\s*:[^;]+;?\s*$/.test(r.body), `${r.f}: '${r.sel}' sets more than the ring's offset`);
assert.equal(rings({ x: 'button:focus-visible { outline: 2px solid var(--green); } a:focus-visible { outline: 2px solid var(--focus); }' }).filter(r => /outline\s*:/.test(r.body)).length, 2, 'the check counts a second ring');
for (const f of ['--focus', '--focus-paper']) assert.ok(defined.has(f), `base.css defines ${f}`);
assert.match(SRC.base, /\.panel,\s*#card[^{]*\{[^}]*--focus:\s*var\(--focus-paper\)/, 'the parchment surfaces rebind --focus');
assert.equal((SRC.base.match(/:disabled\s*\{/g) ?? []).length, 1, 'one shared :disabled style');
assert.match(SRC.base, /:active:not\(:disabled\)\s*\{/, 'a shared :active style');
for (const f of FILES) assert.ok(!/outline\s*:[^;]*var\(--(green|blood|paper-accent)\)/.test(SRC[f]), `${f}.css: an old per-surface ring`);

// F11: VT323 has one weight and font-synthesis is off (the phone page too): bold and italic draw as nothing, so none is written;
// emphasis is the --em token and the .em classes.
for (const f of FILES) {
  assert.ok(!/font-weight\s*:\s*(bold|bolder|[6-9]00|[6-9]\d\d)/.test(SRC[f]), `${f}.css: font-weight bold or 600+`);
  assert.ok(!/font-style\s*:\s*(italic|oblique)/.test(SRC[f]), `${f}.css: font-style italic`);
  assert.ok(!/font\s*:\s*[^;]*\b(italic|bold)\b/.test(SRC[f]), `${f}.css: bold or italic in a font shorthand`);
}
assert.match(SRC.hall, /font-synthesis:\s*none/, 'the hall turns synthesis off');
assert.match(SRC.mobile, /font-synthesis:\s*none/, 'the phone page too (it used to fake a bold)');
for (const f of ['--em', '--em-paper', '--em-track']) assert.ok(defined.has(f), `base.css defines ${f}`);
for (const c of ['.em', '.em-alert', '.em-soft']) assert.ok(SRC.base.includes(c), `base.css has ${c}`);

// F12: one parchment panel shell. The Chronicon and Settings are .panel; the shell's rules (the unrolling grid, the sheet, the
// rods) are written once, in base.css, and #chron / #prefs keep only what differs.
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
for (const id of ['chron', 'prefs']) assert.match(html, new RegExp(`<div id="${id}" class="panel"`), `#${id} is a .panel`);
const count = (re, files = FILES) => files.reduce((n, f) => n + (SRC[f].match(re) ?? []).length, 0);
assert.equal(count(/grid-template-rows:\s*auto 0fr auto/g), 1, 'the unrolling grid is written once');
assert.equal(count(/radial-gradient\(ellipse at center, var\(--paper\)/g), 1, 'the sheet is written once');
assert.equal(count(/linear-gradient\(var\(--rod-hi\)/g), 1, 'the rod is written once');
assert.ok(SRC.base.includes('.panel .sheet') && SRC.base.includes('.panel .rod'), 'the shell lives in base.css');

// The stylesheets are linked in the cascade order the move kept, from both pages.
assert.deepEqual([...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1]), ['css/base.css', 'css/hall.css', 'css/panels.css'], 'index.html links the hall styles in order');
const mobile = fs.readFileSync(new URL('./mobile.html', import.meta.url), 'utf8');
assert.deepEqual([...mobile.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1]), ['css/base.css', 'css/mobile.css'], 'mobile.html links base then mobile');
assert.ok(!/<style[\s>]/.test(html) && !/<style[\s>]/.test(mobile), 'no inline <style> is left in either page');

console.log('css ok');
