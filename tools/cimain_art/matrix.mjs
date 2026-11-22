// Green Code: a code obelisk, a black slab with a flat top frame, the lens in a square port, trails of code glyphs running down its face (o, the optic slot: not a lens char, so the code keeps its colour in every frame).
import { frames } from './kit.mjs';

const SHAPE = [
  '..kkkkkkkkkk..',
  '..kMMMMMMMMk..',
  '..knnnnnnnnk..',
  '..knkkkkkknk..',
  '..knkM**Mknk..',
  '..knk*+*-knk..',
  '..knk***-knk..',
  '..knkM--Mknk..',
  '..knkkkkkknk..',
  '..knnnnnnonk..',
  '..knonnnnonk..',
  '..knonnnnvnk..',
  '..knvnnnnvnk..',
  '..knvnnnnnnk..',
  '..knvnnonnnk..',
  '..knnnnonnnk..',
  '..knnnnvnnnk..',
  '..knnonvnnnk..',
  '..knnonvnonk..',
  '..knnvnnnonk..',
  '..knnvnnnvnk..',
  '..knnvnnnvnk..',
  '..knnnnnnvnk..',
  '..knnnonnnnk..',
  '..knnnvnnnnk..',
  '..knnnnnnnnk..',
  '.kMMMMMMMMMMk.',
  '.kkkkkkkkkkkk.',
];

export default () => frames(SHAPE, 'matrix');
