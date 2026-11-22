// Ordo Xenos: a stasis pylon, two prongs holding the lens in a ring with no hood over it, a slim obelisk with cold field lines, widening to its foot.
import { frames } from './kit.mjs';

const SHAPE = [
  '.k..........k.',
  '.kk........kk.',
  '..kl......lk..',
  '..kl.kkkk.lk..',
  '..klkM**Mklk..',
  '..klk*+*-klk..',
  '..klk***-klk..',
  '..klkM--Mklk..',
  '..kmlkkkkmlk..',
  '...kmmllmmk...',
  '....kmlmMk....',
  '....kmlmMk....',
  '....kmumMk....',
  '....kmlmMk....',
  '....kmlmMk....',
  '....kmumMk....',
  '....kmlmMk....',
  '....kmlmMk....',
  '...kmmumMMk...',
  '...kmmlmMMk...',
  '...kmmlmMMk...',
  '...kmmumMMk...',
  '...kmmlmMMk...',
  '..kmmmlmmMMk..',
  '..kmmmumMMMk..',
  '..kmmmmmMMMk..',
  '.kMMMMMMMMMMk.',
  '.kkkkkkkkkkkk.',
];

export default () => frames(SHAPE, 'xenos');
