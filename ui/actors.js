import { SCRIBE, MAPS, sprite } from './sprites.js';
import { route, QUEUE_SLOTS, COG_SPOTS, ENTRY } from './layout.js';

const SPEED = 40; // logical px per second

export class Cast {
  constructor() { this.actors = new Map(); }

  sync(roster, seats, colorOf) {
    const live = new Set(roster.map(s => s.id));
    for (const s of roster) {
      const a = this.actors.get(s.id);
      if (a) { a.s = s; a.leaving = false; a.sash = colorOf(s.dept); }
      else this.actors.set(s.id, { id: s.id, s, x: ENTRY.x, y: ENTRY.y, path: [], target: null, destKey: '', dir: 'up', t: 0, pose: 'walk', leaving: false, sash: colorOf(s.dept) });
    }
    for (const a of this.actors.values()) if (!live.has(a.id)) a.leaving = true;
    const waiting = roster.filter(s => s.status === 'waiting').sort((p, q) => p.sinceMs - q.sinceMs).map(s => s.id);
    const shell = roster.filter(s => s.status === 'shell').map(s => s.id);
    for (const a of this.actors.values()) {
      const d = this.destination(a, seats, waiting, shell);
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
    const over = { y: a.sash };
    const fx = Math.round(a.x) - 8, fy = Math.round(a.y) - 17;
    if (a.pose === 'walk') {
      g.drawImage(sprite(SCRIBE[a.dir][Math.floor(a.t * 8) % 3], over), fx, fy);
      if (a.target?.pose === 'queue') g.drawImage(sprite(MAPS.SCROLL), fx + 14, fy + 8);
      return;
    }
    if (a.pose === 'desk') {
      g.fillStyle = '#14100c'; g.fillRect(fx + 7, 7, 1, fy - 7);
      g.fillStyle = '#1e2124'; g.fillRect(fx + 9, 7, 1, fy - 6);
    }
    g.drawImage(sprite(SCRIBE.up[0], over), fx, fy);
    g.drawImage(sprite(MAPS.ARM), fx + 14, fy + 2);
    g.drawImage(sprite(MAPS.ARM_L), fx - 4, fy + 2);
    if (a.pose === 'desk' && a.s.status === 'busy') g.drawImage(sprite(MAPS.CHAIN), fx - 6, fy + 15);
    if (a.pose === 'queue') g.drawImage(sprite(MAPS.SCROLL), fx + 14, fy + 8);
  }
}
