import { SCRIBE, ADEPT, MAPS, blit } from './sprites.js';
import { route, QUEUE_SLOTS, COG_SPOTS, ENTRY } from './layout.js';

const SPEED = 80; // logical px per second

export class Cast {
  constructor() { this.actors = new Map(); }

  sync(roster, seats, colorOf) {
    const live = new Set(roster.map(s => s.id));
    for (const s of roster) {
      const a = this.actors.get(s.id);
      if (a) { a.s = s; a.leaving = false; a.sash = colorOf(s.dept); }
      else this.actors.set(s.id, { id: s.id, s, x: ENTRY.x, y: ENTRY.y, path: [], target: null, destKey: '', dir: 'up', t: 0, pose: 'walk', leaving: false, sash: colorOf(s.dept) });
    }
    for (const s of roster) for (const h of s.helpers ?? []) {
      const id = `${s.id}|${h.id}`;
      live.add(id);
      const a = this.actors.get(id);
      if (a) { a.h = h; a.leaving = false; }
      else this.actors.set(id, { id, owner: s.id, h, x: ENTRY.x, y: ENTRY.y, path: [], target: null, destKey: '', dir: 'up', t: 0, pose: 'walk', leaving: false });
    }
    for (const a of this.actors.values()) if (!live.has(a.id)) a.leaving = true;
    const waiting = roster.filter(s => s.status === 'waiting').sort((p, q) => p.sinceMs - q.sinceMs).map(s => s.id);
    const shell = roster.filter(s => s.status === 'shell').map(s => s.id);
    // Scribes first (Map order is insertion order, adepts may predate a re-added owner), then their adepts.
    const all = [...this.actors.values()];
    for (const a of all.filter(a => !a.h).concat(all.filter(a => a.h))) {
      const d = a.h ? this.beside(a) : this.destination(a, seats, waiting, shell);
      const key = `${d.x},${d.y},${d.pose}`;
      if (key !== a.destKey) {
        a.destKey = key;
        a.target = d;
        a.path = route({ x: a.x, y: a.y }, d);
        a.pose = 'walk';
      }
    }
  }

  destination(a, seats, waiting, shell) {
    if (a.leaving) return { ...ENTRY, pose: 'gone' };
    if (a.s.status === 'waiting') {
      const queueIdx = Math.min(waiting.indexOf(a.id), QUEUE_SLOTS.length - 1);
      return { ...QUEUE_SLOTS[queueIdx], pose: 'queue', queueIdx };
    }
    if (a.s.status === 'shell') return { ...COG_SPOTS[shell.indexOf(a.id) % COG_SPOTS.length], pose: 'cog' };
    const seat = seats.get(a.id);
    return seat ? { x: seat.x, y: seat.y, pose: 'desk' } : { ...ENTRY, pose: 'gone' };
  }

  // Adept spot from its owner's destination: beside the desk (right, left, then a second rank), else just behind.
  beside(a) {
    const o = this.actors.get(a.owner), d = o?.target;
    if (a.leaving || !d || d.pose === 'gone') return { ...ENTRY, pose: 'gone' };
    const mates = [...this.actors.values()].filter(b => b.owner === a.owner && !b.leaving);
    const i = mates.indexOf(a), n = mates.length;
    if (d.pose === 'desk') {
      const spots = [0, 1, 2, 3].map(k => {
        const side = k % 2 ? -1 : 1, rank = k >> 1;
        return { x: d.x + side * 22, y: d.y - 12 + rank * 20, pose: 'adept', dir: side > 0 ? 'left' : 'right' };
      }).filter(p => p.x > 8 && p.x < 192); // keep off the hall's edges
      return spots[i % spots.length];
    }
    return { x: d.x + (i - (n - 1) / 2) * 12, y: Math.min(d.y + 8, 219), pose: 'adept', dir: 'up' };
  }

  update(dt) {
    for (const a of [...this.actors.values()]) {
      a.t += dt;
      let step = SPEED * dt;
      while (step > 0 && a.path.length) {
        const p = a.path[0], dx = p.x - a.x, dy = p.y - a.y, dist = Math.hypot(dx, dy);
        if (dist > 0) a.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        if (dist <= step) { a.x = p.x; a.y = p.y; a.path.shift(); step -= dist; }
        else { a.x += (dx / dist) * step; a.y += (dy / dist) * step; step = 0; }
      }
      if (!a.path.length && a.pose === 'walk' && a.target) {
        a.pose = a.target.pose;
        if (a.pose === 'gone') this.actors.delete(a.id);
      }
    }
  }

  // Sprite top-left is (feet.x - 8, feet.y - 17); offsets match the Tier II board.
  drawActor(g, a) {
    if (a.h) { // adept: 12x14, feet at (x, y)
      const fx = Math.round(a.x) - 6, fy = Math.round(a.y) - 14;
      if (a.pose === 'walk') blit(g, ADEPT[a.dir][Math.floor(a.t * 16) % 3], fx, fy);
      else blit(g, ADEPT[a.target.dir][0], fx, fy + (Math.sin(a.t * 3) > 0.6 ? 0.5 : 0)); // idle bob, 1 art px
      return;
    }
    const over = { y: a.sash };
    const fx = Math.round(a.x) - 8, fy = Math.round(a.y) - 17;
    if (a.pose === 'walk') {
      blit(g, SCRIBE[a.dir][Math.floor(a.t * 16) % 3], fx, fy, over);
      if (a.target?.pose === 'queue') blit(g, MAPS.SCROLL, fx + 14, fy + 8);
      return;
    }
    if (a.pose === 'desk') {
      g.fillStyle = '#14100c'; g.fillRect(fx + 7, 7, 1, fy - 7);
      g.fillStyle = '#1e2124'; g.fillRect(fx + 9, 7, 1, fy - 6);
    }
    blit(g, SCRIBE.up[0], fx, fy, over);
    blit(g, MAPS.ARM, fx + 14, fy + 2);
    blit(g, MAPS.ARM_L, fx - 4, fy + 2);
    if (a.pose === 'desk' && a.s.status === 'busy') blit(g, MAPS.CHAIN, fx - 6, fy + 15);
    if (a.pose === 'queue') blit(g, MAPS.SCROLL, fx + 14, fy + 8);
  }
}
