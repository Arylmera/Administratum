// Ordo Administratum and every world that does not redraw it: an iron signal post, its lens near black when unlit,
// flame amber (a dimmer brass for the blink's off beat), phosphor green, alarm red.
import { lamp } from './kit.mjs';

export default () => ({
  'CILAMP.off': lamp(['n', 'M', 'k']),
  'CILAMP.amber': lamp(['f', 'F', 'g']),
  'CILAMP.amber_dim': lamp(['g', 'f', 'G']),
  'CILAMP.green': lamp(['c', 'O', 'C']),
  'CILAMP.red': lamp(['a', 'F', 'x']),
});
