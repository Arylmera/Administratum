import assert from 'node:assert/strict';
import { install, flush } from './testdom.mjs';

// The tags over characters: a stuck tag yields to the sealed tag and to a petition label (overlay.js).
install();
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });
const { initViewport } = await import('./viewport.js');
const { initOverlay, syncLabels, sealText, stuckText } = await import('./overlay.js');

const actors = new Map(), canvas = document.createElement('canvas'), overlay = document.createElement('div');
initViewport({ canvas, overlay, scene: () => ({ w: 1, h: 1 }), iso: () => false, strip: () => false, at: () => [0, 0], relayout: () => {}, setMouse: () => {} });
initOverlay({ cast: { actors }, canvas, overlay, at: () => [0, 0], feet: () => [0, 0],
  strip: () => false, hall: () => null, layout: () => null, roster: () => [], mouse: () => null, actorAt: () => null, paused: () => false, hhmm: d => d.toISOString().slice(11, 16) });
await flush();

const stuck = { kind: 'silent', sinceMs: Date.now() - 20 * 60_000 };
const actor = (id, s, extra = {}) => { const a = { id, s: { name: id, status: 'busy', stuck, ...s }, ...extra }; actors.set(id, a); return a; };

// Busy and stuck, nothing else: the stuck tag speaks, the sealed tag does not.
const plain = actor('plain', {});
assert.match(stuckText(plain), /20/, 'the stuck line');
assert.equal(sealText(plain), '');

// A usage limit says more: the sealed tag shows, the stuck tag yields.
const sealed = actor('sealed', { limit: { resetMs: Date.UTC(2026, 9, 17, 18, 0) } });
assert.equal(stuckText(sealed), '');
assert.equal(sealText(sealed), 'sealed · resets 18:00');

// A pending petition label says more still: it hides both tags. It exists only for an actor queued with a waiting status.
const waiting = actor('waiting', { status: 'waiting', waitingFor: 'approve Bash', limit: { resetMs: 1 } }, { pose: 'queue' });
assert.equal(stuckText(waiting), '', 'stuck without a label yet: the limit already hides it');
assert.notEqual(sealText(waiting), '', 'sealed until its label exists');
const asking = actor('asking', { status: 'waiting', waitingFor: 'approve Bash' }, { pose: 'queue' });
assert.match(stuckText(asking), /20/, 'no label yet: the stuck tag would show');
syncLabels();
assert.equal(stuckText(asking), '', 'the petition label is up: the stuck tag yields');
assert.equal(sealText(waiting), '', 'and so does the sealed tag');

// Away, leaving or helper actors carry no tag at all.
assert.equal(stuckText({ ...plain, leaving: true }), '');
assert.equal(stuckText({ ...plain, h: {} }), '');
console.log('overlay ok');
