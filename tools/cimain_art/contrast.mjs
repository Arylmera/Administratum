// Ordo Hereticus: a gibbet lantern, an iron cage round the lens like a pyre's eye, on a squat post with a short crossbar, a bone skull at its foot; bold black outlines.
import { frames } from './kit.mjs';

const SHAPE = [
  '.....kkkk.....',
  '....kmMMmk....',
  '...kkkkkkkk...',
  '...kmdddmMk...',
  '...kmM**MMk...',
  '...kd*+*-dk...',
  '...kd***-dk...',
  '...kmM--MMk...',
  '...kmdddmMk...',
  '...kkkkkkkk...',
  '.....kmMk.....',
  '.kkkkkmMkkkkk.',
  '.kmmmmmmmmMMk.',
  '.kkkkkmMkkkkk.',
  '.....kmMk.....',
  '.....kmMk.....',
  '.....kmMk.....',
  '.....kmMk.....',
  '.....kmMk.....',
  '.....kmMk.....',
  '....kbbbbk....',
  '...kbbbbbBk...',
  '...kbkbbkBk...',
  '...kbbkkbBk...',
  '....kbbbBk....',
  '....kbkkbk....',
  '..kmmmmmmMMk..',
  '.kkkkkkkkkkkk.',
];

export default () => frames(SHAPE, 'contrast');
