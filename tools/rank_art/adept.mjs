// The 40k adept's rank bodies (flat, 24x28 art px), drawn from each plain frame (tools/rank_art.mjs), by the scribe's
// rules (tools/rank_art/scribe.mjs):
//   novice  a machine agent: an iron hood plate with rivets, a narrower body, iron plates below, a cable, an iron hem
//   high    refined: broad shoulders under a mantle in the Ordo's trim colour that covers the back, a ruby in the hood
//           cog, a muted brass hem
// The subagent kind's glyph places (the data-slate in front, the back plate: anchors 'glyph down' / 'glyph up') stay as
// drawn: the glyph is laid there on every rank (sprites.js marked).
import { grid, rows, put, paint, widen, narrow } from './kit.mjs';

const CLOTH = 'qQb'; // the adept's robe: bone, its shadow, its light
const dirOf = n => n.split(' ')[0];
const GLYPH = { down: [6, 14], up: [7, 14] };
const inGlyph = (dir, x, y) => { const g = GLYPH[dir]; return !!g && x >= g[0] && x < g[0] + 10 && y >= g[1] && y < g[1] + 5; };

function novice(plain, name) {
  const g = grid(plain), dir = dirOf(name);
  narrow(g, 12, 24);
  paint(g, { from: 'JI' }, (x, y, c) => (c === 'J' ? 'm' : 'M')); // the hood cog becomes an iron plate
  paint(g, { y0: 1, y1: 4, from: 'qb' }, (x, y) => ((x + 2 * y) % 5 === 0 ? 'l' : null)); // rivets on the hood
  paint(g, { y0: 19, y1: 23, from: CLOTH }, (x, y) => (inGlyph(dir, x, y) ? null : y % 3 === 0 ? 'M' : (x + y) % 6 === 0 ? 'l' : 'm')); // iron plates
  paint(g, { y0: 24, y1: 24, from: 'x' }, (x) => (x % 2 ? 'M' : 'm'));
  const cable = dir === 'right' ? 6 : 17;
  paint(g, { y0: 12, y1: 23, x0: cable, x1: cable, from: CLOTH + 'mMl' }, (x, y) => (inGlyph(dir, x, y) ? null : 'C'));
  return rows(g);
}

function high(plain, name) {
  const g = grid(plain), dir = dirOf(name), mantle = (x, y, c) => (inGlyph(dir, x, y) ? null : c === 'Q' ? 'W' : 'x');
  widen(g, 12, 14, 'x'); // broad shoulders under the mantle
  paint(g, { from: 'I' }, () => 'a'); // a ruby in the hood cog
  paint(g, { y0: 12, y1: 14, from: CLOTH }, mantle); // the mantle over the shoulders
  if (dir === 'up') paint(g, { y0: 15, y1: 23, from: CLOTH }, mantle); // and down the back, round the back plate
  if (dir === 'down') paint(g, { y0: 15, y1: 23, from: CLOTH }, (x, y, c) => (x <= 5 || x >= 18 ? mantle(x, y, c) : null)); // its two fronts
  if (dir !== 'up') { // a lining in the hood's opening, round the face
    const [x0, x1] = dir === 'down' ? [6, 17] : [12, 19], near = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy]?.[x + dx] === 'k');
    paint(g, { y0: 4, y1: 11, x0, x1, from: CLOTH }, (x, y) => (near(x, y) ? 'x' : null));
  }
  if (dir === 'right') paint(g, { y0: 15, y1: 23, from: CLOTH }, (x, y, c) => (x < 12 ? mantle(x, y, c) : null)); // falling behind
  paint(g, { y0: 24, y1: 24, from: 'x' }, () => 'G'); // a muted brass hem
  return rows(g);
}

export default plain => {
  const frames = {};
  for (const n of ['up', 'down', 'right'].flatMap(d => [0, 1, 2].map(i => `${d} ${i}`))) {
    frames[`novice ${n}`] = novice(plain[n], n);
    frames[`high ${n}`] = high(plain[n], n);
  }
  return { frames, anchors: {} };
};
