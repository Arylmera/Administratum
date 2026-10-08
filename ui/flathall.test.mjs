// The flat view's static background must not change by accident: drawStatic (scene.js) run against a recording
// canvas (node has none), every call and property write it makes hashed, sprite and tile canvases by their own
// recorded content. Tier II and the vault, the default hall and a 2-bay one, day and night, against hashes recorded
// from the code as it stood. An art or layout change on purpose changes them: re-record (print the hash) once checked.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const sha = s => createHash('sha1').update(s).digest('hex').slice(0, 12);
function fakeCanvas() {
  const log = [], cv = { width: 0, height: 0, log };
  const ser = v => (v?.log ? `cv:${v.width}x${v.height}:${sha(v.log.join('\n'))}` : v?.tag ?? (typeof v === 'object' ? JSON.stringify(v) : String(v)));
  const made = (k, a) => { const o = { tag: `${k}#${log.length}`, log }; o.setTransform = m => log.push(`${o.tag}.setTransform(${ser(m)})`); o.addColorStop = (...b) => log.push(`${o.tag}.stop(${b.join(',')})`); return o; };
  const state = { canvas: cv, globalAlpha: 1, imageSmoothingEnabled: true, globalCompositeOperation: 'source-over' };
  const g = new Proxy(state, {
    get: (t, k) => (k in t ? t[k] : (...a) => { log.push(`${String(k)}(${a.map(ser).join(',')})`); return k.startsWith('create') ? made(k, a) : undefined; }),
    set: (t, k, v) => { log.push(`${String(k)}=${ser(v)}`); t[k] = v; return true; },
  });
  cv.getContext = () => g;
  return cv;
}
globalThis.document = { createElement: () => fakeCanvas() };
globalThis.DOMMatrix = class { constructor(m) { this.m = m; } };

const { setTheme } = await import('./theme.js');
await import('./themes.js');
const { drawStatic } = await import('./scene.js');
const { hallOf } = await import('./layout.js');

const FLAT = {
  'tier2 0 day': 'efa9db7ae56a', 'tier2 0 night': 'cef46a912e53', 'tier2 2 day': 'e40df352536f', 'tier2 2 night': '67423d9742d0',
  'vault 0 day': '46f090af1531', 'vault 0 night': 'b6d76be2428b', 'vault 2 day': 'e59048be8c47', 'vault 2 night': '72837dfb0a3e',
};
const got = {};
for (const id of ['tier2', 'vault']) {
  setTheme(id);
  for (const bays of [0, 2]) for (const day of [true, false]) {
    const cv = fakeCanvas(), k = `${id} ${bays} ${day ? 'day' : 'night'}`;
    drawStatic(cv.getContext('2d'), day, hallOf(bays));
    got[k] = sha(cv.log.join('\n'));
  }
}
if (process.env.RECORD) console.log(got);
for (const k in FLAT) assert.equal(got[k], FLAT[k], `${k}: the flat background changed`);
assert.equal(new Set(Object.values(got)).size, 8, 'each hall, theme and light draws differently');
console.log('flathall ok');
