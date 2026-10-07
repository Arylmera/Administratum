// 39 deg trial art (tools/iso.html): the hand-drawn scribe frames, the gothic window and the hangings, in the key palette (ui/art/key.gpl, one char per
// colour slot, '.' transparent), so they can become PNG sheets through tools/map_to_art.mjs if the trial is kept.
// Everything else (floor, walls, cogitator, desks) is built from the existing flat art (tools/faces.mjs, tools/iso.mjs).
//
// The scribe, 32x34 art px like SCRIBE (feet: bottom centre). SW faces the viewer diagonally (turned ~45 deg),
// NE faces away; SE and NW, their mirrors, are the 39 deg view's facings along the back wall. 3 walk frames each: 0 standing, 1 and 2 a foot forward.
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

// In the 39 deg view the diagonals are not mirrors: walking along the side wall (+v / -v) the scribe is turned only
// ~39 deg from the viewer, along the back wall (+u / -u) ~51 deg. S39 / N39
// are the less-turned pair, drawn here; the more-turned pair reuses SW / NE mirrored (SE / NW).
// S39: toward the viewer, a little to the left: the face opening just left of centre, both eyes, the cog and the sash
// tab left of centre, the sash dipping at the front.
const S39_BODY = [
  '............kkkkkkkk',
  '..........kkRRRrrrrrkk',
  '........kkRRrrrrrrrrrrkk',
  '.......kRRrrrrrrrrrrrrrrdk',
  '......kRrrrrrrrrrrrrrrrrrdk',
  '.....kRrrrrrrrrrrrrrrrrrrrdk',
  '....kRrttttttttttttttrrrrddk',
  '....kRrtkkkkkkkkkkkkkdrrrrddk',
  '....kRrtkeeeeeeeeeeekdrrrrddk',
  '....kRrtkeeeeeeeeeeekdrrrrddk',
  '....kRrtkeOoeeeOoeeekdrrrrddk',
  '....kRrtkeooeeeooeeekdrrrrddk',
  '....kRrtkeeeeeeeeeeekdrrrrddk',
  '....kRrtkeeemMmMmeeekdrrrrddk',
  '....kRrtkeeeeeeeeeeekdrrrrddk',
  '....kdRtkkkkkkkkkkkkkdrrrdddk',
  '....kdRrrrrrrrrrrrrrrrrrrdddk',
  '.....kddrrrrrrrrrrrrrrrrrddk',
  '...kktzTTTTTTTTTTTTTTTTTTTTkk',
  '...kRrrrrrrzzzzrrrrrrrrrrdddk',
  '...kRrrrrrzzjjzzrrrrrrrrrlmdk',
  '...kRlmrrrrzzzzrrrrrryyyyyyyk',
  '...kyyyyyyyyyyyyyyyyyyyyyyyyk',
  '...kyyyyyyyyyyyyyyyyyrrrrdddk',
  '...kRrrrkyyykrrrrrrrrrrrrdddk',
  '...kRrrrkykykrrrdrrrrrdrrdddk',
  '...kRrrrkykykrrRdrrrrRdrrdddk',
  '...kdRrrrkrkrrRdrrrrrRdrddddk',
  '...kdRrrrrrrrRdrrrrrRdrddddk',
  '...kddrrrrrrrrrRdrrGgGgGgGgGk',
  '...kGgGgGgGgGgGgGgGkkkkkkkkkk',
  '....kkkkkkkkkkkkkkk',
];
const S39_FEET = [
  ['.....klmmMk..klmmMk', '....kkkkkk..kkkkkk'],
  ['...klmmMk.......kkkk', '..kkkkkk'],
  ['.........klmmMk', '........kkkkkk'],
];
// N39: away from the viewer, a little to the right: the back plate, spine and hood cog nearer the middle than NE.
const N39_BODY = [
  '............kkkkkkkk',
  '..........kkRRRrrrrrkk',
  '........kkRRrrrrrrrrrrkk',
  '......kRRrrrrrzrzzrzrrrdk',
  '.....kRrrrrrrrrzzzzrrrrrdk',
  '....kRrrrrrrrrzzjjzzrrrrddk',
  '....kRrrrrrrrrrzzzzrrrrrrrdk',
  '....kRrrrrrrrrzrzzrzrrrrtddk',
  '....kRrrrrrkkkkkkrrrrrrrtddk',
  '....kRrrrrkmmmmmMkrrrrrrtddk',
  '....kRrrrrkmkOokMkrrrrrrtddk',
  '....kRrrrrkmkookMkrrrrrrtddk',
  '....kRrrrrkMmmmMMkrrrrrrtddk',
  '....kRrrrrrkkkkkkrrrrrrrtddk',
  '....kRrrrrrrkmMkrrrrrrrrtddk',
  '....kdRrrrrrkmMkrrrrrrrrdddk',
  '.....kdRrrrrkmMkrrrrrrrrdddk',
  '......kddrrrkmMkrrrrrrrdddk',
  '....kktzTTTTkmMkTTTTTTTTTkk',
  '....kRrrrrrrkMMkrrrrrrrdddk',
  '....kRmmrrrrkmMkrrrrrrrmmdk',
  '....kRmMrrrrkmMkyyyyyyyyyyk',
  ...NE_BODY.slice(22),
];

const frames = (name, body, feet) => feet.map((f, i) => pad(`${name} ${i}`, [...body, ...f]));
const mirror = map => map.map(r => [...r].reverse().join(''));

export const SCRIBE_ISO = { sw: frames('sw', SW_BODY, SW_FEET), ne: frames('ne', NE_BODY, NE_FEET) };
SCRIBE_ISO.se = SCRIBE_ISO.sw.map(mirror);
SCRIBE_ISO.nw = SCRIBE_ISO.ne.map(mirror);
SCRIBE_ISO.s39 = frames('s39', S39_BODY, S39_FEET);
SCRIBE_ISO.n39 = frames('n39', N39_BODY, NE_FEET);
export const SCRIBE_ISO_FEET = { x: 15, y: 33 }; // art px: the frame's point on the floor

// ---- the 39 deg pass: a tall gothic window and full-height banners (Ordo Administratum) -------------------------------
// Both are drawn by small rules in the key palette (outline k, iron frame l/m/M, lead came k, stained glass u/x/a/g/h/v,
// red cloth x/r/R/d, gold g/h/G), each rule's numbers hand-picked; the result is a plain char map like any other.

// A twin-light lancet under a pointed arch, a rose with the cog in its head, a stone sill. 36 x 84.
export const GOTHIC_WINDOW = (() => {
  const W = 36, H = 84, SILL = 76, cx = 18;
  const head = [1, 1, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 14, 15, 16, 16, 17, 17, 18, 18]; // arch half-width per row
  const hw = r => (r < 0 ? -1 : r < head.length ? head[r] : 18);
  const depth = (r, c) => { let k = 0; while (k < 6 && Math.abs(c + 0.5 - cx) <= hw(r - k) - k) k++; return k; }; // 0 = outside
  const lightHead = [1, 2, 3, 4, 5, 6]; // each light's own pointed top, rows 32..37
  const glass = (r, c) => {
    // rose: the Mechanicus cog in gold, petals red and blue
    const dx = c + 0.5 - cx, dy = r + 0.5 - 15, d = Math.hypot(dx, dy), sector = Math.floor((Math.atan2(dy, dx) + Math.PI) / (Math.PI / 4)) % 8;
    if (r < 29) {
      if (d < 1.6) return 'k';
      if (d < 3.2) return 'h';
      if (d < 4.4) return 'g';
      if (d < 5.6) return sector % 2 ? 'G' : 'g';
      if (d < 6.6) return sector % 2 ? 'x' : 'a';
      if (d < 7.6) return 'k';
      return (c + r) % 7 === 0 || (c - r + 70) % 7 === 0 ? 'k' : 'u';
    }
    if (r === 29 || r === 31) return 'k';
    if (r === 30) return 'm'; // the transom
    if (c === 16 || c === 19) return 'k';
    if (c === 17) return 'm';
    if (c === 18) return 'M'; // the mullion
    const lc = c < 18 ? 10 : 25.5, half = Math.abs(c + 0.5 - lc);
    if (r < 38 && half > lightHead[r - 32]) return (c + r) % 4 === 0 ? 'k' : 'u';
    if (r < 38 && half > lightHead[r - 32] - 1) return 'k';
    if ((c + r) % 6 === 0 || (c - r + 120) % 6 === 0) return 'k'; // diamond quarries
    if (r >= 51 && r <= 53) return r === 52 ? 'h' : 'g';
    if (r < 51) return half < 2.5 ? (r < 42 ? 'g' : 'x') : 'u';
    if (r < 66) return half < 2.5 ? 'a' : 'v';
    return half < 3.5 ? 'x' : 'u';
  };
  const rows = [];
  for (let r = 0; r < H; r++) {
    let s = '';
    for (let c = 0; c < W; c++) {
      if (r >= SILL) { s += r === SILL || r === H - 1 || c === 0 || c === W - 1 ? 'k' : r < SILL + 3 ? 'l' : r < SILL + 5 ? 'm' : 'M'; continue; }
      const k = depth(r, c);
      s += k === 0 ? '.' : k === 1 ? 'k' : k === 2 ? (c < cx ? 'l' : 'm') : k === 3 ? (c < cx ? 'm' : 'M') : k === 4 ? 'k' : glass(r, c);
    }
    rows.push(s);
  }
  return rows;
})();

// A cathedral hanging, from a brass rod to near the wall foot: red cloth with folds, gold trim, the cog and skull high
// up, gold bands, a swallow-tail bottom with a gold fringe. 26 x 100.
export const HANGING = (() => {
  const W = 26, H = 100, ecx = 13, ecy = 24;
  const skull = [
    '..kkkkkk..',
    '.kbbbbbbk.',
    'kbbbbbbbbk',
    'kbkkbbkkbk',
    'kbkkbbkkBk',
    'kbbbbkbbBk',
    '.kbbbbbBk.',
    '..kbkbkk..',
    '...kkkk...',
  ];
  const bottom = c => 86 + Math.round(12 * Math.abs(c + 0.5 - 13) / 11);
  const rows = [];
  for (let r = 0; r < H; r++) {
    let s = '';
    for (let c = 0; c < W; c++) {
      if (r < 4) { s += r === 0 || r === 3 ? (c === 0 || c === W - 1 ? 'g' : 'k') : c === 0 || c === W - 1 ? 'k' : r === 1 ? 'h' : 'G'; continue; }
      if (c < 2 || c > 23) { s += '.'; continue; }
      const b = bottom(c);
      if (r > b) { s += r === b + 1 && c % 2 === 0 ? 'g' : '.'; continue; } // fringe tassels
      if (r === b || c === 2 || c === 23) { s += 'k'; continue; }
      if (r === b - 1) { s += 'h'; continue; }
      if (r === b - 2) { s += 'g'; continue; }
      if (c === 3) { s += 'g'; continue; }
      if (c === 22) { s += 'G'; continue; }
      if (r < 7) { s += r === 6 ? 'k' : r === 4 ? 'h' : 'g'; continue; }
      if (r === 44 || r === 46 || r === 74) { s += 'g'; continue; }
      if (r === 45) { s += 'h'; continue; }
      // the emblem: a gold cog ring, the skull inside
      const dx = c + 0.5 - ecx, dy = r + 0.5 - ecy, d = Math.hypot(dx, dy), sector = Math.floor((Math.atan2(dy, dx) + Math.PI) / (Math.PI / 4)) % 8;
      const sk = skull[r - (ecy - 4)]?.[c - (ecx - 5)];
      if (sk && sk !== '.') { s += sk; continue; }
      if (c >= 5 && c <= 21) {
        if (d < 5.6) { s += 'x'; continue; }
        if (d < 6.6) { s += d < 6.1 ? 'h' : 'g'; continue; }
        if (d < 7.8 && sector % 2) { s += 'G'; continue; }
        if (d < 8.6 && (sector % 2 || d < 7)) { s += 'k'; continue; }
      }
      // the cloth: folds (shadow r, lit R), the right edge in shadow
      s += c === 9 || c === 16 ? 'r' : c === 8 || c === 15 ? 'R' : c >= 20 ? (c === 21 ? 'd' : 'r') : 'x';
    }
    rows.push(s);
  }
  return rows;
})();
