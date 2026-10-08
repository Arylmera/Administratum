import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// A canvas stand-in that logs every drawing call (the light layer and the stamps are canvases too): enough to compare
// two renders call for call.
const log = [];
let made = 0;
const ctx = name => new Proxy({}, {
  get: (o, k) => (k in o ? o[k] : ['createRadialGradient', 'createLinearGradient'].includes(k)
    ? (...a) => ({ addColorStop: (...s) => log.push([name, k, ...a, ...s]) })
    : (...a) => log.push([name, k, ...a.map(v => (v?.tag ? v.tag : v))])),
  set: (o, k, v) => { log.push([name, '=', k, v?.addColorStop ? 'gradient' : v]); return true; },
});
globalThis.document = { createElement: () => { const c = { tag: `cv${made++}` }; const x = ctx(c.tag); c.getContext = () => x; return c; } };

const { drawLighting, lift39 } = await import('./lighting.js');
const { WALL } = await import('./layout.js');
const { setView, sceneSize, toScreen } = await import('./view.js');
const { hallOf } = await import('./layout.js');

// a light of each height: a floor crossing (z 0), a desk candle (unset: below the wall foot), a lamp on the wall
const lights = [{ x: 50, y: 117, r: 14, z: 0 }, { x: 80, y: 100, r: 22, color: '#ffaa44', flicker: true }, { x: 96, y: 14, r: 10, color: '#ffaa44' }];
const level = { dark: 0.6, glow: 0.8, beams: true };
const render = () => { log.length = 0; drawLighting(ctx('g'), lights, level, 12.5, 346, 248, [40, 140]); return createHash('sha1').update(JSON.stringify(log)).digest('hex').slice(0, 12); };

render(); // builds the cached stamps, layer, vignette: every later frame logs the same calls
const FLAT = '52bf6f1953f2';
// Flat: call for call as before the 39° light heights (hash recorded after the flat and 39° beams shared one path)
assert.equal(render(), FLAT, 'flat lighting changed');

// 39°: a desk-height light glows lift39.h px above a floor point lift39.d px south of its flat point, its pool (the
// hole in the dark) on that floor point; a floor light's glow and pool on its own floor point; a wall light on the wall
setView('39'); sceneSize(hallOf(0));
render();
const holes = log.filter(c => c[0] !== 'g' && c[1] === 'drawImage'), glows = log.filter(c => c[0] === 'g' && c[1] === 'drawImage');
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);
const centre = c => [c[3] + c[5] / 2, c[4] + c[6] / 2];
const [fl, desk, wall] = lights;
// floor light: the hole on its own floor point
near(centre(holes[0])[0], toScreen(fl.x, fl.y)[0], 'floor pool x'); near(centre(holes[0])[1], toScreen(fl.x, fl.y)[1], 'floor pool y');
// desk light: the hole on the floor under the source, the glow lifted straight up by its height
const foot = toScreen(desk.x, desk.y + lift39.d), src = toScreen(desk.x, desk.y + lift39.d, lift39.h);
near(centre(holes[1])[0], foot[0], 'desk pool x'); near(centre(holes[1])[1], foot[1], 'desk pool y');
const g1 = glows.find(c => Math.abs(centre(c)[0] - src[0]) < 1e-9);
assert.ok(g1, 'a glow at the desk light\'s source');
near(centre(g1)[1], src[1], 'desk glow y');
assert.ok(src[1] < foot[1] - lift39.h + 1e-9 && src[1] > foot[1] - lift39.h - 1e-9, 'the glow is its height above its pool');
// wall light: on the wall plane (toScreen of a wall point), as before
near(centre(holes[2])[0], toScreen(wall.x, wall.y)[0], 'wall x'); near(centre(holes[2])[1], toScreen(wall.x, wall.y)[1], 'wall y');
assert.ok(wall.y < WALL);
setView('flat');
assert.equal(render(), FLAT, 'flat lighting changed after a 39° frame');
console.log('lighting ok');
