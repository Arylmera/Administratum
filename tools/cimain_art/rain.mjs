// Rain City: a hooded street signal, a wide drip canopy over the lens with rain falling off its lip, a galvanised pole with a junction box, a puddle at its foot.
import { frames } from './kit.mjs';

const SHAPE = [
  '....kkkkkk....',
  '..kkmllllmkk..',
  '.kmmmmmmmmmMk.',
  '.kkkkkkkkkkkk.',
  '..u.kM**Mk.u..',
  '....k*+*-k....',
  '..u.k***-k.u..',
  '....kM--Mk....',
  '.....kmMk.....',
  '.....klMk.....',
  '.....kmMk.....',
  '.....klMk.....',
  '....kkkkkk....',
  '....kuuuMk....',
  '....kulumk....',
  '....kuuuMk....',
  '....kkkkkk....',
  '.....klMk.....',
  '.....kmMk.....',
  '.....klMk.....',
  '.....kmMk.....',
  '.....klMk.....',
  '.....kmMk.....',
  '.....klMk.....',
  '.....kmMk.....',
  '....kmmMMk....',
  '.uu.kkkkkk.uu.',
  '..uuuuuuuuuu..',
];

export default () => frames(SHAPE, 'rain');
