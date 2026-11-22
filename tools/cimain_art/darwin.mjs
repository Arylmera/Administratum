// Darwin: a Victorian gas lamp, the lens a glass globe under a brass crown and finial, a fluted walnut pedestal with a brass band, scrolled brass feet.
import { frames } from './shape.mjs';

const SHAPE = [
  '......hh......',
  '.....kyyk.....',
  '....kyhhyk....',
  '...kyyhhyyk...',
  '...kbM**MBk...',
  '...kb*+*-Bk...',
  '...kb***-Bk...',
  '...kbM--MBk...',
  '....kyhhyk....',
  '.....kyyk.....',
  '.....kLWk.....',
  '.....kLWk.....',
  '.....kLWk.....',
  '....kyhhyk....',
  '....kLwLWk....',
  '....kLwLWk....',
  '....kLwLWk....',
  '....kLwLWk....',
  '....kLwLWk....',
  '....kLwLWk....',
  '....kLwLWk....',
  '...kyhhhhyk...',
  '...kLwwwwWk...',
  '..kLwwwwwwWk..',
  '..kkkkkkkkkk..',
  '.khk......khk.',
  'khhk......khhk',
  'kkk........kkk',
];

export default () => frames(SHAPE, 'darwin');
