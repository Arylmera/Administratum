import assert from 'node:assert/strict';
import { frameOf, lamps, lampOf, lampsAt, scribeLampsAt, lampLights, setLamps, start, restart, BLINK_MS, LENS, LAMP_SIZE, MAIN_SIZE } from './cilamp.js';
import { THEMES, setTheme, T } from './theme.js';
import { MAPS, loadAllArt } from './sprites.js';
await loadAllArt();

const row = (dept, state, extra = {}) => ({ dept, cwd: `C:/w/${dept}`, state, branch: 'main', sha7: 'abc1234', failed: null, ...extra });
const tick = () => new Promise(r => setTimeout(r, 0));

// states -> frames
assert.equal(frameOf('pass'), 'CILAMP.green');
assert.equal(frameOf('fail'), 'CILAMP.red');
for (const s of ['none', 'timeout', 'error', 'whatever', undefined]) assert.equal(frameOf(s, 0), 'CILAMP.off', `${s}: unlit`);
// running blinks between amber and its dim beat, once a second, whatever the time
assert.equal(BLINK_MS, 1000);
const beats = [0, 250, 499, 500, 750, 999, 1000, 1499, 1500, 2000].map(t => frameOf('running', t));
assert.deepEqual(beats, ['CILAMP.amber', 'CILAMP.amber', 'CILAMP.amber', 'CILAMP.amber_dim', 'CILAMP.amber_dim', 'CILAMP.amber_dim', 'CILAMP.amber', 'CILAMP.amber', 'CILAMP.amber_dim', 'CILAMP.amber']);
// only running blinks
for (const s of ['pass', 'fail', 'none']) assert.equal(frameOf(s, 0), frameOf(s, 500), `${s}: steady`);
// the department's main lamp: the same rules, its own family
assert.deepEqual(['running', 'pass', 'fail', 'none', 'error'].map(s => frameOf(s, 0, 'CIMAIN')), ['CIMAIN.amber', 'CIMAIN.green', 'CIMAIN.red', 'CIMAIN.off', 'CIMAIN.off']);
assert.equal(frameOf('running', 600, 'CIMAIN'), 'CIMAIN.amber_dim');

// the list: one entry per department, unknown states unlit, junk dropped, an empty list is "off"
restart();
assert.deepEqual(lamps(), [], 'nothing before the first event');
setLamps([row('a', 'running'), row('b', 'pass'), row('a', 'fail'), { dept: '' }, null, row('c', 'weird')]);
assert.deepEqual(lamps().map(l => [l.dept, l.state]), [['a', 'fail'], ['b', 'pass'], ['c', 'none']], 'one per department, the last entry wins');
assert.equal(lampOf('b').branch, 'main');
assert.equal(lampOf('zz'), undefined);
setLamps('not a list');
assert.deepEqual(lamps(), []);

// spots joined with the list: one lamp per department, two departments in one room get two lamps, no entry no lamp
setLamps([row('a', 'pass'), row('b', 'running')]);
const spots = [{ dept: 'a', x: 10, y: 20 }, { dept: 'b', x: 60, y: 20 }, { dept: 'c', x: 110, y: 20 }];
const at = lampsAt(spots, 0);
assert.deepEqual(at.map(l => [l.dept, l.frame, l.x, l.y]), [['a', 'CIMAIN.green', 10, 20], ['b', 'CIMAIN.amber', 60, 20]], 'c has no CI entry: no lamp; the frames are the main lamp family');
assert.ok(at.every(l => l.size === MAIN_SIZE), 'the size of the main lamp');
assert.equal(lampsAt(spots, 600)[1].frame, 'CIMAIN.amber_dim', 'the blink follows the time given');
assert.equal(lampsAt([{ dept: 'a', x: 1, y: 2 }, { dept: 'b', x: 3, y: 4 }], 0).length, 2, 'a room holding a and b: two lamps');
setLamps([]);
assert.deepEqual(lampsAt(spots, 0), [], 'the feature off: nothing drawn');

// the list arrives every second: an unchanged one keeps the same list (nothing downstream sees a change), a changed
// one replaces it
setLamps([row('a', 'pass'), row('b', 'running')]);
const before = lamps();
setLamps([row('a', 'pass'), row('b', 'running')]);
assert.equal(lamps(), before, 'the same lamps: the same list');
setLamps([row('a', 'pass'), row('b', 'fail')]);
assert.notEqual(lamps(), before, 'a state changed: a new list');
assert.equal(lampOf('b').state, 'fail');
setLamps([]);

// the scribe lamps: one per spot whose session has a CI of its own (Session.ci, not the department list), CILAMP art
{
  const two = [{ id: 's1', dept: 'a', x: 1, y: 2 }, { id: 's2', dept: 'a', x: 5, y: 2 }];
  const sl = scribeLampsAt(two, [{ id: 's1', ci: { state: 'fail' } }, { id: 's2' }], 0);
  assert.deepEqual(sl.map(l => [l.id, l.frame, l.state, l.x, l.y]), [['s1', 'CILAMP.red', 'fail', 1, 2]], 's2 has no CI: no lamp');
  assert.equal(sl[0].size, LAMP_SIZE);
  assert.deepEqual(scribeLampsAt(two, [{ id: 's1', ci: { state: 'none' } }], 0), [], 'none: no lamp');
  assert.deepEqual(scribeLampsAt(two, [], 0), [], 'no session: no lamp');
  assert.deepEqual(scribeLampsAt(two, [{ id: 's1', ci: { state: 'running' } }, { id: 's2', ci: { state: 'timeout' } }], 600).map(l => l.frame), ['CILAMP.amber_dim', 'CILAMP.off'], 'the blink follows the clock; timeout unlit but drawn');
  assert.deepEqual(scribeLampsAt(two, [{ id: 's1', ci: { state: 'pass' } }], 0).map(l => l.frame), ['CILAMP.green'], 'independent of the department list (empty here)');
  // the glows: the main lamp's larger and higher (its lens sits 11 px over its foot, the scribe's 7)
  const lit = lampLights([...sl, { x: 10, y: 50, frame: 'CIMAIN.red' }, { x: 20, y: 50, frame: 'CIMAIN.amber_dim' }, { x: 30, y: 50, frame: 'CIMAIN.off' }]);
  assert.deepEqual(lit.map(l => [l.x, l.y, l.r]), [[1, -5, 12], [10, 39, 16], [20, 39, 9]], 'scribe 12, main 16 lit / 9 dim, unlit none');
}

// start: listens to ci-lamps, asks ci_lamps once; an event that came first is not overwritten by the answer
{
  restart();
  const calls = [], handlers = {};
  let answer;
  const bridge = {
    listen: (name, cb) => { calls.push(['listen', name]); handlers[name] = cb; return Promise.resolve(() => {}); },
    invoke: name => { calls.push(['invoke', name]); return new Promise(res => { answer = res; }); },
  };
  start(bridge); start(bridge);
  assert.deepEqual(calls, [['listen', 'ci-lamps'], ['invoke', 'ci_lamps']], 'once each, however often started');
  handlers['ci-lamps']({ payload: [row('a', 'fail')] });
  answer([row('a', 'pass')]);
  await tick();
  assert.equal(lampOf('a').state, 'fail', 'the event is newer than the answer');
  handlers['ci-lamps']({ payload: [] });
  assert.deepEqual(lamps(), [], 'an empty event: the feature went off');
}
{
  restart();
  start({ listen: () => Promise.resolve(() => {}), invoke: () => Promise.resolve([row('x', 'pass')]) });
  await tick();
  assert.equal(lampOf('x').state, 'pass', 'the answer seeds the list at start');
  restart();
  start({ listen: () => Promise.resolve(() => {}), invoke: () => Promise.reject('ci_lamps is not available remotely') });
  await tick();
  assert.deepEqual(lamps(), [], 'the remote view has no command: the list waits for the event');
}

// The lens keeps its signal colour in every world: the sprite is drawn with the fixed LENS colours over the theme's
// palette, so green reads green, amber amber and red red whatever a theme or a pack does to the key slots.
{
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const lensOf = frame => { const ch = MAPS[frame][5][4], c = { ...T.px, ...LENS[frame] }[ch]; return rgb(c); }; // the lens's lit centre
  const seen = {};
  for (const id of Object.keys(THEMES)) {
    setTheme(id);
    for (const fam of ['CILAMP', 'CIMAIN']) {
      const [g, a, d, r] = ['green', 'amber', 'amber_dim', 'red'].map(n => lensOf(`${fam}.${n}`));
      assert.ok(g[1] > g[0] + 60 && g[1] > g[2] + 60, `${id} ${fam}: green is green-dominant ${g}`);
      assert.ok(a[0] > 200 && a[1] > 120 && a[1] < a[0] && a[2] < 120, `${id} ${fam}: amber is red + green, low blue ${a}`);
      assert.ok(d[0] > d[2] + 60 && d[1] > d[2] && d[0] < a[0], `${id} ${fam}: the dim beat is a darker amber ${d}`);
      assert.ok(r[0] > r[1] + 120 && r[0] > r[2] + 120, `${id} ${fam}: red is red-dominant ${r}`);
      (seen[`${id} ${fam}`] = { g, a, d, r });
    }
    // the main lamp's lens is the scribe lamp's colour, frame for frame, in this world (rendered: the theme's palette
    // under the fixed LENS)
    for (const n of ['green', 'amber', 'amber_dim', 'red']) assert.deepEqual(lensOf(`CIMAIN.${n}`), lensOf(`CILAMP.${n}`), `${id}: CIMAIN.${n} lens = CILAMP.${n}`);
  }
  const first = Object.values(seen)[0];
  for (const [id, s] of Object.entries(seen)) assert.deepEqual(s, first, `${id}: the same lens colours as every world`);
  assert.equal(LENS['CILAMP.off'], undefined, 'unlit: the dark glass of the theme');
  assert.equal(LENS['CIMAIN.off'], undefined);
}
console.log('cilamp ok');
