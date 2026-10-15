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
  'tier2 0 day': '9838baf32ecf', 'tier2 0 night': '3e720e668065', 'tier2 2 day': 'bccd86b52603', 'tier2 2 night': '3e8fabbb9d60',
  'vault 0 day': '34ffc876c6d3', 'vault 0 night': '5a28fddf3cb2', 'vault 2 day': 'b0254fd981a8', 'vault 2 night': '0ad1656d3b74',
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

// The background-shell cog and the dozing Zs draw their art, not code (both views share these): spinCog frame k
// (MAPS.SHELL_COG_k) for its k / COG_TURN of a turn (2 rad/s), centred on (cx, cy); dozing two MAPS.DOZE_Z, fading.
// Gate: swapping the art for another frame changes what is drawn.
{
  const { spinCog, COG_TURN } = await import('./scene.js'), { dozing } = await import('./actors.js'), { MAPS, sprite } = await import('./sprites.js');
  setTheme('tier2');
  const drawn = f => { const cv = fakeCanvas(); f(cv.getContext('2d')); return cv.log; };
  const img = map => { const cv = sprite(map); return `cv:${cv.width}x${cv.height}:${sha(cv.log.join('\n'))}`; };
  assert.ok(MAPS[`SHELL_COG_${COG_TURN - 1}`] && !MAPS[`SHELL_COG_${COG_TURN}`], 'one frame per step of the turn, no more');
  for (let k = 0; k < COG_TURN; k++) for (const t of [k + 0.01, k + 0.99].map(s => s * Math.PI / COG_TURN + 3 * Math.PI)) // a later turn too
    assert.deepEqual(drawn(g => spinCog(g, 100, 50, t)), [`drawImage(${img(MAPS[`SHELL_COG_${k}`])},97,47,6,6)`], `cog frame ${k} at t ${t}`);
  assert.deepEqual(drawn(g => dozing(g, 50, 50, 0)), ['globalAlpha=1', `drawImage(${img(MAPS.DOZE_Z)},49.5,49.5,3.5,3.5)`,
    'globalAlpha=1', `drawImage(${img(MAPS.DOZE_Z)},50.5,46.5,3.5,3.5)`, 'globalAlpha=1'], 'two Zs, half a cycle apart');
  const before = [drawn(g => spinCog(g, 100, 50, 0)), drawn(g => dozing(g, 50, 50, 1))], keep = [MAPS.SHELL_COG_0, MAPS.DOZE_Z];
  MAPS.SHELL_COG_0 = MAPS.SHELL_COG_1; MAPS.DOZE_Z = MAPS.SHELL_COG_1;
  assert.notDeepEqual(drawn(g => spinCog(g, 100, 50, 0)), before[0], 'the cog reads its art');
  assert.notDeepEqual(drawn(g => dozing(g, 50, 50, 1)), before[1], 'the Zs read their art');
  [MAPS.SHELL_COG_0, MAPS.DOZE_Z] = keep;
}
console.log('flathall ok');
