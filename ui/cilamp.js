// The CI lamps (I6, spec 2026-11-21-ci-verdict-design.md section 5), the state only: one lamp per department (folder),
// the verdict of its last live push. The backend (ci.rs) sends the whole list as the `ci-lamps` event when it changes
// (an empty list when Settings > CI is off) and answers `ci_lamps` with the current one; both go through bridge.js, so the
// phone's remote view gets the event too. Where a lamp stands is layout.js lampSpots, how it is drawn scene.js / scene39.js.
import { invoke, listen } from './bridge.js';

export const LAMP_SIZE = [5, 10]; // logical px (the art is 10 x 20 art px: tools/cilamp_art/kit.mjs)
// The lens's signal colours, fixed in every world: a palette override (sprites.js blit's `over`) for the lens chars of
// each frame, so a theme or a pack that recolours the key slots (flame, phosphor, alarm) never turns green orange. The
// housing and the post keep following the theme. One constant object a frame (the sprite cache keys on it).
export const LENS = {
  'CILAMP.amber': { f: '#f0a83c', F: '#ffe6a0', g: '#b8742a' },
  'CILAMP.amber_dim': { g: '#a86a28', f: '#d08a30', G: '#6e3f17' },
  'CILAMP.green': { c: '#3ddc6c', O: '#e6ffee', C: '#16602f' },
  'CILAMP.red': { a: '#ff3a20', F: '#ffd0a0', x: '#8e1c16' },
};
export const BLINK_MS = 1000; // running: amber and its dim beat, half a second each
const STATES = new Set(['running', 'pass', 'fail', 'timeout', 'error', 'none']);

let list = [];
// The lamps now: [{ dept, cwd, state, branch, sha7, failed }], one per department; empty while the feature is off.
export const lamps = () => list;
export const lampOf = dept => list.find(l => l.dept === dept);

// Takes what the backend sent: a list; an entry without a department is dropped, a state this app does not know is
// unlit, a department that appears twice keeps its last entry.
export function setLamps(next) {
  const by = new Map();
  for (const l of Array.isArray(next) ? next : []) if (typeof l?.dept === 'string' && l.dept) by.set(l.dept, { ...l, state: STATES.has(l.state) ? l.state : 'none' });
  list = [...by.values()];
}

// The frame (a MAPS name) a lamp shows in `state` at `now` (ms): amber blinking while it runs, green after a pass,
// red after a fail, unlit for everything else (none, timeout, error).
export function frameOf(state, now = 0) {
  if (state === 'running') return Math.floor(now / (BLINK_MS / 2)) % 2 === 0 ? 'CILAMP.amber' : 'CILAMP.amber_dim';
  return state === 'pass' ? 'CILAMP.green' : state === 'fail' ? 'CILAMP.red' : 'CILAMP.off';
}

// The lamps to draw: each spot (layout.js lampSpots: { dept, x, y }) whose department has an entry, with its frame and
// state. Nothing while the list is empty.
export function lampsAt(spots, now) {
  if (!list.length) return [];
  const by = new Map(list.map(l => [l.dept, l]));
  return spots.filter(s => by.has(s.dept)).map(s => ({ ...s, state: by.get(s.dept).state, frame: frameOf(by.get(s.dept).state, now) }));
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
