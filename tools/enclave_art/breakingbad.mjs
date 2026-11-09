// Breaking Bad's custom room: a clean room behind strip curtains. White epoxy floor inside a sash line, a steel rod
// hung with plastic strips in the sash colour (gaps between them), thin steel poles banded in it, stanchions with a
// sash cap, a doorway of clear strips under a sash sign, the strips pushed aside when open. Flat: one outline colour.
import { grid } from '../breakout_art/kit.mjs';

// The doorway: a lintel with the sash sign, two steel posts, clear strips between them (shut) or pushed aside (open);
// the strips stop a row short of the floor.
const doorway = open => (x, y) => {
  if (y <= 3) return y === 0 || y === 3 ? 'k' : x >= 4 && x <= 11 ? 'y' : 'm';
  if (x <= 1 || x >= 14) return x === 0 || x === 15 || y === 19 ? 'k' : 'm';
  if (y >= 18) return '.';
  const strip = open ? x <= 3 || x >= 12 : true;
  return !strip ? '.' : x % 3 === 1 ? 'k' : 'h';
};

export default () => ({
  ENCLAVE_FLOOR: grid(16, 16, (x, y) => (x === 0 || y === 0 ? 'y' : 'p')),
  ENCLAVE_RAIL: grid(16, 10, (x, y) => (y === 0 ? 'k' : y === 1 ? 'm' : y === 9 || x % 4 === 3 ? '.' : x % 4 === 0 ? 'k' : 'y')),
  ENCLAVE_SIDE: grid(4, 16, (x, y) => (x === 0 || x === 3 ? '.' : y % 8 === 3 ? 'y' : x === 1 ? 'k' : 'm')),
  // a stanchion: a sash cap, a steel pole, a flat foot
  ENCLAVE_POST: grid(6, 14, (x, y) => {
    if (y <= 1) return x >= 1 && x <= 4 ? (y === 0 ? 'k' : 'y') : '.';
    if (y >= 12) return y === 13 ? 'k' : 'm';
    return x === 2 ? 'k' : x === 3 ? 'm' : '.';
  }),
  // shut: strips hang across the gap, seen end on
  ENCLAVE_GATE: grid(4, 16, (x, y) => (x === 0 || x === 3 ? '.' : y % 4 === 3 ? 'k' : 'y')),
  // open: the strips bunched at the far end of the rod
  ENCLAVE_GATE_OPEN: grid(16, 10, (x, y) => (y === 0 ? 'k' : x >= 12 && y <= 8 ? (x === 12 ? 'k' : 'y') : '.')),
  ENCLAVE_GATE_FRONT: grid(16, 20, doorway(false)),
  ENCLAVE_GATE_FRONT_OPEN: grid(16, 20, doorway(true)),
});
