// Scribe gestures at the desk: which optional frame a seated scribe shows now. Pure, no imports
// (artcheck.js reads the frame names): actors.js asks it every frame, in both views.
//
// The contract (docs/theme-packs.md, "Gestures"), a closed list with one meaning in every world. A world may draw them
// in its scribe sheets, each the size and feet anchor of the seated frame it replaces (`up 0` flat, `N 0` 2.5D, seen
// from behind at the desk); a gesture a world did not draw is never played and the scribe keeps its seated frame:
//   think    busy at the desk: now and then, for THINK.for s
//   wonder   puzzled: once, PUZZLE_LAG_S s after a tool error at the desk (the error's sparks first), for WONDER.for s;
//            and now and then while its turn's question waits at the desk (question petitions off), for WONDER.for s
//   stretch  once, when its turn ends (busy -> idle) and it starts dozing at the desk, for STRETCH_S s, before the Zs
export const GESTURES = ['think', 'wonder', 'stretch'];
export const GESTURE_FRAMES = { scribe: GESTURES.map(g => `up ${g}`), scribe39: GESTURES.map(g => `N ${g}`) };
// The seated frame each family's gesture frames replace (and take their size from).
export const SEATED_FRAME = { scribe: 'up 0', scribe39: 'N 0' };

// Timings, seconds. A recurring gesture comes every `every` s (each scribe its own period in that range, from its id)
// for `for` s; each time it starts up to JITTER_S s late, so the beat never feels mechanical.
export const THINK = { every: [8, 15], for: 2.5 };
export const WONDER = { every: [10, 15], for: 2 };
export const JITTER_S = 1.5;
export const STRETCH_S = 2;
export const PUZZLE_LAG_S = 0.4;

// A number in [0, 1) from a text (FNV-1a), the same for the same text everywhere.
export function hash01(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0) / 2 ** 32;
}

// Whether a recurring gesture plays at time t (s) for the scribe `id`: its period and phase from the id, the start of
// each period moved by up to JITTER_S from the id and the period's index.
export function recurs(G, id, t) {
  const [lo, hi] = G.every, p = lo + (hi - lo) * hash01(`${id}:${G.every}`), u = t + p * hash01(`${id}:phase`);
  const k = Math.floor(u / p), into = u - k * p, start = JITTER_S * hash01(`${id}:${k}`);
  return into >= start && into < start + G.for;
}

// The chooser. s: the scribe now, { id, desk (seated at its desk), busy (status busy), question (its turn ended on a
// question), done (holding up a finished turn's scroll), dozedFor (s since it started dozing at the desk at the end of
// a turn, null when not), puzzledFor (s since a tool error at the desk, null when none) }; t: its clock (s);
// has(gesture): whether the world draws that gesture (default: all).
// -> 'think' | 'wonder' | 'stretch' | null. A gesture the world lacks is null: the scribe stays as it sits. No bob: the
// scribe, the main character, never jumps at its desk (an adept's typing bob is actors.js's own).
export function gestureOf(s, t, has = () => true) {
  if (!s.desk || s.done) return null;
  const within = (v, from, len) => v != null && v >= from && v < from + len;
  const g = within(s.dozedFor, 0, STRETCH_S) ? 'stretch'
    : within(s.puzzledFor, PUZZLE_LAG_S, WONDER.for) || (s.question && recurs(WONDER, s.id, t)) ? 'wonder'
    : s.busy && recurs(THINK, s.id, t) ? 'think' : null;
  return g && has(g) ? g : null;
}
