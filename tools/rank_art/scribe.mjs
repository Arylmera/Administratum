// The 40k scribe's rank bodies (flat, 32x34 art px), drawn from each plain frame (tools/rank_art.mjs):
//   novice  a low machine agent: an iron cowl with rivets, one great optic, a cable and a spine tube down the back, a
//           narrower body whose lower half is segmented iron plates, iron shoulder plates and hem
//   high    pompous: a crimson mantle over the shoulders and the back, a broad gold collar, a gilt crest on the hood,
//           rubies in the cogs, a gold stole down the front, an embroidered gold panel on the back, a double gold hem
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
  widen(g, 18, 21, 'h'); // broad shoulders under the mantle, a gold edge
  paint(g, { y0: 18, y1: 18, from: 'Tzt' }, (x) => (x % 2 ? 'h' : 'g')); // the broad gold collar
  paint(g, { y0: 1, y1: 1, from: 'rR' }, (x) => (x % 2 ? 'h' : 'g')); // a gilt crest on the hood
  paint(g, { from: 'j' }, () => 'a'); // rubies in the cogs
  // a gold border along the hood's edge (the cloth cells next to its outline)
  const edge = (x, y) => g[y][x - 1] === 'k' || g[y][x + 1] === 'k' || g[y - 1]?.[x] === 'k';
  paint(g, { y0: 2, y1: 17, from: ROBE }, (x, y) => (edge(x, y) ? 'g' : null));
  // the crimson mantle: over the shoulders, and the whole back
  paint(g, { y0: 19, y1: 21, from: ROBE }, (x, y, c) => (c === 'd' ? 'W' : 'x'));
  if (dir === 'up') {
    paint(g, { y0: 24, y1: 29, from: ROBE }, (x, y, c) => (c === 'd' ? 'W' : 'x'));
    // the embroidered back panel: a gold frame, a gold cross, a ruby at its heart
    paint(g, { y0: 24, y1: 29, x0: 11, x1: 20, from: 'xW' }, (x, y) => (x === 11 || x === 20 || y === 24 || y === 29 ? 'g' : (x === 15 || x === 16 || y === 26 || y === 27) ? 'h' : null));
    put(g, 15, 26, 'a'); put(g, 16, 27, 'a');
  }
  if (dir === 'down') {
    paint(g, { y0: 22, y1: 29, from: ROBE }, (x, y, c) => (x <= 7 || x >= 24 ? (c === 'd' ? 'W' : 'x') : null)); // the mantle's two fronts
    paint(g, { y0: 19, y1: 29, from: ROBE + 'xW' }, (x) => (x === 8 || x === 22 ? 'g' : x === 9 || x === 23 ? 'h' : null)); // the gold stole
  }
  if (dir === 'right') {
    paint(g, { y0: 24, y1: 29, from: ROBE }, (x, y, c) => (x < 13 ? (c === 'd' ? 'W' : 'x') : null)); // the mantle falls behind
    paint(g, { y0: 19, y1: 29, x0: 18, x1: 19, from: ROBE + 'xW' }, (x) => (x === 18 ? 'g' : 'h')); // the stole in front
  }
  paint(g, { y0: 30, y1: 30, from: 'gG' }, (x) => (x % 2 ? 'h' : 'g')); // a bright gold hem
  paint(g, { y0: 29, y1: 29, from: ROBE + 'xW' }, (x) => (x % 2 ? 'G' : 'g')); // and a second one above it
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
