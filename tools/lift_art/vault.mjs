// Vault 111 (every Fallout world): a freight cage. The shaft steel I-beams painted in hazard stripes, girders across,
// its head a steel header over a hazard band, its pit a hazard band on a bolted plate; the cable steel wire; the car a
// wire-mesh cage on a tread-plate floor, its front a mesh gate with a hazard band that lifts straight up; the floor a
// tread plate with a striped edge; the call lamp a rotating beacon.
import { world } from './kit.mjs';

const hazard = (x, y) => ((x + y) % 8 < 4 ? 'f' : 'k');
const beam = (x, y) => (x === 0 || x === 55 ? 'k' : x === 3 || x === 52 ? 'M' : x <= 2 || x >= 53 ? (y % 8 < 4 ? 'f' : 'k') : null);
const frame = x => (x === 0 || x === 51 ? 'k' : x === 1 || x === 50 ? 'm' : x === 2 || x === 49 ? 'M' : null);
// the mesh gate, lifted so its bottom band sits at rows b..b+3
const gate = b => (x, y) => frame(x) ?? (y <= 3 ? 'M' : y >= b && y <= b + 3 ? hazard(x, y) : y > 3 && y < b && (x % 4 === 1 || y % 8 === 0) ? 'm' : null);

export default () => world({
  SHAFT: (x, y) => beam(x, y) ?? (y <= 1 ? (y ? 'M' : 'm') : 'V'),
  SHAFT_TOP: (x, y) => (y < 8 ? (y === 0 ? 'k' : x % 10 === 5 && y === 4 ? 'l' : 'M') : hazard(x, y)),
  SHAFT_PIT: (x, y) => (y < 4 ? hazard(x, y) : x % 10 === 5 && y === 5 ? 'l' : y === 7 ? 'k' : 'M'),
  CABLE: (x, y) => ((x + y) % 2 ? 'V' : 'M'),
  CAR_BACK: (x, y) => {
    const c = Math.min(x, 51 - x) + Math.min(y, 39 - y); // the cage's chamfered corners
    if (c < 4) return null;
    if (c === 4 || x === 0 || x === 51 || y === 0 || y === 39) return 'k';
    if (x <= 2 || x >= 49 || y <= 2) return 'm';
    if (y >= 35) return (x + y) % 4 === 0 ? 'l' : 'M'; // tread plate
    return x % 4 === 0 || y % 4 === 0 ? 'm' : 'n';
  },
  'CAR_FRONT.shut': gate(32),
  'CAR_FRONT.half': gate(15),
  'CAR_FRONT.open': gate(4),
  SLAB: (x, y) => (y === 0 ? 'l' : y === 1 ? 'm' : y === 11 ? 'k' : y === 10 ? (x % 4 < 2 ? 'f' : 'k') : (x + 2 * y) % 6 === 0 ? 'l' : 'M'),
  SLAB_L: (x, y) => (y < 4 ? (y === 0 ? 'l' : 'M') : x < y - 4 ? null : hazard(x, y)), // a striped end plate
  'LAMP.off': (x, y) => (y === 5 ? 'm' : Math.hypot(x + 0.5 - 3, y + 0.5 - 5) <= 3 ? 'M' : null),
  'LAMP.on': (x, y) => (y === 5 ? 'm' : Math.hypot(x + 0.5 - 3, y + 0.5 - 5) <= 3 ? (x === 2 && y === 2 ? 'F' : 'f') : null),
});
