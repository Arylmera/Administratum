import { SCRIBE, SCRIBE_AT, ADEPT, ADEPT_AT, SCRIBE39, SCRIBE39_AT, ADEPT39, ADEPT39_AT, WATCH, WATCH_AT, WATCH39, WATCH39_AT, MAPS, RES, rankOf, blit, sprite, marked, half } from './sprites.js';
import { T, onTheme, hexA } from './theme.js';
import { route, roomOf, hallOf, SLOT_H } from './layout.js';
import { settings, questions } from './settings.js';
import { view } from './view.js';
import { vigil } from './vigil.js';
import { makeLift, setStops, call, cancel, retarget, step as liftStep, carY, slotOf, lineOf } from './lift.js';
import { floorAt } from './column.js';

const SPEED = 80; // logical px per second
// The strip spans the whole screen, so a walk there takes twice the hall's speed (a wide screen's crossing stays short).
// The column is short: its walks keep the hall's speed.
const speed = () => (view.strip && !view.column ? 2 * SPEED : SPEED);
const RIDE_DX = [-5, 0, 5]; // a rider's place in the car (lift.js slotOf), from the car's centre
const STRIDE = SPEED / 16; // px walked per walk frame: the legs keep pace with the speed
// Thresholds come from the settings panel (settings.js), read live:
const COG_HOLD_MS = () => settings.cogHoldS * 1000; // a busy scribe stays at the cogitator this long after its last shell command
const NAP_MS = () => settings.napMin * 60_000; // idle this long (no background shell) and a scribe leaves for the refectorium
const RECAFF_S = 2; // seconds at the recaff dispenser on the way to a bench
const STALE_MS = () => settings.staleMin * 60_000; // a petition waiting longer escalates (alarm beacon, servo-skull, header alarm); backend toasts at the same mark (set_stale_minutes)
export const isStale = s => s.status === 'waiting' && s.sinceMs > 0 && Date.now() - s.sinceMs > STALE_MS();
// A turn that ended on a question (backend `question`, idle only) queues like a petition, behind the real ones.
export const isQuestion = s => questions.on && !!s.question && s.status !== 'waiting';
const isPetitioner = s => s.status === 'waiting' || isQuestion(s);
export const BURN_S = 1.5; // a compacted pile burns this long at the brazier
export const PUFF_S = 0.8; // ...or goes up in a puff on the desk when its scribe is away
// Fire points of the grand gate's two braziers (DECOR in scene.js); the burner stands on the aisle just north.
const braziers = entry => [entry.x - 23, entry.x + 23].map(x => ({ x, y: entry.y - 11 }));
// Chronicle reactions (scene.js draws them): seconds each plays. Test lamps are a.lamp, not an fx.
export const FX_S = { commit: 3, push: 4.4, 'tool-error': 1, 'task-done': 1.5 };
export const PICK_S = 1.6; // the push courier reaches the desk and takes the newest seal
export const LAMP_S = 20;
export const FRESH_MS = 120_000; // older events (history, a first scan's backlog) play nothing
// Night Vigil's Watchman (id 'watch', a.watch, no session: never a.s nor a.h): in through the gate while the vigil is
// armed, out when disarmed. He patrols the aisle beside each seat (a desk's or lectern's, PATROL_S at each); during the
// countdown he posts beside the gate, past its east brazier, facing down (in the opening its frame hides him). Never
// in the strip (its gate is off-screen).
export const WATCH_ID = 'watch';
const PATROL_S = 3;
export const RING_S = 1; // the bell raised (WATCH.ring) at each 30 s mark (app.js rings it)

export class Cast {
  constructor() { this.actors = new Map(); this.naps = new Map(); this.hall = hallOf(0); } // naps: scribe id -> hall.refectory index

  // hall: hallOf() of the scene's size and the layout's bays (rooms, gate, queue, aisle and lanes follow it).
  sync(roster, seats, colorOf, consoleSeats, blocks, hall = hallOf(0)) {
    // The desktop column (column.js): one lift for the cast (lift.js), new on entry; its floors moved: everyone on them moves too.
    if (!hall.column) this.lift = null;
    else if (!this.lift || !this.hall.column) this.lift = makeLift(hall.stops, 'ref');
    else if (hall.floorsKey !== this.hall.floorsKey) this.floorsMoved(this.hall, hall);
    if (!hall.column && (hall.w !== this.hall.w || hall.baseH !== this.hall.baseH || hall.rooms !== this.hall.rooms)) this.resized(this.hall, hall);
    this.hall = hall;
    const ENTRY = hall.entry;
    const live = new Set(roster.map(s => s.id));
    // New actors walk in through the gate; known ones take the fresh data (and stop leaving if they were).
    const upsert = (id, fields, at = ENTRY) => {
      const a = this.actors.get(id);
      if (a) Object.assign(a, fields, { leaving: false });
      else this.actors.set(id, { id, x: at.x, y: at.y, path: [], target: null, destKey: '', dir: 'up', t: 0, pose: 'walk', leaving: false, ...fields });
    };
    for (const s of roster) {
      const a = this.actors.get(s.id); // a.s is still last poll's session here
      if (a && s.compactedAt && s.compactedAt !== a.s.compactedAt) this.compacted(a); // a new actor's past compactions don't count
      upsert(s.id, { s, sash: colorOf(s.dept) });
    }
    for (const s of roster) for (const h of s.helpers ?? []) {
      const id = `${s.id}|${h.id}`;
      live.add(id);
      const seat = consoleSeats.get(id); // in the column an adept appears at its floor's landing: adepts never ride
      upsert(id, { owner: s.id, h }, hall.column && seat ? hall.landing(floorAt(hall, seat.y)) : ENTRY);
    }
    if (this.watchOn()) live.add(WATCH_ID);
    for (const a of this.actors.values()) if (!live.has(a.id)) a.leaving = true;
    const waiting = roster.filter(isPetitioner).sort((p, q) => isQuestion(p) - isQuestion(q) || p.sinceMs - q.sinceMs).map(s => s.id);
    // Hysteresis: Bash calls flip a session busy<->shell every few seconds; don't walk back and forth for each one.
    const now = Date.now();
    for (const s of roster) { const a = this.actors.get(s.id); if (s.status === 'shell') a.lastShell = now; }
    const atCog = s => s.status === 'shell' || (s.status === 'busy' && now - (this.actors.get(s.id).lastShell ?? 0) < COG_HOLD_MS());
    const shell = roster.filter(atCog).map(s => s.id);
    this.last = { seats, waiting, shell, blocks }; // for a burner heading back between polls
    // Scribes first (Map order is insertion order, adepts may predate a re-added owner), then their adepts.
    const all = [...this.actors.values()];
    for (const a of all.filter(a => !a.h).concat(all.filter(a => a.h))) {
      this.go(a, a.h ? this.atConsole(a, consoleSeats) : this.destination(a, seats, waiting, shell), blocks);
    }
  }

  // Refectory benches, decided before the layout (a scribe on a bench releases its desk, planLayout): a sleeper keeps
  // its bench until it wakes; more sleepers than benches doze at their desk. Returns the ids on a bench.
  // spots: the refectory's (hallOf().refectory); a sleeper whose bench went with a smaller room takes another.
  napping(roster, spots = this.hall.refectory, now = Date.now()) {
    for (const [id, i] of this.naps) if (i >= spots.length) this.naps.delete(id);
    const sleepy = roster.filter(s => s.status === 'idle' && !s.temp && !s.background && !s.limit && !isQuestion(s) && s.sinceMs && now - s.sinceMs > NAP_MS()).sort((p, q) => p.sinceMs - q.sinceMs); // the break-out room dozes at its desks
    for (const id of this.naps.keys()) if (!sleepy.some(s => s.id === id)) this.naps.delete(id);
    for (const s of sleepy) {
      if (this.naps.has(s.id)) continue;
      const free = spots.findIndex((_, i) => ![...this.naps.values()].includes(i));
      if (free >= 0) this.naps.set(s.id, free);
    }
    return new Set(this.naps.keys());
  }

  go(a, d, blocks) {
    const key = `${d.x},${d.y},${d.pose}`;
    if (key === a.destKey) return;
    a.destKey = key;
    const from = { x: a.x, y: a.y, via: a.pose === 'console' ? a.target.via : undefined }; // leaving a console the way it came
    a.target = d;
    a.wait = 0;
    a.pose = 'walk';
    const H = this.hall, R = H.route ?? route;
    if (a.snap) { a.snap = false; Object.assign(a, { x: d.x, y: d.y, path: [] }); return; } // its floor went mid-trip (lift.js lost)
    if (a.ride) { // in the lift's line or its car (the column): a new destination
      const to = floorAt(H, d.y), at = a.path.find(p => p.lift)?.lift.from;
      const tail = [...(d.pose === 'nap' ? [{ ...H.recaff, wait: RECAFF_S }] : []), { x: d.x, y: d.y }];
      if (a.ride === 'in') { retarget(this.lift, a.id, to); a.path = [{ ...H.landing(to), lift: { from: at, to } }, ...tail]; return; }
      if (to !== at) { call(this.lift, a.id, at, to); a.path = [{ ...H.landing(to), lift: { from: at, to } }, ...tail]; return; } // keeps its place
      cancel(this.lift, a.id); a.ride = null; a.still = false; // the same floor after all: it walks on from the line
    }
    if (a.x === d.x && a.y === d.y) { a.path = []; return; } // already there (a resize re-routing everyone)
    a.path = d.pose === 'nap' ? R(from, H.recaff, blocks, H).concat({ x: d.x, y: d.y }) : R(from, d, blocks, H);
    if (d.pose === 'nap') a.path.at(-2).wait = RECAFF_S;
  }

  // The window resized the scene: whoever stands in the refectorium or the sanctum moves with the room (anchored
  // east, the sanctum by its top wall), a scribe east of the narrower scriptorium's corridor steps onto it, and
  // everyone re-routes from where they stand (sync: the walks follow the new corridor, doors and lanes). The west wing
  // coming or going (layout.js hallOf wx) moves the scriptorium too; whoever stands in a wing room moves with its room
  // (rooms above it grew or shrank), onto its nearest lane if its room shrank from under it, and to the room's door
  // (hall side) if the room went.
  resized(from, to) {
    for (const a of this.actors.values()) {
      const room = roomOf(a, from);
      if (room.startsWith('w:')) { // by the rows its room moved (layout.js SLOT_H); its room gone, at its door's hall side
        const R0 = from.rooms.find(R => `w:${R.id}` === room), R1 = to.rooms?.find(R => R.id === R0.id);
        if (R1) {
          a.y += SLOT_H * (R1.k - R0.k);
          // its room lost rows under it (the wing's spare rows re-shared): onto the room's nearest lane, never in a wall
          if (a.y < R1.y || a.y >= R1.y + R1.h) a.y = R1.lanes.reduce((p, q) => (Math.abs(q - a.y) < Math.abs(p - a.y) ? q : p));
        } else Object.assign(a, { x: R0.doorOut.x + (to.wx ?? 0) - from.wx, y: R0.doorOut.y });
        a.destKey = '';
        continue;
      }
      if (room !== 'hall') { a.x += to.ox - from.ox; if (room === 'sanct') a.y += to.sd - from.sd; }
      else a.x = Math.min(a.x + (to.wx ?? 0) - (from.wx ?? 0), to.corridorX); // ponytail: a short hop, only when the window narrows
      a.destKey = '';
      if (a.burn) a.burn.fire = braziers(to.entry).reduce((p, q) => (Math.abs(q.x - a.x) < Math.abs(p.x - a.x) ? q : p));
    }
  }

  // The column's floors moved (a department came or went, the screen's height changed): everyone not in the car moves
  // with their floor (never a lift trip), and is re-routed; the lift takes the new stops, and a caller or rider whose
  // floor went snaps to its destination.
  floorsMoved(from, to) {
    const dy = new Map(from.floors.map(f => [f.key, to.stops.has(f.key) ? to.stops.get(f.key) - f.y : 0]));
    const shift = p => { const k = floorAt(from, p.y); if (k) p.y += dy.get(k); };
    for (const a of this.actors.values()) {
      if (a.ride === 'in') continue;
      shift(a);
      for (const p of a.path) shift(p);
      if (!a.ride) a.destKey = '';
    }
    for (const e of setStops(this.lift, to.stops)) this.onLift(e);
  }
  // A lift event (lift.js step, setStops): on board, off at the landing (on to its destination), or snapped there.
  onLift(e) {
    const a = this.actors.get(e.id);
    if (!a) return;
    if (e.type === 'board') { a.ride = 'in'; a.still = false; }
    else if (e.type === 'alight') { a.ride = null; Object.assign(a, this.hall.landing(e.key)); if (a.path[0]?.lift) a.path.shift(); }
    else if (e.type === 'lost') { a.ride = null; a.still = false; a.snap = true; a.destKey = ''; }
  }
  // Entering the column: everyone is already where they are going (only later arrivals ride).
  settle() {
    for (const a of [...this.actors.values()]) {
      const t = a.target;
      if (!t || a.ride) continue;
      if (t.pose === 'gone') { this.actors.delete(a.id); continue; }
      Object.assign(a, { x: t.x, y: t.y, path: [], wait: 0, pose: t.pose });
    }
  }

  // The session compacted its context: a seated scribe carries its old pile to the nearest brazier and burns it;
  // anywhere else (cogitator, queue, refectory, on the way) the desk pile just goes up in a puff.
  compacted(a) {
    if (a.pose !== 'desk' || this.hall.strip || a.s.temp) { a.puff = PUFF_S; return; } // no brazier in the strip, none for the break-out room
    const fire = braziers(this.hall.entry).reduce((p, q) => (Math.abs(q.x - a.x) < Math.abs(p.x - a.x) ? q : p));
    a.burn = { fire, old: a.s.context, left: BURN_S };
  }

  // A live `chronicle` event: the session's scribe (or, from a subagent, its adept of that kind) reacts at its
  // desk/console. Returns whether anything plays.
  chronicle(e, now = Date.now()) {
    if (!(now - e.ts < FRESH_MS)) return false;
    const a = e.helper ? [...this.actors.values()].find(a => a.owner === e.sessionId && a.h.kind === e.helper) : this.actors.get(e.sessionId);
    if (!a || a.leaving) return false;
    if (e.kind === 'tests-pass' || e.kind === 'tests-fail') { a.lamp = { ok: e.kind === 'tests-pass', t: 0 }; return true; }
    if (!FX_S[e.kind]) return false;
    if (e.kind === 'commit' && !a.h) a.seals = Math.min(3, (a.seals ?? 0) + 1); // the newest shows once stamped
    (a.fx ??= []).push({ kind: e.kind, t: 0, slot: Math.max(0, (a.seals ?? 1) - 1) }); // slot: the seal a push takes
    return true;
  }

  destination(a, seats, waiting, shell) {
    const { entry: ENTRY, queue: QUEUE_SLOTS, aisleY: AISLE_Y, cogSpots: COG_SPOTS, refectory } = this.hall;
    if (a.leaving) return { ...ENTRY, pose: 'gone' };
    if (a.watch) return vigil.countdownEnd != null || !a.post ? { x: ENTRY.x + 36, y: ENTRY.y - 6, pose: 'gate', dir: 'down' } : { ...a.post, pose: 'patrol' };
    if (isPetitioner(a.s)) {
      const queueIdx = Math.min(waiting.indexOf(a.id), QUEUE_SLOTS.length - 1);
      a.burn = null; // a petition outranks the ritual: the bundle is dropped
      return { ...QUEUE_SLOTS[queueIdx], pose: 'queue', queueIdx };
    }
    if (a.burn) return { x: a.burn.fire.x, y: AISLE_Y, pose: 'burn' };
    if (shell.includes(a.id) && !a.s.temp) return { ...COG_SPOTS[shell.indexOf(a.id) % COG_SPOTS.length], pose: 'cog' }; // the break-out room runs its shells at its desks
    if (refectory[this.naps.get(a.id)]) return { ...refectory[this.naps.get(a.id)], pose: 'nap' };
    const seat = seats.get(a.id);
    return seat ? { x: seat.x, y: seat.y, pose: 'desk' } : { ...ENTRY, pose: 'gone' };
  }

  // Adepts work at their own console in the owner's department block, whatever the owner is doing.
  atConsole(a, consoleSeats) {
    const seat = consoleSeats.get(a.id);
    const H = this.hall, out = H.column ? H.landing(floorAt(H, a.y) ?? 'ref') : H.entry; // the column's adepts leave at their landing
    return a.leaving || !seat ? { ...out, pose: 'gone' } : { x: seat.x, y: seat.y, via: seat.via, pose: 'console', dir: 'up' };
  }

  watchOn() { return vigil.armed && !this.hall.strip; }
  // Each frame: the Watchman walks in or out with the vigil, and moves on to another seat once he has stood PATROL_S.
  watch(dt) {
    const seats = [...(this.last?.seats.values() ?? [])], blocks = this.last?.blocks ?? [];
    const pick = () => { const s = seats[Math.floor(Math.random() * seats.length)]; return s && { x: s.x, y: s.y + 10 }; }; // off the seat, onto the aisle: a scribe stands here
    let a = this.actors.get(WATCH_ID);
    if (this.watchOn() && !a) {
      const { entry } = this.hall;
      a = { id: WATCH_ID, watch: true, x: entry.x, y: entry.y, path: [], target: null, destKey: '', dir: 'up', t: 0, pose: 'walk', leaving: false, post: pick() };
      this.actors.set(WATCH_ID, a);
    }
    if (!a) return;
    a.leaving = !this.watchOn();
    if (a.ring > 0) a.ring -= dt;
    if (a.pose !== 'patrol') a.rest = null;
    else if ((a.rest = (a.rest ?? PATROL_S) - dt) <= 0) { a.rest = null; a.post = pick(); }
    if (!a.post) a.post = pick(); // no seat yet (an empty hall): he waits at the gate
    this.go(a, this.destination(a), blocks);
  }

  update(dt) {
    this.watch(dt);
    const L = this.lift, H = this.hall;
    if (L) for (const e of liftStep(L, dt)) this.onLift(e); // the car first: who boards, who gets off
    for (const a of [...this.actors.values()]) {
      a.t += dt;
      let step = speed() * dt;
      if (a.wait > 0) { a.wait -= dt; step = 0; } // pausing at a waypoint (the recaff)
      if (a.ride === 'in') { a.x = H.carX + RIDE_DX[Math.max(0, slotOf(L, a.id))]; a.y = carY(L); a.dir = 'down'; step = 0; } // in the car
      else if (a.ride === 'wait') { // in line at the landing, its place moving up as the line closes
        const from = a.path[0].lift.from, spot = H.lineSpot(from, Math.max(0, lineOf(L, a.id))), dx = spot.x - a.x, dist = Math.abs(dx);
        a.still = dist <= step;
        if (a.still) { a.x = spot.x; a.y = spot.y; a.dir = H.carX > a.x ? 'right' : 'left'; } // facing the shaft
        else { a.x += Math.sign(dx) * step; a.dir = dx > 0 ? 'right' : 'left'; a.walked = (a.walked ?? 0) + step; }
        step = 0;
      }
      a.walked = (a.walked ?? 0) + step;
      while (step > 0 && a.path.length) {
        if (a.path[0].lift && L) { // at the landing: call the car; a call it refuses (a floor gone) drops the lift waypoint
          const { from, to } = a.path[0].lift;
          if (call(L, a.id, from, to)) { a.ride = 'wait'; break; }
          a.path.shift();
          continue;
        }
        const p = a.path[0], dx = p.x - a.x, dy = p.y - a.y, dist = Math.hypot(dx, dy);
        if (dist > 0) a.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        if (dist <= step) { a.x = p.x; a.y = p.y; a.path.shift(); step -= dist; if (p.wait) { a.wait = p.wait; a.dir = 'up'; break; } }
        else { a.x += (dx / dist) * step; a.y += (dy / dist) * step; step = 0; }
      }
      if (!a.path.length && a.pose === 'walk' && a.target) {
        a.pose = a.target.pose;
        if (a.pose === 'gone') this.actors.delete(a.id);
      }
      if (a.puff > 0) a.puff -= dt;
      if (a.lamp) a.lamp.t += dt;
      if (a.fx?.length) a.fx = a.fx.filter(f => {
        if (f.kind === 'push' && f.t < PICK_S && f.t + dt >= PICK_S && a.seals) a.seals--;
        return (f.t += dt) < FX_S[f.kind];
      });
      if (a.burn && a.pose === 'burn' && (a.burn.left -= dt) <= 0) { // burnt: back to the desk (or wherever the roster says now)
        a.burn = null;
        const { seats, waiting, shell, blocks } = this.last;
        this.go(a, this.destination(a, seats, waiting, shell), blocks);
      }
    }
  }
}

// Scribe palette per (rank, department sash), kept so the sprite cache finds it by identity; per theme.
const robes = new Map(); // rank -> sash -> palette
onTheme(() => robes.clear());
const robeOf = (rank, sash) => {
  const by = robes.get(rank) ?? robes.set(rank, new Map()).get(rank);
  return by.get(sash) ?? by.set(sash, { ...T.rank[rank].robe, y: sash }).get(sash);
};

// An adept's glyph by its subagent kind (a.h.kind, the agent type: open-ended), drawn by sprites.js marked: the built-in
// kinds' own, any other kind (a custom agent) the generic one. Exact names in any case, so 'code-explorer' is custom.
const KIND_MARK = { explore: 'explore', plan: 'plan', 'general-purpose': 'general' };
export const markOf = kind => KIND_MARK[String(kind ?? '').toLowerCase()] ?? 'custom';
// A long turn just finished at the desk: the scroll held up over the scribe, eased up, held, back down (art px / RES).
export function liftOf(a) {
  const done = a.pose === 'desk' && a.fx?.find(f => f.kind === 'task-done');
  return { done, lift: done ? Math.round(8 * Math.min(1, done.t / 0.3, (FX_S['task-done'] - done.t) / 0.3)) / 2 : 0 };
}
// What a scribe carries over its body, in either view (V: its art, CARRIED / CARRIED39): its arms when its body has
// none of its own (the 40k robe: two mechadendrites raised over the desk, lifted with a finished turn's scroll), in
// the body's colours; the petition scroll on its way to and in the queue; that scroll held up; the dozing Z.
// Feet-relative top-left (fx, fy), as drawActor.
export function drawCarried(g, a, V, fx, fy, over) {
  const A = V.at, scroll = isQuestion(a.s) ? MAPS.QSCROLL : V.scroll;
  if (a.pose === 'walk') { if (a.target?.pose === 'queue') blit(g, scroll, fx + A.scroll.x, fy + A.scroll.y); return; }
  const { done, lift } = liftOf(a);
  if (V.arm) { blit(g, V.arm, fx + A.arm.x, fy + A.arm.y - lift, over); blit(g, V.armL, fx + A.armL.x, fy + A.armL.y - lift, over); }
  if (done) V.held(g, fx, fy - lift);
  if (a.pose === 'queue') blit(g, scroll, fx + A.scroll.x, fy + A.scroll.y);
  if (a.pose === 'nap' || (!done && a.pose === 'desk' && a.s.status === 'idle' && !a.s.background)) dozing(g, fx + 11, fy - 2, a.t);
}
// The two views' art for it, read live (a theme switch refills the maps in place).
const CARRIED = { get at() { return SCRIBE_AT; }, get arm() { return MAPS.ARM; }, get armL() { return MAPS.ARM_L; }, get scroll() { return MAPS.SCROLL; },
  held: (g, x, y) => heldScroll(g, x + 2, y - 3) };
export const CARRIED39 = { get at() { return SCRIBE39_AT; }, get arm() { return SCRIBE39.arm; }, get armL() { return SCRIBE39.armL; }, get scroll() { return SCRIBE39.scroll; },
  held: (g, x, y) => blit(g, MAPS.SCROLL_HELD, x + 1.5, y - 4) };
// The body frame an actor is drawn with and its top-left (feet at a.x, a.y), for drawActor and its floor shadow
// (depth.js). step: the walk frame (0 passing, 1-2 strides), -1 standing.
export function bodyOf(a) {
  const walk = a.pose === 'walk';
  if (a.watch) { // the Watchman: 16x18, his bell raised for RING_S at each 30 s mark of the countdown
    const i = Math.floor((a.walked ?? 0) / STRIDE) % 3, dir = walk ? a.dir : a.target?.dir ?? a.dir;
    return { map: a.ring > 0 ? WATCH.ring : WATCH[dir][walk ? i : 0], left: a.ring > 0 ? false : dir === 'left', x: Math.round(a.x) - WATCH_AT.feet.x, y: Math.round(a.y) - WATCH_AT.feet.y, step: walk ? i : -1 };
  }
  if (a.h) { // adept: 12x14
    const i = Math.floor((a.walked ?? 0) / STRIDE) % 3, over = T.rank[rankOf(a.h.model ?? a.h.context?.model)].adept;
    const face = walk ? a.dir : a.target.dir;
    return { map: marked(ADEPT[face][walk ? i : 0], ADEPT, ADEPT_AT, face, markOf(a.h.kind)), over, x: Math.round(a.x) - ADEPT_AT.feet.x, y: Math.round(a.y) - ADEPT_AT.feet.y, step: walk ? i : -1 };
  }
  const still = a.wait > 0 || a.still || a.ride === 'in'; // paused at the recaff, in the lift's line, riding the car
  const i = still ? 0 : Math.floor((a.walked ?? 0) / STRIDE) % 3, over = robeOf(rankOf(a.s.context?.model), a.sash);
  const map = a.pose === 'burn' || a.ride === 'in' ? SCRIBE.down[0] : walk ? SCRIBE[a.dir][i] : SCRIBE.up[0];
  return { map, over, x: Math.round(a.x) - SCRIBE_AT.feet.x, y: Math.round(a.y) - SCRIBE_AT.feet.y, step: walk && !still ? i : -1 };
}

// The 39° view's facing, from the walk direction in floor space: E = +x, W = -x, S = +y (toward the viewer), N = -y.
const FACE39 = { right: 'E', left: 'W', down: 'S', up: 'N' };
export const face39 = dir => FACE39[dir] ?? 'N';
// bodyOf for the 39° view: the 39° frame (walking: the walk direction's; seated, queued, at the cogitator or a console:
// facing N, its back to the viewer, as the flat view's 'up'; burning: facing S), its top-left relative to the feet
// (dx, dy, logical px), the palette and walk step of bodyOf. null while the theme has no 39° art for this actor (the
// caller draws the flat frame upright).
export function bodyOf39(a) {
  const F = a.watch ? WATCH39 : a.h ? ADEPT39 : SCRIBE39, A = a.watch ? WATCH39_AT : a.h ? ADEPT39_AT : SCRIBE39_AT;
  if (!F.E) return null;
  const b = bodyOf(a), walk = a.pose === 'walk', i = Math.max(0, b.step);
  if (a.watch) {
    const face = face39(walk ? a.dir : a.target?.dir ?? a.dir);
    return { map: a.ring > 0 ? F.ring : F[face][walk ? i : 0], dx: -A.feet.x, dy: -A.feet.y, step: b.step, face };
  }
  const face = walk ? face39(a.dir) : a.pose === 'burn' ? 'S' : a.h ? face39(a.target?.dir) : 'N';
  return { map: a.h ? marked(F[face][walk ? i : 0], F, A, face, markOf(a.h.kind)) : F[face][walk ? i : 0], over: b.over, dx: -A.feet.x, dy: -A.feet.y, step: b.step, face };
}

// The Watchman's lantern in the flat view (floor coords): WATCH_AT.light, mirrored with the frame when he faces left.
export function lanternOf(a) {
  const b = bodyOf(a), L = WATCH_AT.light;
  return { x: b.x + (b.left ? b.map[0].length / RES - L.x : L.x), y: b.y + L.y };
}

// A walker's body rises 1 art px on the passing frame (depth: motion cues); its shadow stays on the floor.
export const bobOf = b => (b.step === 0 ? 0.5 : 0);

// A scribe's sprite top-left is its position minus SCRIBE_AT.feet; arms and scroll hang off its other anchors.
export function drawActor(g, a) {
  const b = bodyOf(a);
  if (a.watch) { blit(g, b.map, b.x, b.y - bobOf(b)); return; }
  if (a.h) { // adept: typing bob of 1 art px at its console
    blit(g, b.map, b.x, b.y - bobOf(b) + (a.pose !== 'walk' && Math.sin(a.t * 11) > 0.3 ? 0.5 : 0), b.over);
    return;
  }
  const fx = b.x, fy = b.y - bobOf(b), P = pipeOf(a, a.pose === 'burn' ? 'down' : a.pose === 'walk' ? a.dir : 'up');
  blit(g, b.map, fx, fy, b.over);
  if (a.pose !== 'burn') drawCarried(g, a, CARRIED, fx, fy, b.over); // burning: standing over the brazier (bundle + flare: scene.js)
  if (P) pipe(g, fx, fy, P, a.t);
}

// Arcane Tower: wizards and the Archmage (ranks standard, high; never apprentices) smoke a long churchwarden pipe while
// not working (idle or waiting). Per facing, art px from the frame's top-left (32x34): the stem from the mouth out past
// the hat brim, the bowl beyond the silhouette. Seen from the back (flat 'up', 39° 'N') the stem pokes out left of the
// head (the Zs are right), stopping at the silhouette (m: its last column, the mouth's or the head's edge).
const L = m => ({ stem: [3, 17, m - 2, 2], bowl: [0, 13, 4, 6] }), R = m => ({ stem: [m, 17, 29 - m, 2], bowl: [28, 13, 4, 6] });
const PIPE = { down: L(14), up: L(9), left: L(11), right: R(20) };
const PIPE39 = { S: L(13), N: L(9), W: L(11), E: R(20) };
// face: the drawn frame's, a flat direction or a 39° face. null: no pipe for this actor now.
export function pipeOf(a, face) {
  if (T.id !== 'tower' || a.h || a.watch || !a.s || !(a.s.status === 'idle' || a.s.status === 'waiting') || rankOf(a.s.context?.model) === 'novice') return null;
  return PIPE[face] ?? PIPE39[face] ?? null;
}
// The pipe at (x, y), the frame's top-left: a wood stem (lit top, shaded underside), the bowl with a glowing ember, and
// puffs of pale smoke (theme smoke lifted toward white) rising ~14 px and drifting outward, now and then a ring.
const PUFFS = 5, RISE_S = 5;
const pale = c => `${[1, 3, 5].map(i => Math.round((parseInt(c.slice(i, i + 2), 16) + 255 * 1.5) / 2.5)).join(',')}`;
export function pipe(g, x, y, P, t) {
  const at = ([i, j, w, h], c) => { g.fillStyle = c; g.fillRect(x + i / RES, y + j / RES, w / RES, h / RES); };
  const [si, sj, sw] = P.stem, [bi, bj, bw, bh] = P.bowl;
  at([si, sj, sw, 1], T.px.L); at([si, sj + 1, sw, 1], T.px.W);
  at([bi, bj + 1, bw, bh - 1], T.px.w); at([bi, bj, bw, 1], T.px.W); at([bi + (bi < 16 ? 0 : bw - 1), bj + 1, 1, bh - 1], T.px.W); // the bowl, shaded on its outer side
  at([bi - 1, bj - 2, bw + 2, 3], hexA(T.ink.flame, 0.2 + 0.08 * Math.sin(t * 4)));
  at([bi + 1, bj - 1, bw - 2, 2], hexA(T.ink.flame, 0.8 + 0.2 * Math.sin(t * 5.3)));
  const ox = x + (bi + bw / 2) / RES, oy = y + (bj - 1) / RES, side = bi < 16 ? -1 : 1, rgb = pale(T.ink.smoke);
  for (let k = 0; k < PUFFS; k++) {
    const q = t / RISE_S + k / PUFFS, p = q % 1, a = 0.95 * Math.min(1, 5 * p) * (1 - p) ** 0.6;
    const cx = half(ox + side * p * 2.5 + Math.sin(t * 1.1 + k * 2.3) * 0.6), cy = half(oy - p * 14);
    g.fillStyle = `rgba(${rgb},${a})`;
    if (k === 0 && Math.floor(q) % 4 === 0) { // a smoke ring: a hollow square that widens as it rises
      const s = 2 + 1.5 * p, l = cx - s / 2, u = cy - s / 2;
      g.fillRect(l, u, s, 0.5); g.fillRect(l, u + s - 0.5, s, 0.5); g.fillRect(l, u + 0.5, 0.5, s - 1); g.fillRect(l + s - 0.5, u + 0.5, 0.5, s - 1);
    } else { const s = 1 + 0.5 * p; g.fillRect(cx - s / 2, cy - s / 2, s, s); }
  }
}

// An unrolled scroll, 13x5 logical, rolled ends, writing and a red seal (art px = 0.5).
function heldScroll(g, x, y) {
  blit(g, MAPS.SCROLL_HELD, x - 0.5, y - 1); // the rolled ends reach half a px left and a px above (x, y)
}

// "z z" over a dozing scribe: two 5x5-art-px Zs drifting up and fading, half a cycle apart.
// One 7x7 art-px sprite, MAPS.DOZE_Z (refectorium art: a dark outline so it reads over paper, a pale core), drawn twice
// with fading alpha; drawImage, not blit: the Zs never take the outline pass.
export function dozing(g, x, y, t) {
  const z = sprite(MAPS.DOZE_Z), a0 = g.globalAlpha;
  for (const k of [0, 0.5]) {
    const p = (t / 2.4 + k) % 1, zx = x + Math.round(p * 4) / 2, zy = y - Math.round(p * 12) / 2;
    g.globalAlpha = Math.min(1, 3 * (1 - p));
    g.drawImage(z, zx - 0.5, zy - 0.5, z.width / RES, z.height / RES);
  }
  g.globalAlpha = a0;
}
