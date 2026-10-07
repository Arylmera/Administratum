// Iso trial art (tools/iso.html): the hand-drawn isometric frames, in the key palette (ui/art/key.gpl, one char per
// colour slot, '.' transparent), so they can become PNG sheets through tools/map_to_art.mjs if the trial is kept.
// Everything else in the trial (floor, walls, cogitator, desks) is built in tools/iso.mjs from the existing flat art.
//
// The scribe, 32x34 art px like SCRIBE (feet: bottom centre). SW faces the viewer diagonally (down-left on screen),
// NE faces away (up-right); SE and NW are their mirrors. 3 walk frames each: 0 standing, 1 and 2 a foot forward.
const W = 32;
const pad = (name, rows) => rows.map((r, i) => {
  if (r.length > W) throw new Error(`${name} row ${i}: ${r.length} > ${W}`);
  return r.padEnd(W, '.');
});

// SW: the face opening turned to the left of the hood, the eyes toward its left edge; the hood's back and the right
// flank in shadow; the cog and the sash tab moved left; the near cuff (lm) on the left.
const SW_BODY = [
  '............kkkkkkkk',
  '..........kkRRRrrrrrkk',
  '........kkRRrrrrrrrrrrkk',
  '.......kRRrrrrrrrrrrrrrdk',
  '......kRrrrrrrrrrrrrrrrrdk',
  '.....kRrrrrrrrrrrrrrrrrrrdk',
  '....kRtttttttttrrrrrrrrrrddk',
  '....ktkkkkkkkkkdrrrrrrrrrddk',
  '....ktkeeeeeeekdrrrrrrrrrddk',
  '....ktkeeeeeeekdrrrrrrrrrddk',
  '....ktkOoeeOoekdrrrrrrrrrddk',
  '....ktkooeeooekdrrrrrrrrrddk',
  '....ktkeeeeeeekdrrrrrrrrrddk',
  '....ktkemMmMeekdrrrrrrrrrddk',
  '....ktkeeeeeeekdrrrrrrrrrddk',
  '....kdkkkkkkkkkdrrrrrrrrdddk',
  '....kdRrrrrrrrrrrrrrrrrrddk',
  '.....kddrrrrrrrrrrrrrrrddk',
  '....kktzTTTTTTTTTTTTTTTTTkk',
  '....kRrrrzzzzrrrrrrrrrrdddk',
  '....kRrrzzjjzzrrrrrrrrrlmdk',
  '....kRlmrzzzzrrryyyyyyyyyyk',
  '....kyyyyyyyyyyyyyyyyyyyyyk',
  '....kyyyyyyyyyyyrrrrrrrdddk',
  '....kRkyyykrrrrrrrrrrrrdddk',
  '....kRkykykrrrdrrrrrdrrdddk',
  '....kRkykykrrRdrrrrRdrrdddk',
  '....kdRkrkrrrRdrrrrRdrddddk',
  '....kdRrrrrrrRdrrrrRdrddddk',
  '....kddrrrrrrRdrGgGgGgGgGgk',
  '....kGgGgGgGgGgGkkkkkkkkkkk',
  '.....kkkkkkkkkkk',
];
// Boots point down-left (toe 'l' on the left); the forward foot reaches further left.
const SW_FEET = [
  ['.....klmMk..klmMk', '....kkkkk..kkkkk'],
  ['...klmMk.....kMk', '..kkkkk.....kk'],
  ['........klmMk', '.......kkkkk'],
];

// NE: the back. The hood's cog and the back plate (its optic, the spine kmMk) sit left of centre, where the back faces
// the viewer; the sash and hem dip there too; on the right edge a sliver of the hood rim (t). Heels at the bottom.
const NE_BODY = [
  '............kkkkkkkk',
  '..........kkRRRrrrrrkk',
  '........kkRRrrrrrrrrrrkk',
  '......kRRrrrzrzzrzrrrrrdk',
  '.....kRrrrrrrzzzzrrrrrrrdk',
  '....kRrrrrrrzzjjzzrrrrrrddk',
  '....kRrrrrrrrzzzzrrrrrrrrrdk',
  '....kRrrrrrrzrzzrzrrrrrrtddk',
  '....kRrrrkkkkkkrrrrrrrrrtddk',
  '....kRrrkmmmmmMkrrrrrrrrtddk',
  '....kRrrkmkOokMkrrrrrrrrtddk',
  '....kRrrkmkookMkrrrrrrrrtddk',
  '....kRrrkMmmmMMkrrrrrrrrtddk',
  '....kRrrrkkkkkkrrrrrrrrrtddk',
  '....kRrrrrkmMkrrrrrrrrrrtddk',
  '....kdRrrrkmMkrrrrrrrrrrdddk',
  '.....kdRrrkmMkrrrrrrrrrrdddk',
  '......kddrkmMkrrrrrrrrrdddk',
  '....kktzTTkmMkTTTTTTTTTTTkk',
  '....kRrrrrkMMkrrrrrrrrrdddk',
  '....kRmmrrkmMkrrrrrrrrrmmdk',
  '....kRmMrrkmMkrryyyyyyyyyyk',
  '....kyyyyyyyyyyyyyyyyyyyyyk',
  '....kyyyyyyyyyyyrrrrrrrdddk',
  '....kRrrrrrrrrrrrrrrrrrdddk',
  '....kRrrrrrrrrdrrrrrdrrdddk',
  '....kRrrrrrrrRdrrrrRdrrdddk',
  '....kdRrrrrrrRdrrrrRdrddddk',
  '....kdRrrrrrrRdrrrrRdrddddk',
  '....kddrrrrrrRdrGgGgGgGgGgk',
  '....kGgGgGgGgGgGkkkkkkkkkkk',
  '.....kkkkkkkkkkk',
];
const NE_FEET = [
  ['.....kMMk..kMMk', '......kk....kk'],
  ['....kMMk', '.....kk'],
  ['..........kMMk', '...........kk'],
];

const frames = (name, body, feet) => feet.map((f, i) => pad(`${name} ${i}`, [...body, ...f]));
const mirror = map => map.map(r => [...r].reverse().join(''));

export const SCRIBE_ISO = { sw: frames('sw', SW_BODY, SW_FEET), ne: frames('ne', NE_BODY, NE_FEET) };
SCRIBE_ISO.se = SCRIBE_ISO.sw.map(mirror);
SCRIBE_ISO.nw = SCRIBE_ISO.ne.map(mirror);
export const SCRIBE_ISO_FEET = { x: 15, y: 33 }; // art px: the frame's point on the floor
