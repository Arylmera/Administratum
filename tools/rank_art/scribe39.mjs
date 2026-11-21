// The 40k scribe's rank bodies in the 39° view (32x34 art px), drawn from each plain frame (tools/rank_art.mjs) by the
// flat scribe's rules (tools/rank_art/scribe.mjs): novice a machine agent in black, high in ivory under a mantle in the
// Ordo's trim colour, little gold. The facings: N the back (at the desk), S the front, E a side seen from the front,
// W a three-quarter back; each with the columns its back tube and its seal sit at.
import { grid, rows, put, paint, widen, narrow, ROBE } from './kit.mjs';

const VIEW = {
  N: { back: true, tube: [12, 15], cable: 17, seal: 13 },
  W: { back: true, tube: [18, 21], cable: 23, seal: 11 },
  S: { front: true, optic: 12 },
  E: { side: true, optic: 20 },
};
const faceOf = n => n.split(' ')[0];

function novice(plain, name) {
  const g = grid(plain), v = VIEW[faceOf(name)];
  narrow(g, 19, 31);
  paint(g, { y0: 0, y1: 17, from: 't' }, () => 'm'); // an iron cowl
  paint(g, { y0: 1, y1: 6, from: 'rR' }, (x, y) => ((x + 2 * y) % 5 === 0 ? 'l' : null)); // rivets
  paint(g, { from: 'zj' }, (x, y, c) => (c === 'z' ? 'm' : 'M')); // cogs become iron plates
  paint(g, { y0: 18, y1: 18, from: 'Tz' }, (x) => (x % 2 ? 'm' : 'M')); // iron shoulder plates
  paint(g, { y0: 24, y1: 30, from: ROBE }, (x, y) => (y % 3 === 0 ? 'M' : (x + y) % 7 === 0 ? 'l' : 'm')); // iron plates below
  paint(g, { y0: 29, y1: 31, from: 'gG' }, (x) => (x % 2 ? 'M' : 'm'));
  if (v.front || v.side) { // one great optic in place of two eyes, a second grille row
    paint(g, { y0: 8, y1: 14, from: 'Oo' }, () => 'e');
    const x = v.optic;
    for (const [dx, y, c] of [[0, 10, 'C'], [1, 10, 'O'], [2, 10, 'o'], [3, 10, 'C'], [0, 11, 'C'], [1, 11, 'o'], [2, 11, 'o'], [3, 11, 'C']]) put(g, x + dx, y, c);
    paint(g, { y0: 14, y1: 14, x0: x - 2, x1: x + 5, from: 'e' }, (xx) => (xx % 2 ? 'M' : 'm'));
  }
  if (v.back) {
    const [a, b] = v.tube;
    paint(g, { y0: 24, y1: 29, x0: a, x1: b, from: 'mMl' }, (x) => (x === a || x === b ? 'k' : x === a + 1 ? 'm' : 'M')); // the spine tube
    paint(g, { y0: 14, y1: 29, x0: v.cable, x1: v.cable, from: ROBE + 'mMl' }, () => 'C'); // a cable beside it
  }
  return rows(g);
}

function high(plain, name) {
  const g = grid(plain), v = VIEW[faceOf(name)], mantle = (x, y, c) => (c === 'd' ? 'W' : 'x');
  widen(g, 18, 21, 'x'); // broad shoulders under the mantle
  paint(g, { from: 'j' }, () => 'a'); // rubies in the cogs
  paint(g, { y0: 19, y1: 21, from: ROBE }, mantle); // the mantle over the shoulders
  if (!v.back || faceOf(name) === 'W') { // a crimson lining in the hood's opening, round its rim
    const rim = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy]?.[x + dx] === 't');
    paint(g, { y0: 4, y1: 15, from: ROBE }, (x, y) => (rim(x, y) ? 'x' : null));
  }
  if (v.back) {
    paint(g, { y0: 24, y1: 30, from: ROBE }, mantle); // the mantle down the back
    const s = v.seal;
    for (const [dx, y, c] of [[1, 25, 'g'], [2, 25, 'g'], [0, 26, 'g'], [1, 26, 'a'], [2, 26, 'a'], [3, 26, 'g'], [1, 27, 'g'], [2, 27, 'g']]) put(g, s + dx, y, c); // a small seal
  }
  if (v.front) {
    paint(g, { y0: 16, y1: 17, from: ROBE }, mantle); // the mantle's collar
    paint(g, { y0: 22, y1: 30, from: ROBE }, (x, y, c) => (x <= 8 || x >= 21 ? mantle(x, y, c) : null)); // its two fronts
  }
  if (v.side) {
    paint(g, { y0: 16, y1: 17, from: ROBE }, mantle);
    paint(g, { y0: 22, y1: 30, from: ROBE }, (x, y, c) => (x < 19 ? mantle(x, y, c) : null)); // falling behind
  }
  return rows(g);
}

export default plain => {
  const frames = {};
  for (const n of ['E', 'W', 'S', 'N'].flatMap(d => [0, 1, 2].map(i => `${d} ${i}`))) {
    frames[`novice ${n}`] = novice(plain[n], n);
    frames[`high ${n}`] = high(plain[n], n);
  }
  return { frames, anchors: {} };
};
