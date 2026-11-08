// Neon Grid (every cyber world): a neon glass tube. The shaft dark glass between two cyan neon edges with a glint
// running across it, its head an emitter with pink pilot lights, its pit a neon landing pad; the cable a pink data
// fibre; the car a rounded glass pod with a light bar and a gridded back, its front two glass panels that slide apart;
// the floor a grating under a neon edge; the call lamp a square neon pad.
import { world } from './kit.mjs';

const edge = x => (x === 0 || x === 55 ? 'k' : x === 1 || x === 54 ? 'c' : x === 2 || x === 53 ? 'C' : null);
const round = (x, y, r = 6, w = 52, h = 40) => { // inside a rounded rect; 'edge' on its border
  const cx = Math.min(Math.max(x, r), w - 1 - r), cy = Math.min(Math.max(y, r), h - 1 - r), d = Math.hypot(x - cx, y - cy);
  return d > r + 0.3 ? null : d > r - 0.7 || x === 0 || y === 0 || x === w - 1 || y === h - 1 ? 'edge' : 'in';
};
// two glass panels, the left one ending at a, the right one starting at b
const panels = (a, b) => (x, y) => {
  const p = round(x, y);
  if (p === 'edge') return 'c';
  if (!p) return null;
  const inL = x >= 2 && x <= a, inR = x >= b && x <= 49;
  if (!inL && !inR) return null;
  if (x === 2 || x === a || x === b || x === 49 || y <= 2 || y >= 37) return 'C';
  return (x + y) % 23 === 0 || (x + y) % 23 === 1 ? 'l' : null; // the glint on the glass
};

export default () => world({
  SHAFT: (x, y) => edge(x) ?? ((x - 2 * y + 64) % 56 === 0 ? 'V' : x === 16 || x === 39 ? 'C' : 'n'),
  SHAFT_TOP: (x, y) => (y < 4 ? (y === 2 && x % 8 === 4 ? 'x' : y === 0 ? 'k' : 'M') : y === 4 ? 'c' : edge(x) ?? (y < 8 && x % 2 ? 'C' : 'n')),
  SHAFT_PIT: (x, y) => (y === 4 ? 'c' : y > 4 ? (y === 6 && x % 6 === 3 ? 'x' : 'M') : edge(x) ?? 'n'),
  CABLE: (x, y) => ((x + y) % 2 ? 'n' : 'x'),
  CAR_BACK: (x, y) => {
    const p = round(x, y);
    if (!p) return null;
    if (p === 'edge') return 'c';
    if (y === 3 && x >= 10 && x <= 41) return 'c'; // the light bar
    if (y >= 35) return y === 35 ? 'x' : 'M';
    return x % 6 === 0 || y % 6 === 0 ? 'V' : 'n';
  },
  'CAR_FRONT.shut': panels(25, 26),
  'CAR_FRONT.half': panels(13, 38),
  'CAR_FRONT.open': panels(4, 47),
  SLAB: (x, y) => (y === 0 ? 'c' : y === 1 ? 'C' : y === 11 ? 'k' : x % 4 === 0 || y === 6 ? 'V' : 'M'),
  SLAB_L: (x, y) => (y === 0 ? 'c' : y === 1 ? 'C' : x < y - 6 ? null : x === 0 || x === y - 6 ? 'k' : 'M'), // a chamfered end
  'LAMP.off': (x, y) => (x === 0 || y === 0 || x === 5 || y === 5 ? 'C' : 'n'),
  'LAMP.on': (x, y) => (x === 0 || y === 0 || x === 5 || y === 5 ? 'c' : x === 2 && y === 2 ? 'O' : 'x'),
});
