// Ordo Machinum: a forge hazard beacon, the lens in a dark dome behind two cage bars, a chevron hazard band, a riveted pipe stanchion with a cog collar, a wide bolted foot.
import { frames } from './kit.mjs';

const SHAPE = [
  '......kk......',
  '.....kllk.....',
  '...kkmmmmkk...',
  '..kmlnnnnlmk..',
  '..kmlM**Mlmk..',
  '..kml*+*-lmk..',
  '..kml***-lmk..',
  '..kmlM--Mlmk..',
  '..kmlnnnnlmk..',
  '.kkkkkkkkkkkk.',
  '.khhkkhhkkhhk.',
  '.kkhhkkhhkkhk.',
  '.....kmMk.....',
  '.....klMk.....',
  '.....kmMk.....',
  '....khkkhk....',
  '...khhmMhhk...',
  '....khkkhk....',
  '.....kmMk.....',
  '.....klMk.....',
  '.....kmMk.....',
  '.....kmMk.....',
  '.....klMk.....',
  '.....kmMk.....',
  '...kkmlmMkk...',
  '..kmlmmmmMMk..',
  '.klmmmmmmmMMk.',
  'kkkkkkkkkkkkkk',
];

export default () => frames(SHAPE, 'forge');
