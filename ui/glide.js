// Reflows glide: rugs, desks and consoles ease to their new place over GLIDE_MS.
// Reflows glide: rugs, desks and consoles ease from where they are drawn to their new place over GLIDE_MS;
// the scribes and adepts walk to their new seats on their own (Cast.sync re-routes them).
const GLIDE_MS = 800;
const tweens = new Map(); // key -> { from, to, t0 }, each {x, y, w, h}
const ease = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const XYWH = ['x', 'y', 'w', 'h'];
const same = (p, q) => p.x === q.x && p.y === q.y && p.w === q.w && p.h === q.h;
function tween(key, to, now) {
  let tw = tweens.get(key);
  if (!tw || !same(tw.to, to)) tweens.set(key, tw = { from: tw ? pose(tw, now) : to, to, t0: now });
  tw.to = to; // a fresh layout object with the same place
  tw.seen = now;
  return now - tw.t0 >= GLIDE_MS ? to : { ...to, ...pose(tw, now) }; // settled: no garbage
}
function pose({ from, to, t0 }, now) {
  const k = ease(Math.min(1, (now - t0) / GLIDE_MS)), r = {};
  for (const p of XYWH) if (to[p] != null) r[p] = from[p] + (to[p] - from[p]) * k;
  return r;
}
export const gliding = now => { for (const tw of tweens.values()) if (now - tw.t0 < GLIDE_MS) return true; return false; };
export function glide(layout, now) {
  const view = {
    blocks: layout.blocks.map(b => tween(`b:${b.name}`, b, now)),
    desks: layout.desks.map(d => tween(`d:${d.key}`, d, now)),
    consoles: layout.consoles.map(c => tween(`c:${c.id}`, c, now)),
  };
  for (const [k, tw] of tweens) if (tw.seen !== now) tweens.delete(k); // gone from the layout
  return view;
}
export const clearGlides = () => tweens.clear();
