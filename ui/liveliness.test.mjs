// Liveliness (liveliness.js): typing arms, the live desk screen, their wiring. Run: node ui/liveliness.test.mjs
import assert from 'node:assert/strict';
import { rnd, typing, screenRows, isGlass, workKind } from './liveliness.js';
import { drawCarried, gestureNow } from './actors.js';
import { settings } from './settings.js';
import { MAPS, SCRIBE, SCRIBE39, loadAllArt } from './sprites.js';
import { THEMES, setTheme } from './theme.js';
import './themes.js';
await loadAllArt();

const span = (f, to = 60, dt = 1 / 12) => Array.from({ length: Math.round(to / dt) }, (_, i) => f(i * dt));
// ---- typing: one arm or the other half a px up, in bursts, out of step ----
const ty = span(t => typing('s1', t));
assert.ok(ty.every(p => [0, 0.5].includes(p.l) && [0, 0.5].includes(p.r) && p.l + p.r <= 0.5), 'one arm at a time, one art px');
assert.ok(ty.some(p => p.l) && ty.some(p => p.r), 'both arms type');
const rest = ty.filter(p => !p.l && !p.r).length / ty.length;
assert.ok(rest > 0.15 && rest < 0.6, `bursts with pauses (${rest.toFixed(2)} at rest)`);
const pause = Math.max(...ty.map(p => (p.l || p.r ? ',' : '.')).join('').split(',').map(q => q.length)) / 12;
assert.ok(pause > 1.8 && pause < 4, `a pause of about 2 s between bursts (${pause.toFixed(1)})`);
assert.notDeepEqual(span(t => typing('s1', t), 5), span(t => typing('s2', t), 5), 'scribes out of step');
assert.deepEqual(typing('s1', 3.3), typing('s1', 3.3));

assert.ok(new Set(Array.from({ length: 9 }, (_, i) => Math.floor(4 * rnd(`s1:${i}`)))).size >= 3, 'rnd: neighbours differ');

// ---- the screen: rows inside w x h art px, written over time, never all blank, still at no point ----
for (const t of [0, 0.4, 7.7, 1234.5]) for (const r of screenRows('s1', t, 14, 9)) {
  assert.ok(Number.isInteger(r.x) && Number.isInteger(r.y) && r.x >= 0 && r.y >= 0 && r.w > 0 && r.x + r.w <= 14 && r.y < 9, JSON.stringify(r));
}
assert.ok(span(t => screenRows('s1', t, 14, 9).length).every(n => n >= 2));
const frames = span(t => JSON.stringify(screenRows('s1', t, 14, 9)), 10);
assert.ok(new Set(frames).size > 15, 'it moves');
assert.notEqual(frames[5], JSON.stringify(screenRows('s2', 5 / 12, 14, 9)));
assert.deepEqual(screenRows('s1', 1, 0, 0), []);

// ---- kinds: the tool the task line names, each its own screen ----
for (const [task, kind] of [['Edit · app.js', 'write'], ['Write · a', 'write'], ['Read · main.rs', 'read'], ['Grep · fn x', 'search'], ['Glob', 'search'], ['WebFetch · docs.rs', 'web'],
  ['Bash · ls', null], ['“Read the docs”', null], ['Reader · x', null], ['—', null], [undefined, null]]) assert.equal(workKind(task), kind, String(task));
const shown = {};
for (const kind of [null, 'write', 'read', 'search', 'web']) {
  const at = t => screenRows('s1', t, 14, 9, kind);
  for (let t = 0; t < 20; t += 0.1) for (const r of at(t)) assert.ok([r.x, r.y, r.w].every(Number.isInteger) && r.x >= 0 && r.y >= 0 && r.w > 0 && r.x + r.w <= 14 && r.y < 9, `${kind}: ${JSON.stringify(r)}`);
  shown[kind] = JSON.stringify(span(at, 10));
  assert.ok(new Set(span(t => JSON.stringify(at(t)), 10)).size >= (kind === 'web' ? 4 : 9), `${kind}: it moves`);
}
assert.equal(new Set(Object.values(shown)).size, 5, 'each kind its own screen');
assert.equal(new Set(span(t => JSON.stringify(screenRows('s1', t, 14, 9, 'search').filter(r => r.w < 14)), 5)).size, 1, 'search: the page stays');
assert.ok(span(t => screenRows('s1', t, 14, 9, 'search').filter(r => r.w === 14).length, 5).every(k => k === 1), 'search: one bar');
for (const kind of ['write', 'search', 'web']) assert.ok(Array.isArray(screenRows('s1', 1, 0, 0, kind)));

// ---- glass: only an anchor that covers screen colours in the art ----
assert.equal(isGlass(['kCCk', 'kcCk'], [0.5, 0, 1, 1]), true);
assert.equal(isGlass(['kppk', 'kpPk'], [0.5, 0, 1, 1]), false);
assert.equal(isGlass(['kCCk'], undefined), false);
const glass = {};
const { KIND } = await import('./scene.js');
for (const id of Object.keys(THEMES)) { setTheme(id); glass[id] = isGlass(MAPS.DESK, KIND.desk.at.screen); }
assert.deepEqual(Object.keys(glass).filter(id => !glass[id]), ['tower', 'darwin'], 'a parchment and a microscope are no screens');
setTheme('tier2');

// ---- wiring: drawCarried moves the arms of a busy scribe at its desk only, and never when off ----
const V = { at: { arm: { x: 14, y: 9 }, armL: { x: 0, y: 9 }, scroll: { x: 0, y: 0 } }, arm: ['k'], armL: ['k'], scroll: ['k'], held() {} };
globalThis.document ??= { createElement: () => ({ getContext: () => ({ fillRect() {}, putImageData() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray(4 * w * h) }) }) }) };
const ys = (s, more = {}) => span(t => { const out = []; drawCarried({ drawImage: (...a) => out.push(a[2]) }, { id: 's1', pose: 'desk', t, s: { status: 'busy', ...s }, ...more }, V, 0, 0); return out.slice(0, 2).join(); }, 20);
const still = a => new Set(a).size === 1;
settings.liveliness = 'full';
assert.ok(!still(ys({})), 'busy: the arms move');
assert.ok(still(ys({ status: 'waiting' })), 'not busy: still');
assert.ok(still(ys({}, { pose: 'cog' })), 'at the cogitator: still');
assert.ok(still(ys({}, { fx: [{ kind: 'task-done', t: 1 }] })), 'a scroll held up: the arms hold it');
settings.liveliness = 'off';
assert.ok(still(ys({})), 'off: still');
const busy = t => ({ id: 's1', pose: 'desk', t, s: { status: 'busy' } });
assert.ok(span(t => gestureNow(busy(t), () => true)).every(g => g === null), 'off: no gesture');
settings.liveliness = 'full';
assert.ok(span(t => gestureNow(busy(t), () => true)).includes('think'));
console.log('liveliness ok');
