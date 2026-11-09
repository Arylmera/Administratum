// Breaking Bad (the flat superlab): a freight lift. The shaft pale lab wall between steel rails, its head a narrow
// motor housing with its sheave over a steel beam, its pit a steel well with two buffers; the cable steel; the car pale
// grey under a roof cap, a lamp strip and a handrail, its front a steel gate of horizontal slats that rises to open; the
// floor the lab's grey epoxy under a steel nosing on plain brackets; the call lamp a square steel pip, green when lit.
// Flat: one outline colour (every shape ringed in k), no shading.
import { world, disc } from './kit.mjs';

// A shape ringed in k: inside(x, y) its pixels, fill(x, y) the char of those not on its edge (frame edges count as outside).
const shape = (inside, fill) => (x, y) => (!inside(x, y) ? null : [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !inside(x + a, y + b)) ? 'k' : fill(x, y));
const W = (x0, x1) => (x, y) => x >= x0 && x <= x1 && y >= 0;
const car = (x, y) => x >= 0 && x <= 51 && y >= 0 && y <= 39 && (y >= 4 || (x >= 4 && x <= 47)); // the roof cap
const roofOrPost = (x, y) => (y <= 4 || x <= 3 || x >= 48 ? 'm' : null);
// The gate: slats down to row `low`, the opening below it clear between the posts.
const front = low => shape((x, y) => car(x, y) && !(x >= 4 && x <= 47 && y > low && y <= 37), (x, y) => roofOrPost(x, y) ?? (y >= 38 ? 'M' : y % 4 === 0 ? 'k' : 'h'));
const sheave = disc(28, 3.5, 2.6);
const pip = (x, y) => !((x === 0 || x === 5) && (y === 0 || y === 5));

export default () => world({
  SHAFT: (x, y) => (x === 0 || x === 3 || x === 52 || x === 55 ? 'k' : x <= 2 || x >= 53 ? 'M' : x === 27 || x === 28 ? 'h' : 'w'),
  SHAFT_TOP: shape((x, y) => (y >= 6 ? W(0, 55)(x, y) : x >= 14 && x <= 41), (x, y) => (sheave(x, y) ? 'h' : y >= 6 ? 'M' : 'm')),
  SHAFT_PIT: shape(() => true, (x, y) => ((x >= 13 && x <= 17) || (x >= 38 && x <= 42)) && y <= 4 ? 'h' : 'M'),
  CABLE: (x, y) => (y % 2 ? 'M' : 'k'),
  CAR_BACK: shape(car, (x, y) => (y >= 35 ? 'M' : y === 22 ? 'h' : y >= 5 && y <= 6 && x >= 18 && x <= 33 ? 'O' : y <= 4 ? 'm' : 'w')),
  'CAR_FRONT.shut': front(37),
  'CAR_FRONT.half': front(20),
  'CAR_FRONT.open': front(8),
  SLAB: (x, y) => (y === 0 || y === 11 ? 'k' : y <= 2 ? 'h' : '1'),
  SLAB_L: shape((x, y) => y <= 3 || x >= 3, (x, y) => (y <= 2 ? 'h' : '1')),
  'LAMP.off': shape(pip, () => 'M'),
  'LAMP.on': shape(pip, (x, y) => (x === 2 && y === 2 ? 'O' : ')')),
});
