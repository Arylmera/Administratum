// The CI lamps (I6, spec 2026-11-21-ci-verdict-design.md section 5; I6b, 2026-11-22-ci-lamps-scribe-main-design.md),
// the state only. Two kinds: a scribe's lamp (CILAMP) beside its desk, the verdict of that session's own last push
// (Session.ci, on the roster: scribeLampsAt), and a department's main lamp (CIMAIN, larger) at its block's east end, the
// verdict of the head commit of its repository's default branch (the main tracker, ci.rs: lampsAt). The backend sends
// the main lamps as the `ci-lamps` event every poll tick, one a second (an empty list when Settings > CI is off), and
// answers `ci_lamps` with the current list; both go through bridge.js, so the phone's remote view gets the event too.
// Where the lamps stand is layout.js scribeSpots / mainSpots, how they are drawn scene.js / scene39.js.
import { invoke, listen } from './bridge.js';

export const LAMP_SIZE = [5, 10]; // logical px (the art is 10 x 20 art px: tools/cilamp_art/kit.mjs)
export const MAIN_SIZE = [7, 14]; // the department's main lamp, logical px (CIMAIN, 14 x 28 art px: tools/cimain_art/kit.mjs)
// The lens's signal colours, fixed in every world: a palette override (sprites.js blit's `over`) for the lens chars of
// each frame, so a theme or a pack that recolours the key slots (flame, phosphor, alarm) never turns green orange. The
// housing and the post keep following the theme. One constant object a frame (the sprite cache keys on it).
export const LENS = {
  'CILAMP.amber': { f: '#f0a83c', F: '#ffe6a0', g: '#b8742a' },
  'CILAMP.amber_dim': { g: '#a86a28', f: '#d08a30', G: '#6e3f17' },
  'CILAMP.green': { c: '#3ddc6c', O: '#e6ffee', C: '#16602f' },
  'CILAMP.red': { a: '#ff3a20', F: '#ffd0a0', x: '#8e1c16' },
  // the department's main lamp (CIMAIN): the same lens chars and signal colours as the matching CILAMP frame
  'CIMAIN.amber': { f: '#f0a83c', F: '#ffe6a0', g: '#b8742a' },
  'CIMAIN.amber_dim': { g: '#a86a28', f: '#d08a30', G: '#6e3f17' },
  'CIMAIN.green': { c: '#3ddc6c', O: '#e6ffee', C: '#16602f' },
  'CIMAIN.red': { a: '#ff3a20', F: '#ffd0a0', x: '#8e1c16' },
};
// The lens glows: a light at each lit lamp (lighting.js punches a hole in the night over the hall and adds a glow), in the
// signal colour whatever the theme. Without it the lens is a few dark pixels under the night layer and cannot be seen.
// [colour, radius, the lens's height over the foot]: the scribe's lens 7 px up, the main lamp's 11 (its art's rows 3-8 of 28).
const GLOW = {
  'CILAMP.amber': ['rgba(240,168,60,.6)', 12, 7], 'CILAMP.amber_dim': ['rgba(240,168,60,.3)', 7, 7], 'CILAMP.green': ['rgba(61,220,108,.55)', 12, 7], 'CILAMP.red': ['rgba(255,58,32,.6)', 12, 7],
  'CIMAIN.amber': ['rgba(240,168,60,.6)', 16, 11], 'CIMAIN.amber_dim': ['rgba(240,168,60,.3)', 9, 11], 'CIMAIN.green': ['rgba(61,220,108,.55)', 16, 11], 'CIMAIN.red': ['rgba(255,58,32,.6)', 16, 11],
};
export const lampLights = drawn => drawn.filter(l => GLOW[l.frame]).map(l => ({ x: l.x, y: l.y - GLOW[l.frame][2], r: GLOW[l.frame][1], color: GLOW[l.frame][0] }));
export const BLINK_MS = 1000; // running: amber and its dim beat, half a second each
const STATES = new Set(['running', 'pass', 'fail', 'timeout', 'error', 'none']);

let list = [];
// The main lamps now: [{ dept, cwd, state, branch, sha7, failed }], one per department (branch: its default branch);
// empty while the feature is off.
export const lamps = () => list;
export const lampOf = dept => list.find(l => l.dept === dept);

// Takes what the backend sent: a list; an entry without a department is dropped, a state this app does not know is
// unlit, a department that appears twice keeps its last entry. It comes every second: a list equal to the current one
// keeps the current one (the same object), so nothing downstream sees a change.
const FIELDS = ['dept', 'cwd', 'state', 'branch', 'sha7', 'failed'];
const same = (a, b) => a.length === b.length && a.every((l, i) => FIELDS.every(k => l[k] === b[i][k]));
export function setLamps(next) {
  const by = new Map();
  for (const l of Array.isArray(next) ? next : []) if (typeof l?.dept === 'string' && l.dept) by.set(l.dept, { ...l, state: STATES.has(l.state) ? l.state : 'none' });
  const fresh = [...by.values()];
  if (!same(fresh, list)) list = fresh;
}

// The frame (a MAPS name) a lamp of `family` (CILAMP, the scribe's; CIMAIN, the department's) shows in `state` at `now`
// (ms): amber blinking while it runs, green after a pass, red after a fail, unlit for everything else (none, timeout, error).
export function frameOf(state, now = 0, family = 'CILAMP') {
  if (state === 'running') return Math.floor(now / (BLINK_MS / 2)) % 2 === 0 ? `${family}.amber` : `${family}.amber_dim`;
  return `${family}.${state === 'pass' ? 'green' : state === 'fail' ? 'red' : 'off'}`;
}

// The main lamps to draw: each spot (layout.js mainSpots: { dept, x, y }) whose department has an entry, with its state,
// its CIMAIN frame and its size. Nothing while the list is empty.
export function lampsAt(spots, now) {
  if (!list.length) return [];
  const by = new Map(list.map(l => [l.dept, l]));
  return spots.filter(s => by.has(s.dept)).map(s => ({ ...s, state: by.get(s.dept).state, frame: frameOf(by.get(s.dept).state, now, 'CIMAIN'), size: MAIN_SIZE }));
}
// The scribe lamps to draw: each spot (layout.js scribeSpots: { id, dept, x, y }) whose session (by id in `sessions`, the
// roster) has a CI of its own in a known state other than none, with its state, its CILAMP frame and its size.
export function scribeLampsAt(spots, sessions, now) {
  const by = new Map((sessions ?? []).filter(s => STATES.has(s?.ci?.state) && s.ci.state !== 'none').map(s => [s.id, s.ci.state]));
  return spots.filter(s => by.has(s.id)).map(s => ({ ...s, state: by.get(s.id), frame: frameOf(by.get(s.id), now), size: LAMP_SIZE }));
}

// Listens to the event and asks for the list once (a UI that starts after the event missed it). An event that arrives
// before the answer is newer: the answer then does not overwrite it. `bridge` is for the tests.
let started = false;
export function start(bridge = { invoke, listen }) {
  if (started) return;
  started = true;
  let fresh = false;
  Promise.resolve(bridge.listen('ci-lamps', e => { fresh = true; setLamps(e.payload); })).catch(() => {});
  Promise.resolve(bridge.invoke('ci_lamps')).then(r => { if (!fresh) setLamps(r); }, () => {}); // the remote view has no command: the event does it
}
export const restart = () => { started = false; list = []; };
start();
