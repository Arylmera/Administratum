// Orbital Station: a status column, a small dish antenna on top, the lens in a porthole bezel, a white hull pillar with a blue and an orange stripe, a footed base plate.
import { frames } from './shape.mjs';

const SHAPE = [
  '....kbbbbk....',
  '.....kBBk.....',
  '......kk......',
  '...kkppppkk...',
  '..kplM**MlPk..',
  '..kpl*+*-lPk..',
  '..kpl***-lPk..',
  '..kplM--MlPk..',
  '..kpPllllPPk..',
  '..kRRRRRRRRk..',
  '..kyyyyyyyyk..',
  '...kppppppk...',
  '...kpppppPk...',
  '...kpBpppPk...',
  '...kpppppPk...',
  '...kpppppPk...',
  '...kpppppPk...',
  '...kpBpppPk...',
  '...kpppppPk...',
  '...kpppppPk...',
  '...kpppppPk...',
  '...kRRRRRRk...',
  '...kyyyyyyk...',
  '...kpppppPk...',
  '..kpppppppPk..',
  '..kPPPPPPPPk..',
  '.kllllllllllk.',
  '.kkkkkkkkkkkk.',
];

export default () => frames(SHAPE, 'orbital');
