// The Watchman of the Orbital Station: a night-shift astronaut. A white flight helmet (p, shade P) with an orange
// brow band (x), the face in its open visor, a headlamp on the helmet's crown (lens f/F, the light anchor: on the
// crown it stays put in every facing), a comms disc at each ear; the station's blue flight suit (R/r, shade d) with
// orange shoulder patches, a chest control unit (cyan screen c, red LED a), white gloves, a belt (M, buckle l) and
// white boots (b/B). From behind: the helmet's back shell and a white life-support pack, no face. A wrist panel
// (cyan c) on his left forearm; ring: he raises it before his chest and taps it. 32x36 art px. Rows 0..2 are the
// headlamp, 3..14 the helmet, 15 the neck ring, 16..26 the suit, 27..35 the legs; patches are stamped over.

const stamp = (rows, patch, x, y) => rows.map((r, j) => {
  const p = patch[j - y];
  if (!p) return r;
  const a = [...r];
  [...p].forEach((c, i) => { if (c !== '.') a[x + i] = c; });
  return a.join('');
});
const frame = (body, legs, ...patches) => patches.reduce((rows, [p, x, y]) => stamp(rows, p, x, y), [...body, ...legs]);
const rev = s => [...s].reverse().join('');
const sym = half => half.map(h => h + rev(h)); // 16-px halves mirrored into 32-px rows
// Columns x0.. of rows y0..y1 set to str (unlike stamp, it can write '.').
const put = (rows, y0, y1, x0, str) => rows.map((r, j) => (j < y0 || j > y1 ? r : r.slice(0, x0) + str + r.slice(x0 + str.length)));

// The headlamp on the crown, rows 0..3, lens centre at (16, 2): from the front, and from behind (the housing's back).
const LAMP_FRONT = ['.kkkk.', 'kfFFfk', 'kfFFfk', '.kmmk.'];
const LAMP_BACK = ['.kkkk.', 'kmllmk', 'kmmmmk', '.kmmk.'];
const LAMP_SIDE = ['kkkkk', 'kmmFk', 'kmmfk', '.kmk.']; // in profile, the lens ahead at x 16
const LIGHT = [16, 2];

// Heads, rows 0..15 (with the neck ring).
const HEAD_DOWN = stamp(sym([
  '................',
  '................',
  '................',
  '...........kkkkk',
  '.........kkppppp',
  '........kppppppp',
  '.......kpxxxxxxx',
  '.......kpkkkkkkk',
  '......kpk:::::::',
  '......klk::k::::',
  '......kmk:::::::',
  '......kPk:::::;;',
  '.......kPk::::::',
  '.......kPPkkkkkk',
  '........kkPPPPPP',
  '..........kmllll',
]), LAMP_FRONT, 13, 0);
// From behind: the helmet's back shell, the orange band all round, no face.
const HEAD_UP = stamp(sym([
  '................',
  '................',
  '................',
  '...........kkkkk',
  '.........kkppppp',
  '........kppppppp',
  '.......kpxxxxxxx',
  '.......kpppppppp',
  '......kppppppppp',
  '......klpppppppp',
  '......kmpppppppp',
  '......kPpppppppp',
  '.......kPppppppp',
  '.......kPPPPPPPP',
  '........kkPPPPPP',
  '..........kmmmmm',
]), LAMP_BACK, 13, 0);
// S: nearly facing, a little left: the visor a pixel left, more shell on his left (frame right).
const HEAD_S = stamp([
  '................................',
  '................................',
  '................................',
  '...........kkkkkkkkkk...........',
  '.........kkppppppppppkk.........',
  '........kppppppppppppppk........',
  '.......kxxxxxxxxxxxxxxxpk.......',
  '.......kkkkkkkkkkkkkkkppk.......',
  '......kk::::::::::::kpppk.......',
  '......kk::k:::::k:::kpplk.......',
  '......kk::::::::::::kppmk.......',
  '......kk::::;;;;::::kPPPk.......',
  '.......kk::::::::::kPPPk........',
  '.......kPkkkkkkkkkkPPPk.........',
  '........kkPPPPPPPPPPkk..........',
  '..........kmllllllmk............',
], LAMP_FRONT, 13, 0);
// E: three-quarters to the viewer and right: the visor out to the right, the left ear disc in full.
const HEAD_E = stamp([
  '................................',
  '................................',
  '................................',
  '...........kkkkkkkkkk...........',
  '.........kkppppppppppkk.........',
  '........kppppppppppppppk........',
  '.......kppppxxxxxxxxxxxxk.......',
  '.......kppkkkkkkkkkkkkkkk.......',
  '......kpppk:::::::::::::k.......',
  '......kplpk:::k::::k::::k.......',
  '......kpmpk:::::::::::::k.......',
  '......kPPPk:::::;;;:::::k.......',
  '.......kPPk::::::::::::k........',
  '.......kPPPkkkkkkkkkkkk.........',
  '........kkPPPPPPPPPPkk..........',
  '............kmllllllmk..........',
], LAMP_FRONT, 13, 0);
// N: nearly away, a little right: the back shell, the right ear disc's edge on his right (frame right).
const HEAD_N = stamp([
  ...HEAD_UP.slice(0, 7),
  '.......kppppppppppppppppk.......',
  '......kppppppppppppppppppk......',
  '......kpppppppppppppppplPk......',
  '......kPpppppppppppppppmPk......',
  '......kPpppppppppppppppPPk......',
  '.......kPppppppppppppPPPk.......',
  '.......kPPPPPPPPPPPPPPPPk.......',
  '........kkPPPPPPPPPPPPkk........',
  '...........kmmmmmmmmk...........',
], LAMP_BACK, 13, 0);
// W: three-quarters away and left: the visor's rim edge on his left (frame left) and the left ear disc, the rest shell.
const HEAD_W = stamp([
  ...HEAD_UP.slice(0, 6),
  '.......kxxxxxxxxxxxxxxxxk.......',
  '.......kkpppppppppppppppk.......',
  '......kkplpppppppppppppppk......',
  '......kkpmpppppppppppppppk......',
  '......kkpppppppppppppppPPk......',
  '......kkPpppppppppppppPPPk......',
  '.......kPPppppppppppppPPk.......',
  '.......kPPPPPPPPPPPPPPPPk.......',
  '........kkPPPPPPPPPPPPkk........',
  '..........kmmmmmmmmk............',
], LAMP_BACK, 13, 0);

// The suit from the front, rows 16..26: arms at the sides with orange shoulder patches and white gloves, the belt.
const SUIT = sym([
  '.....kkkkkkkkkkk',
  '....kxxkRrrrrrrr',
  '....kxxkRrrrrrrr',
  '....kRrkRrrrrrrr',
  '....kRrkRrrrrrrr',
  '....kRrkRrrrrrrr',
  '....kRrkRrrrrrrr',
  '....kRrkMMMMMMMl',
  '....kppkRrrrrrrr',
  '....kPpkRrrrrrrd',
  '.....kkkRrrrrrrd',
]);
// The chest control unit: cyan screen, red LED, keys. At x 13 from the front (S a little left, E right).
const UNIT = ['kkkkkk', 'kccCak', 'kcCCmk', 'kkkkkk'];
// The wrist panel on his left forearm (frame right from the front, frame left from behind).
const WRIST = (rows, x) => put(rows, 5, 5, x, 'cc');
// From behind: the life-support pack (white, its seams and a vent) over the back, no unit.
const PACK = ['kkkkkkkkkkkk', 'kppppppppppk', 'kpPPPPPPPPpk', 'kpPkkkkkkPpk', 'kpPkMMMMkPpk', 'kpPkkkkkkPpk', 'kpPPPPPPPPpk', 'kkkkkkkkkkkk'];
const BACK = stamp(put(WRIST(SUIT, 5), 23, 23, 8, 'MMMMMMMMMMMMMMMM'), PACK, 10, 0);

// Facing right: the helmet in profile, the visor ahead, the lamp on the crown; the pack behind, the near arm.
const RIGHT = stamp([
  '................................',
  '................................',
  '................................',
  '..........kkkkkkkkkkk...........',
  '........kkppppppppppkk..........',
  '.......kppppppppppppppk.........',
  '.......kpppppppxxxxxxxxk........',
  '.......kppppppkkkkkkkkkk........',
  '.......kpppppk:::::::::k........',
  '.......kppkkpk:::::k:::k........',
  '.......kpklmkk:::::::::k........',
  '.......kPkmmkk::::::;;;k........',
  '.......kPPkkPk::::::::k.........',
  '........kPPPPPkkkkkkkk..........',
  '.........kkPPPPPPPPPkk..........',
  '...........kmllllllk............',
  '........kkkkkkkkkkkkkk..........',
  '......kpkRrrrrrrrrrrrdk.........',
  '......kpkRrrrrrrrrrkkkk.........',
  '......kpkRrrrrrrrrrkcck.........',
  '......kPkRrrrrrrrrrkaCk.........',
  '......kPkRrrrrrrrrrkkkk.........',
  '......kPkRrrrrrrrrrrrdk.........',
  '.......kkMMMMMMMMMMMMMk.........',
  '........kRrrrrrrrrrrrdk.........',
  '........kRrrrrrrrrrrrdk.........',
  '.........kRrrrrrrrrrdk..........',
], LAMP_SIDE, 13, 0);
// The near arm hanging from the shoulder: the orange patch, the wrist panel, the glove.
const ARM_SIDE = ['kxxk', 'kRrk', 'kRrk', 'kRrk', 'kRrk', 'kcck', 'kRrk', 'kppk', 'kPpk', '.kk.'];

// Legs, rows 27..35: front (left half; the right is its mirror), standing and lifted.
const LEG = [
  ...Array(4).fill('.......kRrrrrdk.'),
  ...Array(3).fill('......kbbbbbbBk.'),
  '......kMMMMMMMk.',
  '.......kkkkkkk..',
];
const LEG_UP = [...LEG.slice(0, 2), ...LEG.slice(4), '................', '................'];
const LEGS_FRONT = [[LEG, LEG], [LEG_UP, LEG], [LEG, LEG_UP]].map(([l, r]) => l.map((s, j) => s + rev(r[j])));
const LEGS_SIDE = [
  [
    ...Array(4).fill('.........kRrrrrrrdk.............'),
    ...Array(2).fill('.........kbbbbbbbBk.............'),
    '.........kbbbbbbbbBk............',
    '.........kMMMMMMMMMk............',
    '..........kkkkkkkkk.............',
  ],
  [
    '.........kRrrrrrrdk.............',
    '........kRrrk.kRrrk.............',
    '.......kRrrk...kRrrk............',
    '.......kbbbk....kRrrk...........',
    '......kbbbBk....kbbbk...........',
    '......kbbbBk.....kbbbBk.........',
    '.....kbbbbBk.....kbbbbBk........',
    '.....kMMMMMk.....kMMMMMMk.......',
    '......kkkkk.......kkkkkk........',
  ],
  [
    '.........kRrrrrrrdk.............',
    '.........kRrrkRrrdk.............',
    '........kRrrk.kRrrk.............',
    '........kbbbk.kRrrk.............',
    '........kbbBk..kbbbk............',
    '.......kbbbBk..kbbbBk...........',
    '......kbbbbBk..kbbbbBk..........',
    '......kMMMMMk..kMMMMMMk.........',
    '.......kkkkk....kkkkkk..........',
  ],
];

// Ring, rows 16..26: his left forearm (frame right) raised across the chest, the wrist panel lit at its end, his right
// glove (frame left) up to tap it.
const RING_SUIT = [
  '.....kkkkkkkkkkkkkkkkkkkkkk.....',
  '....kxxkRrrrrkkkkkkrrrrRkxxk....',
  '....kxxkRrrrrkccCakrrrrRkxxk....',
  '....kRrkRrrrrkcCCmkrrrrRkRrk....',
  '....kRrkkkkkkkkkkkkkkkkkkRrk....',
  '....kRrRrrppkcccRrrrrrrrrRrk....',
  '....kRrRrrPpkcCcRrrrrrrrrrRk....',
  '....kkkkkkkkkkkkkkkkkkkkkkkk....',
  '.......kMMMMMMMllMMMMMMMk.......',
  '.......kRrrrrrrddrrrrrrRk.......',
  '.......kRrrrrrrddrrrrrrRk.......',
];

export default () => {
  const front = (head, suit) => [...head, ...suit];
  const LIT = WRIST(SUIT, 25), DOWN = front(HEAD_DOWN, LIT), UP = front(HEAD_UP, BACK);
  const S = front(HEAD_S, LIT), E = front(HEAD_E, LIT);
  const N = front(HEAD_N, BACK), W = front(HEAD_W, BACK);
  const flat = {}, iso = {};
  for (const i of [0, 1, 2]) {
    flat[`down ${i}`] = frame(DOWN, LEGS_FRONT[i], [UNIT, 13, 18]);
    flat[`up ${i}`] = frame(UP, LEGS_FRONT[i]);
    flat[`right ${i}`] = frame(RIGHT, LEGS_SIDE[i], [ARM_SIDE, 12, 16]);
    iso[`E ${i}`] = frame(E, LEGS_FRONT[i], [UNIT, 15, 18]);
    iso[`W ${i}`] = frame(W, LEGS_FRONT[i]);
    iso[`S ${i}`] = frame(S, LEGS_FRONT[i], [UNIT, 12, 18]);
    iso[`N ${i}`] = frame(N, LEGS_FRONT[i]);
  }
  flat.ring = frame([...HEAD_DOWN, ...RING_SUIT], LEGS_FRONT[0]);
  iso.ring = frame([...HEAD_S, ...RING_SUIT], LEGS_FRONT[0]);
  const anchors = { feet: [16, 36], light: LIGHT };
  return { flat, iso, flatAnchors: anchors, isoAnchors: anchors };
};
