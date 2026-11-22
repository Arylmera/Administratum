// The 40k adept's rank bodies in the 39° view (24x28 art px), drawn from each plain frame (tools/rank_art.mjs) by the
// flat adept's rules (tools/rank_art/adept.mjs). The facings: N the back, S the front, E a side seen from the front, W
// that side turned (the plain W frame is E mirrored, so its rules are E's mirrored: x -> 23 - x). The kind glyph's place on each facing (anchors 'glyph <face>') stays as drawn.
import { grid, rows, paint, widen, narrow } from './kit.mjs';

const CLOTH = 'qQb';
const faceOf = n => n.split(' ')[0];
const GLYPH = { S: [5, 14], E: [11, 14], N: [8, 14], W: [3, 14] };
const VIEW = { N: { back: true, cable: 17 }, W: { side: 'west', cable: 17, lining: [4, 14] }, S: { front: true, cable: 17, lining: [6, 17] }, E: { side: true, cable: 6, lining: [9, 19] } };
const inGlyph = (f, x, y) => { const [gx, gy] = GLYPH[f]; return x >= gx && x < gx + 10 && y >= gy && y < gy + 5; };
// the glyph's place as the plain frame draws it, whatever the rank's drawing did around it
const keepGlyph = (g, plain, f) => { const [gx, gy] = GLYPH[f]; for (let y = gy; y < gy + 5; y++) for (let x = gx; x < gx + 10; x++) g[y][x] = plain[y][x]; };

function novice(plain, name) {
  const g = grid(plain), f = faceOf(name), v = VIEW[f];
  narrow(g, 12, 24);
  paint(g, { from: 'JI' }, (x, y, c) => (c === 'J' ? 'm' : 'M'));
  paint(g, { y0: 1, y1: 4, from: 'qb' }, (x, y) => ((x + 2 * y) % 5 === 0 ? 'l' : null));
  paint(g, { y0: 19, y1: 23, from: CLOTH }, (x, y) => (inGlyph(f, x, y) ? null : y % 3 === 0 ? 'M' : (x + y) % 6 === 0 ? 'l' : 'm'));
  paint(g, { y0: 24, y1: 24, from: 'x' }, (x) => (x % 2 ? 'M' : 'm'));
  paint(g, { y0: 12, y1: 23, x0: v.cable, x1: v.cable, from: CLOTH + 'mMl' }, (x, y) => (inGlyph(f, x, y) ? null : 'C'));
  keepGlyph(g, plain, f);
  return rows(g);
}

function high(plain, name) {
  const g = grid(plain), f = faceOf(name), v = VIEW[f], mantle = (x, y, c) => (inGlyph(f, x, y) ? null : c === 'Q' ? 'W' : 'x');
  widen(g, 12, 14, 'x');
  paint(g, { from: 'I' }, () => 'a');
  paint(g, { y0: 12, y1: 14, from: CLOTH }, mantle);
  if (v.back) paint(g, { y0: 15, y1: 23, from: CLOTH }, mantle);
  if (v.front) paint(g, { y0: 15, y1: 23, from: CLOTH }, (x, y, c) => (x <= 5 || x >= 17 ? mantle(x, y, c) : null));
  if (v.side) paint(g, { y0: 15, y1: 23, from: CLOTH }, (x, y, c) => ((v.side === 'west' ? x >= 14 : x < 10) ? mantle(x, y, c) : null));
  if (v.lining) { // a lining in the hood's opening, round the face
    const [x0, x1] = v.lining, near = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy]?.[x + dx] === 'k');
    paint(g, { y0: 4, y1: 11, x0, x1, from: CLOTH }, (x, y) => (near(x, y) ? 'x' : null));
  }
  paint(g, { y0: 24, y1: 24, from: 'x' }, () => 'G');
  keepGlyph(g, plain, f);
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
