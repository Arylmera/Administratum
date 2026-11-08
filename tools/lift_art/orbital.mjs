// Orbital Station (every space world): a ribbed station tube. The shaft pale hull ribs with a status light, its head a
// domed cap with a ring light, its pit docking clamps with warning blocks; the cable a conduit; the car a rounded
// capsule with a round viewport, its front a hatch whose iris opens from the middle; the floor a deck plate with a light
// strip, ending on a rounded bulkhead; the call lamp a status light.
import { world, disc } from './kit.mjs';

const capsule = (x, y, r = 10) => { // the capsule's rounded outline: 'k' outside ring, 'l' shell, 'in' inside
  const cx = Math.min(Math.max(x, r), 51 - r), cy = Math.min(Math.max(y, r), 39 - r), d = Math.hypot(x - cx, y - cy);
  return d > r + 0.3 ? null : d > r - 0.7 ? 'k' : d > r - 2.7 ? 'l' : 'in';
};
const port = disc(26.5, 15.5, 6), portRim = disc(26.5, 15.5, 7.5);
const hatch = iris => (x, y) => {
  const c = capsule(x, y);
  if (c !== 'in') return c;
  if (Math.hypot(x + 0.5 - 26, y + 0.5 - 20) < iris) return null; // the iris, open this far
  if (iris > 0) return Math.hypot(x + 0.5 - 26, y + 0.5 - 20) < iris + 1.5 ? 'l' : 'm';
  return port(x, y) ? 'u' : portRim(x, y) ? 'k' : y === 30 ? 'f' : y === 31 ? 'k' : 'm';
};

export default () => world({
  SHAFT: (x, y) => (x === 0 || x === 55 ? 'k' : x <= 3 ? 'l' : x >= 52 ? 'm' : x === 4 && y === 4 ? 'c' : y % 8 === 0 ? 'l' : y % 8 === 1 ? 'm' : 'V'),
  SHAFT_TOP: (x, y) => {
    const e = ((x + 0.5 - 28) / 28) ** 2 + ((y + 0.5 - 12) / 12) ** 2;
    return e > 1 ? null : e > 0.8 ? 'k' : y === 10 ? 'c' : y > 10 ? 'V' : 'm';
  },
  SHAFT_PIT: (x, y) => (y < 4 ? (x === 0 || x === 55 ? 'k' : 'V') : y === 4 ? 'l' : (y === 5 || y === 6) && x % 12 < 3 ? 'f' : 'm'),
  CABLE: (x, y) => (x ? 'm' : y === 2 ? 'V' : 'l'),
  CAR_BACK: (x, y) => {
    const c = capsule(x, y);
    if (c !== 'in') return c;
    if (port(x, y)) return 'u';
    if (portRim(x, y)) return 'k';
    return y >= 36 ? 'M' : y === 26 ? 'P' : 'p';
  },
  'CAR_FRONT.shut': hatch(0),
  'CAR_FRONT.half': hatch(9),
  'CAR_FRONT.open': hatch(30),
  SLAB: (x, y) => (y === 0 ? 'l' : y <= 2 ? 'm' : y === 3 || y === 10 ? 'V' : y === 11 ? 'k' : y === 6 && x % 16 === 8 ? 'c' : 'm'),
  SLAB_L: (x, y) => { const d = Math.hypot(8 - x, y); return d > 11 ? null : d > 10 ? 'k' : y === 0 ? 'l' : 'm'; }, // a rounded bulkhead
  'LAMP.off': (x, y) => (x === 0 || y === 0 || x === 5 || y === 5 ? 'm' : 'V'),
  'LAMP.on': (x, y) => (x === 0 || y === 0 || x === 5 || y === 5 ? 'm' : x === 2 && y === 2 ? 'O' : 'c'),
});
