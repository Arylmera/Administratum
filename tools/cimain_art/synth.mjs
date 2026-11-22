// Sunset Drive: a retro roadside sign pole, the lens a ball in a neon ring at the heart of a four-point starburst, a chrome pole, a striped sunset collar above its foot.
import { frames } from './shape.mjs';

const SHAPE = [
  '......hh......',
  '......oo......',
  '.....kook.....',
  '....kooook....',
  '...koM**Mok...',
  '.hooo*+*-oooh.',
  '.hooo***-oooh.',
  '...koM--Mok...',
  '....kooook....',
  '.....kook.....',
  '......oo......',
  '.....klhk.....',
  '.....klhk.....',
  '.....klhk.....',
  '.....klhk.....',
  '.....klhk.....',
  '.....klhk.....',
  '.....klhk.....',
  '.....klhk.....',
  '.....klhk.....',
  '.....klhk.....',
  '....kkkkkk....',
  '...kRRRRRRk...',
  '...kyyyyyyk...',
  '...kooooook...',
  '..kllllllhhk..',
  '..kMMMMMMMMk..',
  '..kkkkkkkkkk..',
];

export default () => frames(SHAPE, 'synth');
