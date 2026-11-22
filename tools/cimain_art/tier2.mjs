// Ordo Administratum and every world that does not redraw it: an iron beacon on a short post, its lens near black when
// unlit, flame amber (a dimmer brass for the blink's off beat), phosphor green, alarm red: the lens chars of the
// matching CILAMP frame (ui/cilamp.js LENS fixes their colours). Pass and fail also differ in shape, not only colour:
// a bright check on the green lens, a dark X on the red (kit.mjs INNER).
import { beacon, INNER } from './kit.mjs';

export default () => ({
  'CIMAIN.off': beacon(['n', 'M', 'k'], INNER.off('n')),
  'CIMAIN.amber': beacon(['f', 'F', 'g']),
  'CIMAIN.amber_dim': beacon(['g', 'f', 'G']),
  'CIMAIN.green': beacon(['c', 'O', 'C'], INNER.green('c', 'O')),
  'CIMAIN.red': beacon(['a', 'F', 'x'], INNER.red('a')),
});
