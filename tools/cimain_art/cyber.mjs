// Neon Grid: an antenna mast, a whip antenna with a magenta tip over a hex-chip head holding the round LED, a neon tube round the head, an open lattice mast, a cable at its foot.
import { frames } from './shape.mjs';

const SHAPE = [
  '......oo......',
  '......kk......',
  '......kk......',
  '....kkkkkk....',
  '..komM**Mmok..',
  '..kom*+*-mok..',
  '..kom***-mok..',
  '..komM--Mmok..',
  '....kkkkkk....',
  '.....kmMk.....',
  '....kl..lk....',
  '....k.ll.k....',
  '....kl..lk....',
  '....k.ll.k....',
  '....kl..lk....',
  '....k.ll.k....',
  '....kl..lk....',
  '....k.ll.k....',
  '....kl..lk....',
  '....k.ll.k....',
  '....kl..lk....',
  '....k.ll.k....',
  '....kl..lk....',
  '....k.ll.k....',
  '...kkkkkkkk...',
  '..kmmmmmmMMk..',
  '..kMMMMMMMMk..',
  '..kkkkkkkkkk..',
];

export default () => frames(SHAPE, 'cyber');
