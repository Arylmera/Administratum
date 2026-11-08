// Arcane Tower (every fantasy world): a wooden platform on chains. The shaft open air between two timber guides, a
// chain hanging inside each; its head a beam with a winch drum, its pit a stone footing; the cable a rope; the car a
// plank platform hung from its corners by chains, its front a wooden rail that swings up to open; the floor plank
// boards on a diagonal brace; the call lamp a lantern.
import { world, disc } from './kit.mjs';

const guide = x => (x === 0 || x === 55 ? 'W' : x === 1 || x === 54 ? 'w' : null);
const chain = (x, y) => (x === 3 || x === 52 ? (y % 4 < 2 ? 'l' : 'm') : x === 4 || x === 51 ? (y % 4 < 2 ? 'm' : 'V') : null);
const post = (x, y) => (y >= 20 && y <= 38 && (x === 2 || x === 3 || x === 48 || x === 49) ? (x === 2 || x === 48 ? 'L' : 'w') : null);
const lip = y => (y === 37 ? 'W' : y === 38 ? 'k' : null);
const drum = disc(28, 8, 4);

export default () => world({
  SHAFT: (x, y) => guide(x) ?? chain(x, y),
  SHAFT_TOP: (x, y) => {
    if (drum(x, y)) return (x + y) % 3 ? 'L' : 'w';
    if (y >= 2 && y <= 6) return y === 2 ? 'L' : y === 6 ? 'W' : x % 9 === 0 ? 'W' : 'w';
    if (y === 1 || y === 7) return 'k';
    return guide(x) ?? (y > 7 ? chain(x, y) : null);
  },
  SHAFT_PIT: (x, y) => (y < 2 ? guide(x) : y === 2 ? 'k' : (x + (y > 5 ? 4 : 0)) % 8 === 0 || y === 5 ? 'V' : y === 3 ? 'm' : 'M'),
  CABLE: (x, y) => ((x + y) % 2 ? 'w' : 'L'),
  CAR_BACK: (x, y) => {
    if (y <= 2) return x >= 2 && x <= 49 ? (y === 0 ? 'k' : 'W') : null; // the hanger beam
    if (y >= 33) return y === 33 ? 'L' : y === 39 ? 'k' : x % 8 === 7 ? 'W' : 'w'; // the platform's planks
    return x === 3 || x === 48 ? (y % 4 < 2 ? 'l' : 'm') : x === 4 || x === 47 ? (y % 4 < 2 ? 'm' : 'V') : null; // the chains
  },
  'CAR_FRONT.shut': (x, y) => post(x, y) ?? lip(y) ?? ((y === 21 || y === 22 || y === 28) && x > 3 && x < 48 ? (y === 21 ? 'L' : 'w') : null),
  'CAR_FRONT.half': (x, y) => post(x, y) ?? lip(y) ?? (x > 3 && x < 26 && Math.abs(y - (22 - Math.round((x - 3) * 0.8))) < 1 ? 'L' : null), // the rail swinging up
  'CAR_FRONT.open': (x, y) => post(x, y) ?? lip(y) ?? ((x === 4 || x === 5) && y >= 2 && y < 20 ? (x === 4 ? 'L' : 'w') : null), // the rail upright
  SLAB: (x, y) => (y === 0 ? 'L' : y === 11 ? 'k' : y >= 9 ? 'W' : x % 8 === 7 ? 'W' : (x === 2 && y === 2) || (x === 10 && y === 6) ? 'm' : 'w'),
  SLAB_L: (x, y) => (y <= 4 ? (y === 0 ? 'L' : x === 0 ? 'W' : 'w') : x < y - 5 ? null : x === y - 5 ? 'L' : x === y - 4 ? 'W' : null), // a diagonal brace
  'LAMP.off': (x, y) => (y === 0 ? (x === 2 || x === 3 ? 'W' : null) : x === 0 || x === 5 || y === 5 ? 'W' : 'n'),
  'LAMP.on': (x, y) => (y === 0 ? (x === 2 || x === 3 ? 'W' : null) : x === 0 || x === 5 || y === 5 ? 'W' : x >= 2 && x <= 3 && y >= 2 && y <= 3 ? 'F' : 'f'),
});
