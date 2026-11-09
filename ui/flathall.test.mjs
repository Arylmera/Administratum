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
// The west wing (O10c): a hall with three rooms (one row, two rows, one row), recorded once looked at on screen.
const WING = [{ id: 'a', color: '#c8a040', rows: 1 }, { id: 'b', color: '#40a0c8', rows: 2 }, { id: 'c', color: '#a040c8', rows: 1, empty: true }];
const FLAT_WING = { 'tier2 wing': '495247623bbd', 'vault wing': '041417c189ff' }; // the rooms down to the hall's bottom (2026-11-09)
for (const id of ['tier2', 'vault']) {
  setTheme(id);
  const cv = fakeCanvas();
  drawStatic(cv.getContext('2d'), true, hallOf(4, undefined, WING)); // 4 bays: the wing's 6 rows fit
  got[`${id} wing`] = sha(cv.log.join('\n'));
}
if (process.env.RECORD) console.log(got);
for (const k in FLAT) assert.equal(got[k], FLAT[k], `${k}: the flat background changed`);
for (const k in FLAT_WING) assert.equal(got[k], FLAT_WING[k], `${k}: the west wing's background changed`);
assert.equal(new Set(Object.values(got)).size, 10, 'each hall, theme and light draws differently');

// The wing reflows (Cast.resized): whoever stands in a room moves by the rows its room moved; its room gone (or the
// whole wing), at that room's door, hall side; the scriptorium's actors move with the wing's width.
{
  const { Cast } = await import('./actors.js'), { SLOT_H, roomOf } = await import('./layout.js');
  // 6 rows at 4 bays: a 4 + 0, b 1 + 1 (the spare row: the last room's); then a 1 + 2, b 1 + 2 (b one row up)
  const W2 = [{ id: 'a', rows: 4 }, { id: 'b', rows: 1 }], from = hallOf(4, undefined, W2), [A, B] = from.rooms;
  const at = (R, id) => ({ id, x: 40, y: R.y + 30, path: [], destKey: 'x' });
  const run = to => { const c = new Cast(), a = at(A, 'a'), b = at(B, 'b'), h = { id: 'h', x: from.x0 + 20, y: from.y0 }; for (const o of [a, b, h]) c.actors.set(o.id, o); c.resized(from, to); return { a, b, h }; };
  let r = run(hallOf(4, undefined, [{ id: 'a', rows: 1 }, { id: 'b', rows: 1 }]));
  assert.deepEqual([r.a.y, r.b.y, r.h.x], [A.y + 30, B.y + 30 - SLOT_H, from.x0 + 20], 'b one row up with its room');
  r = run(hallOf(4, undefined, [{ id: 'b', rows: 1 }])); // a deleted: b first now
  assert.deepEqual([r.b.y, [r.a.x, r.a.y]], [B.y + 30 - 4 * SLOT_H, [A.doorOut.x, A.doorOut.y]], 'b four rows up; a at its door');
  { // a room losing its spare rows: whoever stood on its lowest lane (or at its door) stays inside it, on its own lane
    const W3 = [{ id: 'a', rows: 1 }, { id: 'b', rows: 1 }], f3 = hallOf(4, undefined, W3), t3 = hallOf(4, undefined, [{ id: 'a', rows: 1 }, { id: 'b', rows: 4 }]);
    const [A3] = f3.rooms, [A4] = t3.rooms, c = new Cast();
    assert.ok(A4.rows < A3.rows, 'a shrinks');
    const low = { id: 'low', x: 40, y: A3.lanes.at(-1), path: [], destKey: 'x' }, door = { id: 'door', ...A3.doorIn, path: [], destKey: 'x' };
    for (const o of [low, door]) c.actors.set(o.id, o);
    c.resized(f3, t3);
    for (const o of [low, door]) {
      assert.equal(roomOf(o, t3), 'w:a', `${o.id}: still in its room`);
      assert.ok(A4.lanes.includes(o.y) && o.y >= A4.y && o.y < A4.y + A4.h, `${o.id}: on one of its room's lanes, at ${o.y}`);
    }
  }
  r = run(hallOf(4)); // the wing gone
  assert.deepEqual([[r.a.x, r.a.y], [r.b.x, r.b.y], r.h.x], [[A.doorOut.x - from.wx, A.doorOut.y], [B.doorOut.x - from.wx, B.doorOut.y], from.x0 + 20 - from.wx], 'all at their doors, the hall back west');
}

// The west wing's doors: one per room in the scriptorium's west wall, on its lane, the refectorium's frames; open while
// anyone stands on its frame (as the Sanctum's), shut otherwise and for an empty room nobody walks to.
{
  const { drawScene, doorsOf } = await import('./scene.js'), { roomAt } = await import('./room.js'), { sprite, ROOM } = await import('./sprites.js');
  setTheme('tier2');
  const hall = hallOf(4, undefined, WING), layout = { hall, blocks: [], desks: [], consoles: [], level: { dark: 0.18 } };
  const img = name => { const cv = sprite(ROOM.frames[name]); return `cv:${cv.width}x${cv.height}:${sha(cv.log.join('\n'))}`; };
  const ds = doorsOf(hall).filter(d => d.name.startsWith('w:'));
  assert.deepEqual(ds.map(d => [d.name, d.kind, d.x0, d.x1]), hall.rooms.map(R => [`w:${R.id}`, 'refectory', hall.wx - 8, hall.wx]), 'a door per room in the west wall');
  let now = 1000;
  const frameOf = (actors, d) => { // the door's frame drawn, once at rest (a swing shows its half frame for 120 ms)
    let log;
    for (const t of [now, now + 1000]) { const cv = fakeCanvas(); drawScene(cv.getContext('2d'), layout, new Map(actors.map((a, i) => [`a${i}`, a])), () => 0, t); log = cv.log; }
    now += 5000;
    return ['open', 'closed'].find(s => { const n = `door refectory ${s}`, [ax, ay] = roomAt(n).door; return log.some(l => l.startsWith(`drawImage(${img(n)},${d.x0 - ax},${d.y0 - ay},`)); });
  };
  const walker = (x, y) => ({ id: 'w', x, y, pose: 'walk', dir: 'left', t: 0, path: [], s: { status: 'busy', name: 'w', context: 0 } });
  for (const [d, R] of ds.map((d, i) => [d, hall.rooms[i]])) {
    assert.ok(d.y0 < R.doorOut.y && R.doorOut.y < d.y1 && d.y0 >= R.top && d.y1 <= R.y + R.h, `${d.name}: on its lane, in its room's band`);
    assert.equal(frameOf([walker(hall.wx - 4, R.doorOut.y)], d), 'open', `${d.name}: open with someone on its frame`);
    assert.equal(frameOf([walker(hall.wx + 60, R.doorOut.y)], d), 'closed', `${d.name}: shut with nobody by it`);
  }
}

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

// The alarm's searchlight (both views draw it): a stale petitioner at the head of the queue, the servo-skull flown to it,
// its red cone drawn 'lighter' from the skull's eye down to the petitioner's feet. The cone's calls are pinned in each view.
{
  const { drawScene } = await import('./scene.js'), { drawScene39, use } = await import('./scene39.js'), { setView, sceneSize } = await import('./view.js');
  setTheme('tier2');
  const hall = hallOf(0), q = hall.queue[0], layout = { hall, blocks: [], desks: [], consoles: [], level: { dark: 0.18 } };
  const petitioner = { id: 'p', x: q.x, y: q.y, pose: 'queue', dir: 'up', t: 0, s: { status: 'waiting', sinceMs: 1, name: 'p', context: 0 } }; // stale since the epoch
  const actors = new Map([['p', petitioner]]);
  let now = 1000;
  const pixels = k => k === 'getImageData' || k === 'createImageData', pixelled = () => { // 39's buffers read and write pixels: a canvas that has some
    const cv = fakeCanvas(), ctx = cv.getContext('2d');
    const g = new Proxy(ctx, { get: (t, k) => (pixels(k) ? (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(4 * w * h) }) : t[k]) });
    cv.getContext = () => g;
    return cv;
  };
  const make = document.createElement;
  document.createElement = pixelled;
  const cone = draw => { // 400 frames: the skull flies over and hovers; the last frame's cone
    const g0 = pixelled(), g = g0.getContext('2d');
    for (let i = 0; i < 400; i++) draw(g, layout, actors, () => 0, now + i * 100);
    now += 40000;
    const L = g0.log, j = L.findLastIndex((l, k) => l === 'globalCompositeOperation=lighter' && L[k + 2] === 'beginPath()');
    return L.slice(j - 1, j + 9);
  };
  assert.deepEqual(cone(drawScene), ['save()', 'globalCompositeOperation=lighter', 'fillStyle=rgba(255,50,30,0.11827091153071882)', 'beginPath()',
    'moveTo(308.5,193)', 'lineTo(311.5,193)', 'lineTo(284,210)', 'lineTo(268,210)', 'closePath()', 'fill()'], "the flat view's searchlight");
  setView('39'); sceneSize(hall); use(hall);
  assert.deepEqual(cone(drawScene39), ['save()', 'globalCompositeOperation=lighter', 'fillStyle=rgba(255,50,30,0.1012763177473833)', 'beginPath()',
    'moveTo(346.5,214)', 'lineTo(349.5,214)', 'lineTo(315.5,215)', 'lineTo(299.5,215)', 'closePath()', 'fill()'], "the 39 degree view's searchlight");
  document.createElement = make;
}
console.log('flathall ok');
