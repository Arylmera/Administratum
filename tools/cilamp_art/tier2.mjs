// Ordo Administratum and every world that does not redraw it: an iron signal post, its lens near black when unlit,
// flame amber (a dimmer brass for the blink's off beat), phosphor green, alarm red. The verdict also differs in shape
// and luminance, not only colour: a pass a bright check on a square lens, a fail a dark X, running the round lens,
// unlit a flat dark glass (kit.mjs LENS_ROWS).
import { lamp, LENS_ROWS as R } from './kit.mjs';

export default () => ({
  'CILAMP.off': lamp(R.off('n')),
  'CILAMP.amber': lamp(R.round('f', 'F', 'g')),
  'CILAMP.amber_dim': lamp(R.round('g', 'f', 'G')),
  'CILAMP.green': lamp(R.pass('c', 'O')),
  'CILAMP.red': lamp(R.fail('a')),
});
