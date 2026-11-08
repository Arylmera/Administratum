// The desktop column's elevator (column.js): one car over named stops (floor key -> foot y, logical px), pure: no
// clock, no randomness, the caller steps it. A scribe calls it from its floor's landing and boards when the doors are
// open; up to CAP ride at once. SCAN collective control: an idle car heads for the oldest call (FIFO number n, kept
// across repeat calls); a moving car stops at the nearest stop ahead where a rider alights, a call waits to go the
// same way, or any call waits with nothing further ahead; at a stop it lets riders off, then boards waiting callers
// in n order while their way matches the car's next way (any way when it has none). step() is event-exact: it
// advances to each transition in turn, so the same calls and total time give the same events however dt is split.
export const CAP = 3, SPEED_PX = 90, DOOR_S = 0.25, DWELL_S = 0.6;
const EPS = 1e-6;

// at: the stop the car starts at (doors shut).
export function makeLift(stops, at) {
  return { stops: new Map(stops), y: stops.get(at) ?? 0, at, dir: 0, state: 'idle', doors: 0, dwell: 0, seq: 0, calls: new Map(), riders: [] };
}
const yOf = (L, key) => L.stops.get(key);
const sign = v => (v > EPS ? 1 : v < -EPS ? -1 : 0);
const wayOf = (L, c) => sign(yOf(L, c.to) - yOf(L, c.from));
const ahead = (L, y, d) => (y - L.y) * d > EPS;

// New stops (a floor came, went or moved): calls and riders bound for a stop that is gone are dropped ('lost': the
// caller snaps that actor to its destination); a car stopped at a moved floor moves with it.
export function setStops(L, stops) {
  L.stops = new Map(stops);
  const lost = [];
  for (const [id, c] of L.calls) if (!L.stops.has(c.from) || !L.stops.has(c.to)) { L.calls.delete(id); lost.push({ type: 'lost', id }); }
  L.riders = L.riders.filter(r => L.stops.has(r.to) || (lost.push({ type: 'lost', id: r.id }), false));
  if (L.at != null && L.stops.has(L.at)) L.y = yOf(L, L.at);
  else if (L.at != null) { L.at = null; if (L.state !== 'moving') { L.state = 'moving'; L.doors = 0; } } // its floor went: it moves on
  return lost;
}
// A call from `from` to `to`. Idempotent per id: a repeat keeps its FIFO number and takes the new `to`; a rider's call
// retargets it.
export function call(L, id, from, to) {
  if (L.riders.some(r => r.id === id)) return retarget(L, id, to);
  if (from === to || !L.stops.has(from) || !L.stops.has(to)) return cancel(L, id);
  const c = L.calls.get(id);
  if (c) Object.assign(c, { from, to });
  else L.calls.set(id, { id, n: ++L.seq, from, to });
  return true;
}
// Withdraws a waiting call (not a rider). Returns whether there was one.
export const cancel = (L, id) => L.calls.delete(id);
// A rider's new destination.
export function retarget(L, id, to) {
  const r = L.riders.find(r => r.id === id);
  if (!r || !L.stops.has(to)) return false;
  r.to = to;
  return true;
}
export const carY = L => L.y, doorsOf = L => L.doors;
export const slotOf = (L, id) => L.riders.find(r => r.id === id)?.slot ?? -1;
// Its place in the line at its floor's landing (n order), or -1 when it is not waiting.
export function lineOf(L, id) {
  const c = L.calls.get(id);
  if (!c) return -1;
  return [...L.calls.values()].filter(o => o.from === c.from && o.n < c.n).length;
}

// Is there work strictly ahead of the car in way d: a rider's stop, or a waiting call?
const workAhead = (L, d) => L.riders.some(r => ahead(L, yOf(L, r.to), d)) || [...L.calls.values()].some(c => ahead(L, yOf(L, c.from), d));
// The way the car goes on from here: on, while work lies ahead; else toward its riders; else none (any caller may board).
function nextDir(L) {
  if (L.dir && workAhead(L, L.dir)) return L.dir;
  if (L.riders.length) return sign(yOf(L, L.riders[0].to) - L.y);
  return 0;
}
// The nearest stop ahead in way d worth stopping at, or null.
function stopAhead(L, d) {
  let best = null;
  for (const [key, y] of L.stops) {
    if (!ahead(L, y, d) || (best && (y - yOf(L, best)) * d > 0)) continue;
    const waits = [...L.calls.values()].filter(c => c.from === key);
    const beyond = () => L.riders.some(r => (yOf(L, r.to) - y) * d > EPS) || [...L.calls.values()].some(c => (yOf(L, c.from) - y) * d > EPS);
    if (L.riders.some(r => r.to === key) || waits.some(c => wayOf(L, c) === d) || (waits.length && !beyond())) best = key;
  }
  return best;
}
const oldest = L => [...L.calls.values()].reduce((p, c) => (!p || c.n < p.n ? c : p), null);
// Riders off, then callers on (n order, up to CAP, their way matching the car's next way): the doors are open.
function exchange(L, out) {
  for (const r of L.riders.filter(r => r.to === L.at)) out.push({ type: 'alight', id: r.id, key: L.at });
  L.riders = L.riders.filter(r => r.to !== L.at);
  let d = nextDir(L);
  for (const c of [...L.calls.values()].filter(c => c.from === L.at).sort((p, q) => p.n - q.n)) {
    if (L.riders.length >= CAP) break;
    const w = wayOf(L, c);
    if (d && w !== d) continue;
    d = w;
    L.calls.delete(c.id);
    const used = new Set(L.riders.map(r => r.slot)), slot = [0, 1, 2].find(s => !used.has(s));
    L.riders.push({ id: c.id, to: c.to, slot });
    out.push({ type: 'board', id: c.id, key: L.at });
  }
  if (d) L.dir = d;
}
// Leaves a stop (or an idle rest) toward work, or rests. Zero time.
function depart(L) {
  if (L.at != null && L.riders.some(r => r.to === L.at)) { L.state = 'opening'; return; } // a rider retargeted to this floor
  const d = nextDir(L);
  if (d) { L.dir = d; L.state = 'moving'; L.at = null; return; }
  const c = oldest(L);
  if (!c) { L.dir = 0; L.state = 'idle'; return; }
  if (c.from === L.at) { L.state = 'opening'; return; }
  L.dir = sign(yOf(L, c.from) - L.y); L.state = 'moving'; L.at = null;
}

// Advances the car by dt seconds. Returns its events in order: { type: 'board' | 'alight', id, key }.
export function step(L, dt) {
  const out = [];
  for (let guard = 0; guard < 1000; guard++) {
    if (L.state === 'idle') {
      if (!L.calls.size && !L.riders.length) break;
      depart(L);
      if (L.state === 'idle') break;
      continue;
    }
    if (L.state === 'moving') {
      let key = L.dir ? stopAhead(L, L.dir) : null;
      if (!key) { // nothing ahead: turn back toward work, or settle on the nearest stop
        const c = oldest(L), back = L.riders.length ? sign(yOf(L, L.riders[0].to) - L.y) : c ? sign(yOf(L, c.from) - L.y) : 0;
        if (back && back !== L.dir) { L.dir = back; continue; }
        if (!back && (L.riders.length || c)) { L.at = L.riders[0]?.to ?? c.from; L.state = 'opening'; continue; } // already there
        key = [...L.stops.keys()].reduce((p, k) => (!p || Math.abs(yOf(L, k) - L.y) < Math.abs(yOf(L, p) - L.y) ? k : p), null);
        if (key == null) break;
        if (Math.abs(yOf(L, key) - L.y) <= EPS) { L.y = yOf(L, key); L.at = key; L.state = c || L.riders.length ? 'opening' : 'idle'; if (L.state === 'idle') L.dir = 0; continue; }
        L.dir = sign(yOf(L, key) - L.y);
      }
      if (dt <= EPS) break;
      const dist = Math.abs(yOf(L, key) - L.y), t = dist / SPEED_PX;
      if (t <= dt + EPS) { dt = Math.max(0, dt - t); L.y = yOf(L, key); L.at = key; L.state = L.calls.size || L.riders.length ? 'opening' : 'idle'; if (L.state === 'idle') L.dir = 0; continue; }
      L.y += L.dir * SPEED_PX * dt; dt = 0;
      break;
    }
    if (L.state === 'opening') {
      const t = (1 - L.doors) * DOOR_S;
      if (t > dt + EPS) { L.doors += dt / DOOR_S; dt = 0; break; }
      dt = Math.max(0, dt - t); L.doors = 1; L.state = 'dwell'; L.dwell = DWELL_S;
      exchange(L, out);
      continue;
    }
    if (L.state === 'dwell') {
      exchange(L, out); // a caller who came while the doors stand open boards too
      if (L.dwell > dt + EPS) { L.dwell -= dt; dt = 0; break; }
      dt = Math.max(0, dt - L.dwell); L.dwell = 0; L.state = 'closing';
      continue;
    }
    if (L.state === 'closing') {
      const t = L.doors * DOOR_S;
      if (t > dt + EPS) { L.doors -= dt / DOOR_S; dt = 0; break; }
      dt = Math.max(0, dt - t); L.doors = 0;
      depart(L);
      if (L.state === 'idle') break;
      continue;
    }
  }
  return out;
}
