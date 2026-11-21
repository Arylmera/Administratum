// The 40k scribe's rank bodies (flat, 32x34 art px), drawn from each plain frame (tools/rank_art.mjs):
//   novice  a low machine agent: an iron cowl with rivets, one great optic, a cable and a spine tube down the back, a
//           narrower body whose lower half is segmented iron plates, iron shoulder plates and hem
//   high    refined: broad shoulders under a crimson mantle that covers the back, a purple robe, gold kept to a fine
//           hood rim, the cogs (rubies at their hubs), a small seal on the back and a bronze hem
// The department sash (y) is never painted over: it reads on every rank.
import { grid, rows, put, paint, widen, narrow, ROBE } from './kit.mjs';

const dirOf = n => n.split(' ')[0]; // 'up 1' -> 'up'

function novice(plain, name) {
  const g = grid(plain), dir = dirOf(name);
  narrow(g, 19, 31);
  paint(g, { y0: 0, y1: 17, from: 't' }, () => 'm'); // the hood's rim: an iron cowl
  paint(g, { y0: 1, y1: 6, from: 'rR' }, (x, y) => ((x + 2 * y) % 5 === 0 ? 'l' : null)); // rivets on the cowl
  paint(g, { from: 'zj' }, (x, y, c) => (c === 'z' ? 'm' : 'M')); // cogs become iron plates
  paint(g, { y0: 18, y1: 18, from: 'Tz' }, (x) => (x % 2 ? 'm' : 'M')); // iron shoulder plates
  // the lower body: segmented iron plates, a seam every third row, rivets
  paint(g, { y0: 24, y1: 29, from: ROBE }, (x, y) => (y % 3 === 0 ? 'M' : (x + y) % 7 === 0 ? 'l' : 'm'));
  paint(g, { y0: 30, y1: 30, from: 'gG' }, (x) => (x % 2 ? 'M' : 'm'));
  if (dir === 'down') {
    paint(g, { y0: 8, y1: 14, from: 'Oo' }, () => 'e'); // two eyes out...
    for (const [x, y, c] of [[16, 10, 'C'], [17, 10, 'O'], [18, 10, 'o'], [19, 10, 'C'], [16, 11, 'C'], [17, 11, 'o'], [18, 11, 'o'], [19, 11, 'C']]) put(g, x, y, c); // ...one great optic in
    paint(g, { y0: 14, y1: 14, x0: 14, x1: 20, from: 'e' }, (x) => (x % 2 ? 'M' : 'm')); // a second grille row
  }
  if (dir === 'right') for (const [x, y] of [[21, 10], [21, 11], [24, 10], [24, 11]]) put(g, x, y, 'C'); // the optic's ring
  if (dir === 'up') {
    paint(g, { y0: 24, y1: 29, x0: 16, x1: 19, from: 'mMl' }, (x) => (x === 16 || x === 19 ? 'k' : x === 17 ? 'm' : 'M')); // the spine tube, on down
    paint(g, { y0: 14, y1: 29, x0: 21, x1: 21, from: ROBE + 'mMl' }, () => 'C'); // a cable beside it
  }
  if (dir === 'right') paint(g, { y0: 14, y1: 29, x0: 8, x1: 8, from: ROBE + 'mMl' }, () => 'C'); // the cable down the back
  return rows(g);
}

function high(plain, name) {
  const g = grid(plain), dir = dirOf(name);
  widen(g, 18, 21, 'x'); // broad shoulders under the mantle
  paint(g, { from: 'j' }, () => 'a'); // rubies in the cogs
  // the crimson mantle: over the shoulders, and the whole back
  paint(g, { y0: 19, y1: 21, from: ROBE }, (x, y, c) => (c === 'd' ? 'W' : 'x'));
  if (dir !== 'up') { // a crimson lining in the hood's opening, around its rim
    const rim = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy]?.[x + dx] === 't');
    paint(g, { y0: 4, y1: 15, from: ROBE }, (x, y) => (rim(x, y) ? 'x' : null));
  }
  if (dir === 'up') {
    paint(g, { y0: 24, y1: 29, from: ROBE }, (x, y, c) => (c === 'd' ? 'W' : 'x'));
    for (const [x, y, c] of [[16, 25, 'g'], [17, 25, 'g'], [15, 26, 'g'], [16, 26, 'a'], [17, 26, 'a'], [18, 26, 'g'], [16, 27, 'g'], [17, 27, 'g']]) put(g, x, y, c); // a small seal on the mantle
  }
  if (dir === 'down') {
    paint(g, { y0: 16, y1: 17, from: ROBE }, (x, y, c) => (c === 'd' ? 'W' : 'x')); // the mantle's collar under the hood
    paint(g, { y0: 22, y1: 29, from: ROBE }, (x, y, c) => (x <= 9 || x >= 22 ? (c === 'd' ? 'W' : 'x') : null)); // the mantle's two fronts
  }
  if (dir === 'right') {
    paint(g, { y0: 16, y1: 17, from: ROBE }, (x, y, c) => (c === 'd' ? 'W' : 'x')); // the mantle's collar
    paint(g, { y0: 22, y1: 29, from: ROBE }, (x, y, c) => (x < 19 ? (c === 'd' ? 'W' : 'x') : null)); // the mantle falls behind
  }
  return rows(g);
}

// plain: the family's plain frames by name. Returns the rank frames and the rank anchors (art px).
export default plain => {
  const frames = {};
  for (const n of ['up', 'down', 'right'].flatMap(d => [0, 1, 2].map(i => `${d} ${i}`))) {
    frames[`novice ${n}`] = novice(plain[n], n);
    frames[`high ${n}`] = high(plain[n], n);
  }
  return { frames, anchors: {} };
};
