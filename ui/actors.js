import { SCRIBE, ADEPT, MAPS, RANK, rankOf, blit } from './sprites.js';
import { route, QUEUE_SLOTS, COG_SPOTS, ENTRY, RECAFF_SPOT, REFECTORY_SPOTS, AISLE_Y } from './layout.js';

const SPEED = 80; // logical px per second
const COG_HOLD_MS = 10000; // a busy scribe stays at the cogitator this long after its last shell command
const NAP_MS = 120000; // idle this long (no background shell) and a scribe leaves for the refectorium
const RECAFF_S = 2; // seconds at the recaff dispenser on the way to a bench
const STALE_MS = 300000; // a petition waiting longer escalates (alarm beacon, servo-skull, header alarm); backend toasts at the same mark
export const isStale = s => s.status === 'waiting' && s.sinceMs > 0 && Date.now() - s.sinceMs > STALE_MS;
export const BURN_S = 1.5; // a compacted pile burns this long at the brazier
export const PUFF_S = 0.8; // ...or goes up in a puff on the desk when its scribe is away
// Fire points of the grand gate's two braziers (DECOR in scene.js); the burner stands on the aisle just north.
export const BRAZIERS = [ENTRY.x - 23, ENTRY.x + 23].map(x => ({ x, y: 213 }));

export class Cast {
  constructor() { this.actors = new Map(); this.naps = new Map(); } // naps: scribe id -> REFECTORY_SPOTS index

  sync(roster, seats, colorOf, consoleSeats, blocks) {
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
    const atCog = s => s.status === 'shell' || (s.status === 'busy' && now - (this.actors.get(s.id).lastShell ?? 0) < COG_HOLD_MS);
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
    const sleepy = roster.filter(s => s.status === 'idle' && !s.background && s.sinceMs && now - s.sinceMs > NAP_MS).sort((p, q) => p.sinceMs - q.sinceMs);
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
    a.path = d.pose === 'nap' ? route(from, RECAFF_SPOT, blocks).concat({ x: d.x, y: d.y }) : route(from, d, blocks);
    if (d.pose === 'nap') a.path.at(-2).wait = RECAFF_S;
    a.wait = 0;
    a.pose = 'walk';
  }

  // The session compacted its context: a seated scribe carries its old pile to the nearest brazier and burns it;
  // anywhere else (cogitator, queue, refectory, on the way) the desk pile just goes up in a puff.
  compacted(a) {
    if (a.pose !== 'desk') { a.puff = PUFF_S; return; }
    const fire = BRAZIERS.reduce((p, q) => (Math.abs(q.x - a.x) < Math.abs(p.x - a.x) ? q : p));
    a.burn = { fire, old: a.s.context, left: BURN_S };
  }

  destination(a, seats, waiting, shell) {
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
    return a.leaving || !seat ? { ...ENTRY, pose: 'gone' } : { x: seat.x, y: seat.y, via: seat.via, pose: 'console', dir: 'up' };
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
  blit(g, MAPS.ARM, fx + 14, fy + 2);
  blit(g, MAPS.ARM_L, fx, fy + 2); // body art spans cols 4..31, so the mirror of ARM at fx+14 lands at fx
  if (a.pose === 'queue') blit(g, MAPS.SCROLL, fx + 14, fy + 8);
  if (a.pose === 'nap' || (a.pose === 'desk' && a.s.status === 'idle' && !a.s.background)) dozing(g, fx + 11, fy - 2, a.t);
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
