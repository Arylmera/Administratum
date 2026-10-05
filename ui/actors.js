import { SCRIBE, ADEPT, MAPS, RANK, rankOf, blit } from './sprites.js';
import { route, COG_SPOTS, RECAFF_SPOT, REFECTORY_SPOTS, hallOf } from './layout.js';
import { settings } from './settings.js';

const SPEED = 80; // logical px per second
// Thresholds come from the settings panel (settings.js), read live:
const COG_HOLD_MS = () => settings.cogHoldS * 1000; // a busy scribe stays at the cogitator this long after its last shell command
const NAP_MS = () => settings.napMin * 60_000; // idle this long (no background shell) and a scribe leaves for the refectorium
const RECAFF_S = 2; // seconds at the recaff dispenser on the way to a bench
const STALE_MS = () => settings.staleMin * 60_000; // a petition waiting longer escalates (alarm beacon, servo-skull, header alarm); backend toasts at the same mark (set_stale_minutes)
export const isStale = s => s.status === 'waiting' && s.sinceMs > 0 && Date.now() - s.sinceMs > STALE_MS();
export const BURN_S = 1.5; // a compacted pile burns this long at the brazier
export const PUFF_S = 0.8; // ...or goes up in a puff on the desk when its scribe is away
// Fire points of the grand gate's two braziers (DECOR in scene.js); the burner stands on the aisle just north.
const braziers = entry => [entry.x - 23, entry.x + 23].map(x => ({ x, y: entry.y - 11 }));
// Chronicle reactions (scene.js draws them): seconds each plays. Test lamps are a.lamp, not an fx.
export const FX_S = { commit: 3, push: 4.4, 'tool-error': 1, 'task-done': 1.5 };
export const PICK_S = 1.6; // the push courier reaches the desk and takes the newest seal
export const LAMP_S = 20;
const FRESH_MS = 120_000; // older events (history, a first scan's backlog) play nothing

export class Cast {
  constructor() { this.actors = new Map(); this.naps = new Map(); this.hall = hallOf(0); } // naps: scribe id -> REFECTORY_SPOTS index

  // hall: hallOf() of the layout's bays (gate, queue, aisle and lanes follow it).
  sync(roster, seats, colorOf, consoleSeats, blocks, hall = hallOf(0)) {
    this.hall = hall;
    const ENTRY = hall.entry;
    const live = new Set(roster.map(s => s.id));
    // New actors walk in through the gate; known ones take the fresh data (and stop leaving if they were).
    const upsert = (id, fields) => {
      const a = this.actors.get(id);
      if (a) Object.assign(a, fields, { leaving: false });
      else this.actors.set(id, { id, x: ENTRY.x, y: ENTRY.y, path: [], target: null, destKey: '', dir: 'up', t: 0, pose: 'walk', leaving: false, ...fields });
    };
    for (const s of roster) {
      const a = this.actors.get(s.id); // a.s is still last poll's session here
      if (a && s.compactedAt && s.compactedAt !== a.s.compactedAt) this.compacted(a); // a new actor's past compactions don't count
      upsert(s.id, { s, sash: colorOf(s.dept) });
    }
    for (const s of roster) for (const h of s.helpers ?? []) {
      const id = `${s.id}|${h.id}`;
      live.add(id);
      upsert(id, { owner: s.id, h });
    }
    for (const a of this.actors.values()) if (!live.has(a.id)) a.leaving = true;
    const waiting = roster.filter(s => s.status === 'waiting').sort((p, q) => p.sinceMs - q.sinceMs).map(s => s.id);
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
  napping(roster, now = Date.now()) {
    const sleepy = roster.filter(s => s.status === 'idle' && !s.background && s.sinceMs && now - s.sinceMs > NAP_MS()).sort((p, q) => p.sinceMs - q.sinceMs);
    for (const id of this.naps.keys()) if (!sleepy.some(s => s.id === id)) this.naps.delete(id);
    for (const s of sleepy) {
      if (this.naps.has(s.id)) continue;
      const free = REFECTORY_SPOTS.findIndex((_, i) => ![...this.naps.values()].includes(i));
      if (free >= 0) this.naps.set(s.id, free);
    }
    return new Set(this.naps.keys());
  }

  go(a, d, blocks) {
    const key = `${d.x},${d.y},${d.pose}`;
    if (key === a.destKey) return;
    a.destKey = key;
    a.target = d;
    const from = { x: a.x, y: a.y, via: a.pose === 'console' ? a.target.via : undefined }; // leaving a console the way it came
    const bays = this.hall.bays;
    a.path = d.pose === 'nap' ? route(from, RECAFF_SPOT, blocks, bays).concat({ x: d.x, y: d.y }) : route(from, d, blocks, bays);
    if (d.pose === 'nap') a.path.at(-2).wait = RECAFF_S;
    a.wait = 0;
    a.pose = 'walk';
  }

  // The session compacted its context: a seated scribe carries its old pile to the nearest brazier and burns it;
  // anywhere else (cogitator, queue, refectory, on the way) the desk pile just goes up in a puff.
  compacted(a) {
    if (a.pose !== 'desk') { a.puff = PUFF_S; return; }
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
    const { entry: ENTRY, queue: QUEUE_SLOTS, aisleY: AISLE_Y } = this.hall;
    if (a.leaving) return { ...ENTRY, pose: 'gone' };
    if (a.s.status === 'waiting') {
      const queueIdx = Math.min(waiting.indexOf(a.id), QUEUE_SLOTS.length - 1);
      a.burn = null; // a petition outranks the ritual: the bundle is dropped
      return { ...QUEUE_SLOTS[queueIdx], pose: 'queue', queueIdx };
    }
    if (a.burn) return { x: a.burn.fire.x, y: AISLE_Y, pose: 'burn' };
    if (shell.includes(a.id)) return { ...COG_SPOTS[shell.indexOf(a.id) % COG_SPOTS.length], pose: 'cog' };
    if (this.naps.has(a.id)) return { ...REFECTORY_SPOTS[this.naps.get(a.id)], pose: 'nap' };
    const seat = seats.get(a.id);
    return seat ? { x: seat.x, y: seat.y, pose: 'desk' } : { ...ENTRY, pose: 'gone' };
  }

  // Adepts work at their own console in the owner's department block, whatever the owner is doing.
  atConsole(a, consoleSeats) {
    const seat = consoleSeats.get(a.id);
    return a.leaving || !seat ? { ...this.hall.entry, pose: 'gone' } : { x: seat.x, y: seat.y, via: seat.via, pose: 'console', dir: 'up' };
  }

  update(dt) {
    for (const a of [...this.actors.values()]) {
      a.t += dt;
      let step = SPEED * dt;
      if (a.wait > 0) { a.wait -= dt; step = 0; } // pausing at a waypoint (the recaff)
      while (step > 0 && a.path.length) {
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
      if (a.fx) a.fx = a.fx.filter(f => {
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

// Sprite top-left is (feet.x - 8, feet.y - 17); offsets match the Tier II board.
export function drawActor(g, a) {
  if (a.h) { // adept: 12x14, feet at (x, y)
    const fx = Math.round(a.x) - 6, fy = Math.round(a.y) - 14, over = RANK[rankOf(a.h.model ?? a.h.context?.model)].adept;
    if (a.pose === 'walk') blit(g, ADEPT[a.dir][Math.floor(a.t * 16) % 3], fx, fy, over);
    else blit(g, ADEPT[a.target.dir][0], fx, fy + (Math.sin(a.t * 11) > 0.3 ? 0.5 : 0), over); // typing bob, 1 art px
    return;
  }
  const over = { ...RANK[rankOf(a.s.context?.model)].robe, y: a.sash };
  const fx = Math.round(a.x) - 8, fy = Math.round(a.y) - 17;
  if (a.pose === 'burn') { blit(g, SCRIBE.down[0], fx, fy, over); return; } // standing over the brazier (bundle + flare: scene.js)
  if (a.pose === 'walk') {
    blit(g, SCRIBE[a.dir][a.wait > 0 ? 0 : Math.floor(a.t * 16) % 3], fx, fy, over);
    if (a.target?.pose === 'queue') blit(g, MAPS.SCROLL, fx + 14, fy + 8);
    return;
  }
  blit(g, SCRIBE.up[0], fx, fy, over);
  const done = a.pose === 'desk' && a.fx?.find(f => f.kind === 'task-done');
  const lift = done ? Math.round(8 * Math.min(1, done.t / 0.3, (FX_S['task-done'] - done.t) / 0.3)) / 2 : 0; // eased up, held, back down
  blit(g, MAPS.ARM, fx + 14, fy + 2 - lift);
  blit(g, MAPS.ARM_L, fx, fy + 2 - lift); // body art spans cols 4..31, so the mirror of ARM at fx+14 lands at fx
  if (done) heldScroll(g, fx + 2, fy - 3 - lift); // task done: the finished scroll held up in both hands
  if (a.pose === 'queue') blit(g, MAPS.SCROLL, fx + 14, fy + 8);
  if (a.pose === 'nap' || (!done && a.pose === 'desk' && a.s.status === 'idle' && !a.s.background)) dozing(g, fx + 11, fy - 2, a.t);
}

// An unrolled scroll, 13x5 logical, rolled ends, writing and a red seal (art px = 0.5).
function heldScroll(g, x, y) {
  const r = (dx, dy, w, h, c) => { g.fillStyle = c; g.fillRect(x + dx, y + dy, w, h); };
  r(-0.5, -0.5, 14, 6, '#0e0a08'); r(0.5, 0, 12, 5, '#d6c79f'); r(0.5, 4, 12, 1, '#a8946a');
  for (const dx of [0, 11.5]) { r(dx - 0.5, -1, 2, 7, '#0e0a08'); r(dx, -0.5, 1, 6, '#b89a7c'); r(dx, -0.5, 0.5, 6, '#cfc3a8'); }
  for (const [dy, w] of [[1, 8], [2, 9], [3, 6]]) r(2, dy, w, 0.5, '#5a3c16');
  r(9, 2.5, 2, 2, '#0e0a08'); r(9.5, 3, 1, 1, '#c8281a'); r(9.5, 4, 0.5, 1.5, '#8e1c16');
}

// "z z" over a dozing scribe: two 5x5-art-px Zs drifting up and fading, half a cycle apart.
const Z = ['11111', '00010', '00100', '01000', '11111'];
function dozing(g, x, y, t) {
  g.save();
  for (const k of [0, 0.5]) {
    const p = (t / 2.4 + k) % 1, zx = x + Math.round(p * 4) / 2, zy = y - Math.round(p * 12) / 2;
    g.globalAlpha = Math.min(1, 3 * (1 - p));
    for (const [col, o, w] of [['#0e0a08', -0.5, 1.5], ['#e6ffee', 0, 0.5]]) { // dark outline so it reads over paper
      g.fillStyle = col;
      Z.forEach((row, j) => { for (let i = 0; i < 5; i++) if (row[i] === '1') g.fillRect(zx + i / 2 + o, zy + j / 2 + o, w, w); });
    }
  }
  g.restore();
}
