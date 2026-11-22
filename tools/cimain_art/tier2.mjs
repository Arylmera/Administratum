// Ordo Administratum and every world that does not redraw it: an iron beacon on a short post, its lens near black when
// unlit, flame amber (a dimmer brass for the blink's off beat), phosphor green, alarm red: the lens chars of the
// matching CILAMP frame (ui/cilamp.js LENS fixes their colours).
import { beacon } from './kit.mjs';

export default () => ({
  'CIMAIN.off': beacon(['n', 'M', 'k']),
  'CIMAIN.amber': beacon(['f', 'F', 'g']),
  'CIMAIN.amber_dim': beacon(['g', 'f', 'G']),
  'CIMAIN.green': beacon(['c', 'O', 'C']),
  'CIMAIN.red': beacon(['a', 'F', 'x']),
});
