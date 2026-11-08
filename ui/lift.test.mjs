import assert from 'node:assert/strict';
import { CAP, SPEED_PX, DOOR_S, DWELL_S, makeLift, setStops, call, cancel, retarget, step, carY, doorsOf, slotOf, lineOf } from './lift.js';

// Five floors, top to bottom (y grows down): the sanctum, two departments, the cogitator, the refectory (entry).
const STOPS = new Map([['sanctum', 58], ['d:a', 146], ['d:b', 190], ['cog', 300], ['ref', 344]]);
// Runs the car for `s` seconds in steps of dt, the events stamped with the time they came out at.
function run(L, s, dt = 0.05, log = []) {
  for (let t = 0; t < s - 1e-9; t += dt) for (const e of step(L, Math.min(dt, s - t))) log.push(e);
  return log;
}
const ids = (log, type) => log.filter(e => e.type === type).map(e => e.id);

// delivery: called from the refectory to a department, the car opens there, the rider boards, rides, alights
{
  const L = makeLift(STOPS, 'ref');
  assert.equal(carY(L), 344);
  call(L, 'a', 'ref', 'd:a');
  const log = run(L, 10);
  assert.deepEqual(log, [{ type: 'board', id: 'a', key: 'ref' }, { type: 'alight', id: 'a', key: 'd:a' }]);
  assert.equal(carY(L), 146);
  assert.equal(doorsOf(L), 0); // shut again, at rest
  // the trip's length: doors open, dwell, doors shut, (344 - 146) px of travel, doors open
  const L2 = makeLift(STOPS, 'ref');
  call(L2, 'a', 'ref', 'd:a');
  const t = 2 * DOOR_S + DWELL_S + 198 / SPEED_PX + DOOR_S;
  assert.deepEqual(run(L2, t - 0.01), [{ type: 'board', id: 'a', key: 'ref' }]);
  assert.deepEqual(run(L2, 0.02), [{ type: 'alight', id: 'a', key: 'd:a' }]);
}

// 5 callers at one floor: two trips, CAP then the rest, each in FIFO order; slots 0..CAP-1
{
  const L = makeLift(STOPS, 'ref');
  for (const id of ['c1', 'c2', 'c3', 'c4', 'c5']) call(L, id, 'ref', 'sanctum');
  assert.deepEqual(['c1', 'c2', 'c3', 'c4', 'c5'].map(id => lineOf(L, id)), [0, 1, 2, 3, 4]);
  const first = run(L, 1);
  assert.deepEqual(ids(first, 'board'), ['c1', 'c2', 'c3']);
  assert.equal(CAP, 3);
  assert.deepEqual(['c1', 'c2', 'c3'].map(id => slotOf(L, id)), [0, 1, 2]);
  assert.deepEqual([lineOf(L, 'c4'), lineOf(L, 'c5'), lineOf(L, 'c1')], [0, 1, -1]); // the line closes up
  const rest = run(L, 30);
  assert.deepEqual(rest.map(e => `${e.type} ${e.id}`), ['alight c1', 'alight c2', 'alight c3', 'board c4', 'board c5', 'alight c4', 'alight c5']);
  assert.equal(slotOf(L, 'c1'), -1);
}

// same-direction pickup on the way; an opposite call is passed, then served on the way back
{
  const L = makeLift(STOPS, 'ref');
  call(L, 'up', 'ref', 'sanctum');
  run(L, 1); // boarded, leaving
  call(L, 'same', 'cog', 'd:a'); // up as well: picked up
  call(L, 'opp', 'd:b', 'ref'); // down: passed
  const log = run(L, 40);
  assert.deepEqual(log.map(e => `${e.type} ${e.id}`), ['board same', 'alight same', 'alight up', 'board opp', 'alight opp']);
}

// an idle car heads for the oldest call first, even past a newer one nearer to it
{
  const L = makeLift(STOPS, 'd:a'); // the old call below it, the new one above
  call(L, 'old', 'ref', 'sanctum');
  call(L, 'new', 'sanctum', 'ref');
  assert.deepEqual(run(L, 40).map(e => `${e.type} ${e.id}`), ['board old', 'alight old', 'board new', 'alight new']);
}

// at a rider's stop, a caller going the other way does not board while the car still goes on its way
{
  const L = makeLift(STOPS, 'ref');
  call(L, 'r1', 'ref', 'cog'); call(L, 'r2', 'ref', 'sanctum');
  run(L, 1);
  call(L, 'opp', 'cog', 'ref'); // waits at r1's stop, going down
  assert.deepEqual(run(L, 40).map(e => `${e.type} ${e.id} ${e.key}`), ['alight r1 cog', 'alight r2 sanctum', 'board opp cog', 'alight opp ref']);
}

// a caller who comes while the doors stand open boards at that same stop
{
  const L = makeLift(STOPS, 'ref');
  call(L, 'a', 'ref', 'sanctum');
  run(L, DOOR_S + 0.1); // the doors open, a on board, the car dwelling
  assert.equal(slotOf(L, 'a'), 0);
  call(L, 'b', 'ref', 'd:a');
  assert.deepEqual(run(L, 40).map(e => `${e.type} ${e.id} ${e.key}`), ['board b ref', 'alight b d:a', 'alight a sanctum']);
}

// a repeat call keeps its place in line and takes the new destination
{
  const L = makeLift(STOPS, 'sanctum');
  call(L, 'a', 'ref', 'd:a');
  call(L, 'b', 'ref', 'd:b');
  call(L, 'a', 'ref', 'cog');
  assert.deepEqual([lineOf(L, 'a'), lineOf(L, 'b')], [0, 1]);
  const log = run(L, 40);
  assert.deepEqual(log.map(e => `${e.type} ${e.id} ${e.key}`), ['board a ref', 'board b ref', 'alight a cog', 'alight b d:b']);
}

// cancel: a waiting call goes, a rider cannot cancel; retarget: a rider gets off elsewhere
{
  const L = makeLift(STOPS, 'sanctum');
  call(L, 'w', 'ref', 'd:a');
  assert.equal(cancel(L, 'w'), true);
  assert.equal(cancel(L, 'w'), false);
  assert.deepEqual(run(L, 20), []);
  call(L, 'r', 'sanctum', 'ref');
  run(L, 1);
  assert.equal(slotOf(L, 'r'), 0);
  assert.equal(cancel(L, 'r'), false);
  assert.equal(retarget(L, 'r', 'd:b'), true);
  assert.deepEqual(run(L, 20), [{ type: 'alight', id: 'r', key: 'd:b' }]);
  assert.equal(carY(L), 190);
  // a call from a rider retargets it too
  call(L, 'q', 'd:b', 'ref'); run(L, 1);
  call(L, 'q', 'd:b', 'sanctum');
  assert.deepEqual(run(L, 20).at(-1), { type: 'alight', id: 'q', key: 'sanctum' });
}

// setStops: a floor that went loses its callers and riders; a moved floor moves the car resting there
{
  const L = makeLift(STOPS, 'ref');
  call(L, 'w', 'd:a', 'ref');
  call(L, 'r', 'ref', 'd:b');
  run(L, 1); // r on board
  const next = new Map(STOPS); next.delete('d:b'); next.set('d:a', 102);
  const lost = setStops(L, next);
  assert.deepEqual(lost, [{ type: 'lost', id: 'r' }]);
  const log = run(L, 30);
  assert.deepEqual(log.map(e => `${e.type} ${e.key}`), ['board d:a', 'alight ref']);
  const M = makeLift(STOPS, 'd:a');
  setStops(M, new Map([...STOPS, ['d:a', 102]]));
  assert.equal(carY(M), 102);
  const N = makeLift(STOPS, 'ref');
  call(N, 'x', 'cog', 'd:b');
  assert.deepEqual(setStops(N, new Map([...STOPS].filter(([k]) => k !== 'cog'))), [{ type: 'lost', id: 'x' }]);
}

// determinism: the same calls and total time give the same events for dt 0.05 and 0.1 (and an uneven split)
{
  const script = dt => {
    const L = makeLift(STOPS, 'ref'), log = [];
    for (const [id, from, to] of [['a', 'ref', 'sanctum'], ['b', 'ref', 'd:a'], ['c', 'cog', 'd:b'], ['d', 'd:a', 'ref'], ['e', 'ref', 'cog']]) call(L, id, from, to);
    run(L, 3, dt, log);
    call(L, 'f', 'sanctum', 'ref'); call(L, 'g', 'd:b', 'cog');
    const at = []; // the car's place and doors at each whole second: the same for every split
    for (let k = 0; k < 40; k++) { run(L, 1, dt, log); at.push([carY(L), doorsOf(L)].map(v => Math.round(v * 1e6) / 1e6)); }
    return { log, y: carY(L), at };
  };
  const a = script(0.05), b = script(0.1), c = script(0.025);
  assert.ok(a.log.length >= 14);
  assert.deepEqual(b.log, a.log);
  assert.deepEqual(c.log, a.log);
  assert.ok(Math.abs(a.y - b.y) < 1e-6);
  assert.deepEqual(b.at, a.at);
  assert.deepEqual(c.at, a.at);
}

// no starvation: random calls over 10 minutes (seeded), each boards within two round trips of the shaft
{
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const keys = [...STOPS.keys()], L = makeLift(STOPS, 'ref'), asked = new Map(), waits = [];
  const span = 344 - 58, trip = 2 * (span / SPEED_PX + keys.length * (2 * DOOR_S + DWELL_S));
  for (let t = 0, k = 0; t < 600; t += 0.1) {
    if (rnd() < 0.015) {
      const id = `p${k++}`, from = keys[Math.floor(rnd() * keys.length)];
      let to = keys[Math.floor(rnd() * keys.length)];
      if (to === from) to = keys[(keys.indexOf(from) + 1) % keys.length];
      call(L, id, from, to); asked.set(id, t);
    }
    for (const e of step(L, 0.1)) if (e.type === 'board') waits.push(t - asked.get(e.id));
  }
  assert.ok(waits.length > 60, `${waits.length} boarded`);
  assert.ok(Math.max(...waits) < 2 * trip, `longest wait ${Math.max(...waits).toFixed(1)} s, bound ${(2 * trip).toFixed(1)} s`);
  assert.ok(L.riders.length <= CAP);
}

console.log('lift ok');
