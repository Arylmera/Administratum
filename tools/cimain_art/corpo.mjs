// Corpo Tower: a black-glass totem, a sharp monolith with a white chrome edge and a glass glint, the lens a square LED near its top, a red neon underline at its foot.
import { frames } from './kit.mjs';

const SHAPE = [
  '..........kk..',
  '...kkkkkkkk...',
  '...klWWWWMk...',
  '...klWWWWMk...',
  '...klM**MMk...',
  '...kl*+*-Mk...',
  '...kl***-Mk...',
  '...klM--MMk...',
  '...klWWWWMk...',
  '...klWWWWMk...',
  '...klWWWbMk...',
  '...klWWbWMk...',
  '...klWbWWMk...',
  '...klWWWWMk...',
  '...klWWWWMk...',
  '...klWWWWMk...',
  '...klWWWWMk...',
  '...klWWWbMk...',
  '...klWWbWMk...',
  '...klWWWWMk...',
  '...klWWWWMk...',
  '...klWWWWMk...',
  '...klWWWWMk...',
  '...klWWWWMk...',
  '..kkkkkkkkkk..',
  '..kooooooook..',
  '..kMMMMMMMMk..',
  '..kkkkkkkkkk..',
];

export default () => frames(SHAPE, 'corpo');
