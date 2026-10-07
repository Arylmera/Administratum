import assert from 'node:assert/strict';
import { IsoBuf, P39, VS39, floorToWorld, order } from './iso.js';

const fl = Math.floor;
const TAN39 = Math.sqrt(2 / 3);

// P39 stairs are clean: along the back wall (v = 0), u keeps 1 px across per unit and y steps every 3 (the 3:1
// back wall slope) — a clean 3-3-3 stair.
for (let u = 0; u < 12; u++) {
  const [x, y] = P39(u, 0);
  assert.equal(x, u);
  assert.equal(y, fl(u / 3));
}
// Along the side wall (u = 0), sampled where v * tan lands on an exact integer w: x = -w (1 px per w) and y steps
// every other w (the 2:1 side wall slope) — a clean 2-2-2 stair.
for (let w = 0; w < 8; w++) {
  let v = Math.ceil(w / TAN39);
  while (fl(v * TAN39) < w) v++;
  assert.equal(fl(v * TAN39), w, 'sample v lands on integer w');
  const [x, y] = P39(0, v);
  assert.equal(x, -w || 0);
  assert.equal(y, fl(w / 2));
}

// floorToWorld: on the floor, and on the back wall band.
assert.deepEqual(floorToWorld(5, 50, 40), { u: 10, v: 20, z: 0 });
assert.deepEqual(floorToWorld(5, 10, 40), { u: 10, v: 0, z: 60 });

// A box renders its 3 faces (top, front, side) with no holes inside its silhouette: the projection's single-pixel
// gaps (where the 3- and 2-stairs step together) must be filled from a neighbour on the same top face, not left
// as '.' or leaking whatever is further back.
{
  const W = 40, H = 40, buf = new IsoBuf(W, H, 20, 30, P39, { VS: VS39, asym: true });
  buf.box({ u0: 0, u1: 9, v0: 0, v1: 9, z0: 0, z1: 6, id: 1, top: () => 'T', front: () => 'F', side: () => 'S' });
  let top = 0, front = 0, side = 0, minx = W, maxx = -1, miny = H, maxy = -1;
  for (let i = 0; i < W * H; i++) {
    if (buf.id[i] !== 1) continue;
    if (buf.face[i] === 0) top++; else if (buf.face[i] === 1) front++; else if (buf.face[i] === 2) side++;
    const x = i % W, y = fl(i / W);
    minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y);
  }
  assert.ok(top > 0 && front > 0 && side > 0, 'all three faces drawn');
  for (let y = miny + 1; y < maxy; y++) for (let x = minx + 1; x < maxx; x++) {
    const i = y * W + x;
    if (buf.ch[i] !== '.') continue;
    const n = [i - 1, i + 1, i - W, i + W];
    const surrounded = n.every(j => buf.id[j] === 1);
    assert.ok(!surrounded, `hole at (${x},${y}) surrounded by the box's own faces`);
  }
  // sample interior points on each face
  const [tx, ty] = P39(3, 3, 6); assert.equal(buf.ch[(ty + 30) * W + tx + 20], 'T');
  const [fx, fy] = P39(3, 8, 3); assert.equal(buf.ch[(fy + 30) * W + fx + 20], 'F');
  const [sx, sy] = P39(8, 3, 3); assert.equal(buf.ch[(sy + 30) * W + sx + 20], 'S');

  // outline marks the silhouette's edge
  buf.outline(new Set([1]));
  let outlined = 0;
  for (let i = 0; i < W * H; i++) if (buf.ch[i] === 'k') outlined++;
  assert.ok(outlined > 0, 'outline marked at least one edge pixel');
}

// order: a desk is drawn in front of a scribe standing north of it (smaller v, behind along the view direction).
{
  const desk = { u0: 10, u1: 20, v0: 10, v1: 20 };
  const scribe = { u0: 12, u1: 16, v0: 0, v1: 5 };
  assert.equal(order(scribe, desk), -1, 'scribe (north, behind) sorts before the desk');
  assert.equal(order(desk, scribe), 1, 'desk sorts after the scribe: drawn in front');
}

console.log('iso ok');
