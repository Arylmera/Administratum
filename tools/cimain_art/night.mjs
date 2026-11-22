// Ordo Malleus: a warded witch-lantern, a hexagonal silver cage round the lens under a small sigil spike, purity seals hanging from the cage on red ribbons, a slim pillar with silver bands.
import { frames } from './kit.mjs';

const SHAPE = [
  '......hh......',
  '.....khhk.....',
  '.....kllk.....',
  '....kmhhmk....',
  '...khM**Mhk...',
  '...kh*+*-hk...',
  '...kh***-hk...',
  '...khM--Mhk...',
  '..kkmhhhhmkk..',
  '..pr.kmMk.rp..',
  '..pr.kmMk.rp..',
  '..P..kmMk..P..',
  '.....khhk.....',
  '.....kmMk.....',
  '.....kmMk.....',
  '.....kmMk.....',
  '.....kmMk.....',
  '.....khhk.....',
  '.....kmMk.....',
  '.....kmMk.....',
  '.....kmMk.....',
  '.....kmMk.....',
  '.....khhk.....',
  '....kmmmMk....',
  '...kmhhhhMk...',
  '..kmmmmmmmMk..',
  '..kMMMMMMMMk..',
  '..kkkkkkkkkk..',
];

export default () => frames(SHAPE, 'night');
