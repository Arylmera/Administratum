import assert from 'node:assert/strict';
import { vigil, onVigil, secondsLeft, bellDue } from './vigil.js';

onVigil({ armed: true, deadline: null, countdownEnd: 10_000, forced: false });
assert.equal(vigil.armed, true);
assert.equal(secondsLeft(0), 10);
assert.equal(secondsLeft(9_001), 1);
assert.equal(secondsLeft(20_000), 0);
onVigil({ armed: true, deadline: null, countdownEnd: null, forced: false });
assert.equal(secondsLeft(0), null);
assert.equal(bellDue(91, 90), true);
assert.equal(bellDue(90, 89), false);
assert.equal(bellDue(1, 0), true);
assert.equal(bellDue(null, 120), false);
console.log('vigil ok');

// The Watchman (actors.js): in through the gate while armed, patrols a seat, posts at the gate in a countdown, out when
// disarmed; his lantern mirrors with the frame when he faces left.
const { Cast, lanternOf, WATCH_ID } = await import('./actors.js');
const { hallOf } = await import('./layout.js');
const { WATCH, WATCH_AT } = await import('./sprites.js');
const cast = new Cast(), hall = hallOf(0), seat = { x: 60, y: 120 };
cast.sync([], new Map([['s1', seat]]), () => '#000', new Map(), [], hall);
onVigil({ armed: true, deadline: null, countdownEnd: null, forced: false });
cast.update(0);
const w = cast.actors.get(WATCH_ID);
assert.ok(w && w.watch, 'armed: the Watchman walks in');
assert.deepEqual([w.x, w.y], [hall.entry.x, hall.entry.y]);
for (let i = 0; i < 200 && w.pose !== 'patrol'; i++) cast.update(0.1);
assert.deepEqual([w.pose, w.x, w.y], ['patrol', seat.x, seat.y]);
cast.sync([], new Map([['s1', seat]]), () => '#000', new Map(), [], hall); // a roster tick keeps him
assert.equal(w.leaving, false);
onVigil({ countdownEnd: 1 });
for (let i = 0; i < 200 && w.pose !== 'gate'; i++) cast.update(0.1);
assert.deepEqual([w.pose, w.x, w.y], ['gate', hall.entry.x + 36, hall.entry.y - 6]);
w.dir = 'left'; w.pose = 'walk';
assert.equal(lanternOf(w).x - w.x, WATCH.left[0][0].length / 2 - WATCH_AT.light.x - WATCH_AT.feet.x);
w.dir = 'right';
assert.equal(lanternOf(w).x - w.x, WATCH_AT.light.x - WATCH_AT.feet.x);
w.pose = 'gate';
onVigil({ armed: false, countdownEnd: null });
for (let i = 0; i < 200 && cast.actors.has(WATCH_ID); i++) cast.update(0.1);
assert.ok(!cast.actors.has(WATCH_ID), 'disarmed: he walks out');
console.log('watchman ok');
