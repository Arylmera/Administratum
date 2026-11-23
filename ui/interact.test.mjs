// Interactions (actors.js, scene.js; spec 2026-11-23-liveliness, round two): the finished adept's report, the forked
// child's order, the Magos's greeting. Run: node ui/interact.test.mjs
import assert from 'node:assert/strict';
import { Cast, REPORT_S, FX_S } from './actors.js';
import { planLayout, layoutDepartments, hallOf, SCENE } from './layout.js';
import { settings } from './settings.js';
import { orderOf } from './scene.js';

const depts = [{ name: 'D', color: '#fff', ids: ['p', 'c', 'q'], helpers: ['p|h1'] }];
const P = planLayout(null, depts, 0, {}, SCENE, layoutDepartments), H = hallOf(P.bays);
assert.ok(P.consoleSeats.get('p|h1') && P.seats.get('p'), 'the fixture seats them');
const sess = (id, more) => ({ id, dept: 'D', status: 'busy', sinceMs: Date.now(), context: null, helpers: [], ...more });
const helper = { id: 'h1', kind: 'Explore', task: 'x' };
const sync = (c, roster, hall = H) => c.sync(roster, P.seats, () => '#fff', P.consoleSeats, P.blocks, hall);
const run = (c, s, each) => { for (let k = 0; k < s * 20; k++) { c.update(0.05); each?.(); } };

// ---- an adept that finishes goes to its owner's desk, stays REPORT_S, then leaves ----
const start = (more = {}) => { const c = new Cast(); sync(c, [sess('p', { helpers: [helper], ...more })]); run(c, 40); assert.equal(c.actors.get('p|h1').pose, 'console'); return c; };
const trip = (c, roster = [sess('p')]) => { sync(c, roster); let told = 0; run(c, 60, () => { const a = c.actors.get('p|h1'); if (a?.pose === 'report') { told += 0.05; assert.ok(Math.hypot(a.x - P.seats.get('p').x, a.y - P.seats.get('p').y) < 16, 'beside its owner'); } }); return told; };
let c = start(), told = trip(c);
assert.ok(Math.abs(told - REPORT_S) < 0.2, `it reports (${told.toFixed(2)} s)`);
assert.ok(!c.actors.has('p|h1'), 'then it is gone');
// resyncs on the way (one a second) do not restart or lose the report
c = start(); sync(c, [sess('p')]); told = 0;
for (let i = 0; i < 60; i++) { run(c, 1, () => { if (c.actors.get('p|h1')?.pose === 'report') told += 0.05; }); sync(c, [sess('p')]); }
assert.ok(Math.abs(told - REPORT_S) < 0.2 && !c.actors.has('p|h1'), `once, over resyncs (${told.toFixed(2)} s)`);
// its owner gone, or away from its desk: straight out; off: straight out
assert.equal(trip(start(), []), 0, 'owner gone');
c = start(); c.actors.get('p').pose = 'queue'; assert.equal(trip(c, [sess('p', { status: 'waiting', waitingFor: 'x' })]), 0, 'owner in the queue');
settings.liveliness = 'off'; assert.equal(trip(start()), 0, 'off'); settings.liveliness = 'full';
// back at work before it got there: it returns to its console, and reports again when it ends
c = start(); sync(c, [sess('p')]); run(c, 0.3); sync(c, [sess('p', { helpers: [helper] })]); run(c, 20);
assert.equal(c.actors.get('p|h1').pose, 'console', 'back to work');
assert.ok(trip(c) > 1, 'and reports when it ends');
// its owner leaves while it reports: out, never stuck
c = start(); sync(c, [sess('p')]); run(c, 0.2); sync(c, []); told = 0; run(c, 60, () => { if (c.actors.get('p|h1')?.pose === 'report') told++; });
assert.equal(told, 0, 'nobody to report to'); assert.equal(c.actors.size, 0, 'nobody stuck');

// ---- a newly forked child's order ----
const orders = a => (a?.fx ?? []).filter(f => f.kind === 'order').length;
c = new Cast(); sync(c, [sess('p'), sess('c', { parent: 'p' })]);
assert.equal(orders(c.actors.get('c')), 0, 'the first roster plays nothing');
run(c, 40); sync(c, [sess('p'), sess('c', { parent: 'p' }), sess('q', { parent: 'p' })]);
assert.equal(orders(c.actors.get('q')), 1, 'a new child');
assert.equal(orders(c.actors.get('c')), 0, 'not the old one');
sync(c, [sess('p'), sess('c', { parent: 'p' }), sess('q', { parent: 'p' })]);
assert.equal(orders(c.actors.get('q')), 1, 'once');
run(c, FX_S.order + 0.2); assert.equal(orders(c.actors.get('q')), 0, 'and over');
const f = { t: 0, from: { x: 10, y: 20 } }, at = { x: 100, y: 50 }, AT = { seals: [[2, 30]] }, pos = t => orderOf({ ...f, t }, at, AT, 0);
assert.deepEqual([pos(0).x, pos(0).y], [10, 20], 'from the Suzerain');
assert.ok(Math.abs(pos(FX_S.order / 2).x - 103.5) < 1e-6 && Math.abs(pos(FX_S.order / 2).y - 74) < 1e-6, 'to the desk');
assert.ok(Math.abs(pos(FX_S.order).x - 10) < 1e-6, 'and back');
assert.equal(pos(0.5).carry, true); assert.equal(pos(3).carry, false, 'the seal set down');
for (const [why, hall] of [['strip', { ...H, strip: true }]]) { c = new Cast(); sync(c, [sess('p')], hall); run(c, 40); c.actors.get('p').pose = 'desk'; sync(c, [sess('p'), sess('c', { parent: 'p' })], hall); assert.equal(orders(c.actors.get('c')), 0, why); }

// ---- the Magos greets a new petitioner, not the first roster's, not one already there ----
c = new Cast(); sync(c, [sess('p', { status: 'waiting', waitingFor: 'x' })]);
assert.equal(c.greetAt, undefined, 'the first roster');
sync(c, [sess('p', { status: 'waiting', waitingFor: 'x' })]); assert.equal(c.greetAt, undefined, 'already there');
sync(c, [sess('p', { status: 'waiting', waitingFor: 'x' }), sess('c', { status: 'waiting', waitingFor: 'x' })]);
assert.ok(Date.now() - c.greetAt < 1000, 'a new one');
console.log('interact ok');
