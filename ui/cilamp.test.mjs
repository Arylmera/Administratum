import assert from 'node:assert/strict';
import { frameOf, lamps, lampOf, lampsAt, setLamps, start, restart, BLINK_MS, LENS } from './cilamp.js';
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
assert.deepEqual(at.map(l => [l.dept, l.frame, l.x, l.y]), [['a', 'CILAMP.green', 10, 20], ['b', 'CILAMP.amber', 60, 20]], 'c has no CI entry: no lamp');
assert.equal(lampsAt(spots, 600)[1].frame, 'CILAMP.amber_dim', 'the blink follows the time given');
assert.equal(lampsAt([{ dept: 'a', x: 1, y: 2 }, { dept: 'b', x: 3, y: 4 }], 0).length, 2, 'a room holding a and b: two lamps');
setLamps([]);
assert.deepEqual(lampsAt(spots, 0), [], 'the feature off: nothing drawn');

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
    const [g, a, d, r] = ['CILAMP.green', 'CILAMP.amber', 'CILAMP.amber_dim', 'CILAMP.red'].map(lensOf);
    assert.ok(g[1] > g[0] + 60 && g[1] > g[2] + 60, `${id}: green is green-dominant ${g}`);
    assert.ok(a[0] > 200 && a[1] > 120 && a[1] < a[0] && a[2] < 120, `${id}: amber is red + green, low blue ${a}`);
    assert.ok(d[0] > d[2] + 60 && d[1] > d[2] && d[0] < a[0], `${id}: the dim beat is a darker amber ${d}`);
    assert.ok(r[0] > r[1] + 120 && r[0] > r[2] + 120, `${id}: red is red-dominant ${r}`);
    (seen[id] = { g, a, d, r });
  }
  const first = Object.values(seen)[0];
  for (const [id, s] of Object.entries(seen)) assert.deepEqual(s, first, `${id}: the same lens colours as every world`);
  assert.equal(LENS['CILAMP.off'], undefined, 'unlit: the dark glass of the theme');
}
console.log('cilamp ok');
