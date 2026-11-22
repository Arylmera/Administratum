// Arcane Tower: a rune obelisk, the lens a gem held in a gold ring floating above the stone, rune notches glowing down the obelisk, which widens to a carved foot.
import { frames } from './kit.mjs';

const SHAPE = [
  '..............',
  '.....khhk.....',
  '....kyhhyk....',
  '...kyhMMhyk...',
  '...kyM**Myk...',
  '...ky*+*-yk...',
  '...ky***-yk...',
  '...kyM--Myk...',
  '...kyhMMhyk...',
  '....kyhhyk....',
  '.....kyyk.....',
  '..............',
  '......kk......',
  '.....kuMk.....',
  '.....kuMk.....',
  '....kuvuMk....',
  '....kuuuMk....',
  '....kuuvMk....',
  '...kuuuuMMk...',
  '...kuvuuMMk...',
  '...kuuuvMMk...',
  '...kuuuuMMk...',
  '...kuvuuMMk...',
  '...kuuuuMMk...',
  '..kuuuuuuMMk..',
  '..kyyyyyyyyk..',
  '.kMMMMMMMMMMk.',
  '.kkkkkkkkkkkk.',
];

export default () => frames(SHAPE, 'tower');
