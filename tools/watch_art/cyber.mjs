// The Watchman of Neon Grid: a night security guard. Peaked cap (u) with a chrome badge (g/h), a short uniform jacket
// (u, shade M) with a reflective band (c) and a zip (n), a walkie-talkie (red LED a) clipped on the chest, dark
// trousers (M) and boots (n), a flashlight (iron body, chrome head, lens F/f) held out to the right in every facing,
// so the light anchor stays put. Ring: he talks into the walkie-talkie, hand raised to the mouth. 32x36 art px.
// Bodies are rows 0..26 (head, jacket, hips), legs rows 27..35 (they carry the walk); patches are stamped over.

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

// Heads, rows 0..11.
const BADGE = [['hg', 'gG']];
const HEAD_DOWN = stamp(sym([
  '...........kkkkk',
  '..........kuuuuu',
  '..........kuuuuu',
  '..........kuuuuu',
  '.........knnnnnn',
  '...........k;;;;',
  '...........k:kk:',
  '...........k::::',
  '...........k:::;',
  '...........k::;k',
  '............k;::',
  '.............k;;',
]), BADGE[0], 15, 2);
const HEAD_UP = sym([
  '...........kkkkk',
  '..........kuuuuu',
  '..........kuuuuu',
  '..........kuuuuu',
  '..........kMMMMM',
  '...........knnnn',
  '...........knnnn',
  '...........knnnn',
  '...........knnnn',
  '...........k;nnn',
  '............k;::',
  '.............k;;',
]);
// S: nearly facing, a little left (the hair shows on his left, the eyes close up).
const HEAD_S = [
  '...........kkkkkkkkkk...........',
  '..........kuuuuuuuuuuk..........',
  '..........kuuuhguuuuuk..........',
  '..........kuuugGuuuuuk..........',
  '.........knnnnnnnnnnnnk.........',
  '...........k;;;;;;;nk...........',
  '...........k:kk:kk:nk...........',
  '...........k:::::::nk...........',
  '...........k::;;:::nk...........',
  '...........k:;kk;::nk...........',
  '............k;:::;nk............',
  '.............k;;;k..............',
];
// E: three-quarters to the viewer and right, the visor out to the right, the near eye wide.
const HEAD_E = [
  '............kkkkkkkkkk..........',
  '...........kuuuuuuuuuuk.........',
  '...........kuuuuuuhguuk.........',
  '...........kuuuuuugGuuk.........',
  '...........knnnnnnnnnnnnk.......',
  '...........knn;;;;;;;;k.........',
  '...........knn:k::kk::k.........',
  '...........knn::::::::k.........',
  '...........knn::::::;:k.........',
  '...........knn:::kk::k..........',
  '............kn;::::;k...........',
  '..............k;;;;k............',
];
// N: nearly away, a little right (one ear, the nape off centre).
const HEAD_N = [
  ...HEAD_UP.slice(0, 9),
  '...........knnnnnnn;k...........',
  '.............k;:::;k............',
  '..............k;;;k.............',
];
// W: three-quarters away and left: the visor's tip and a cheek on his left.
const HEAD_W = [
  ...HEAD_UP.slice(0, 4),
  '........knnMMMMMMMMMk...........',
  '...........k:;nnnnnnk...........',
  '...........k:;nnnnnnk...........',
  '...........k;nnnnnnnk...........',
  '...........knnnnnnnnk...........',
  '...........k;nnnnnnnk...........',
  ...HEAD_UP.slice(10),
];

// The jacket from the front, rows 12..26: arms at the sides, the reflective band, the belt and buckle, the hips.
const JACKET = sym([
  '........kkkuuukn',
  '......kkuuuuuuun',
  '.....kuuuuuuuuun',
  '.....kuMkuuuuuun',
  '.....kuMkuuuuuun',
  '.....kcckccccccc',
  '.....kuMkuuuuuun',
  '.....kuMkuuuuuun',
  '.....kuMkuuuuuun',
  '.....kuMknnnnnng',
  '.....k:;kMMMMMMM',
  '......kkkMMMMMMM',
  '........kMMMMMMM',
  '........kMMMMMMk',
  '........kMMMMMk.',
]);
// The zip moved to column c (S a little left, E right), or gone (from behind: c = null).
const zipAt = (rows, c) => rows.map((r, j) => {
  if (j < 1 || j > 8 || j === 5) return r;
  const a = [...r];
  a[15] = a[16] = 'u';
  if (c !== null) a[c] = a[c + 1] = 'n';
  return a.join('');
});
const BACK = zipAt(JACKET, null).map((r, j) => (j === 0 ? put([r], 0, 0, 14, 'kuuk')[0] : r));

// Facing right: the profile, the visor out ahead, the badge on the cap's front.
const RIGHT = [
  '...........kkkkkkkk.............',
  '..........kuuuuuuuuk............',
  '..........kuuuuuuhgk............',
  '..........kuuuuuuGgk............',
  '..........knnnnnnnnnnkk.........',
  '..........knnn;;;;;;;k..........',
  '..........knnn::::k::k..........',
  '..........knn:::::::::k.........',
  '..........knn::::::;k...........',
  '..........knn:::::k:k...........',
  '...........kn;::::k.............',
  '............k;;;;k..............',
  '.........kuuuuuuuuuk............',
  '........kuuuuuuuuuuuk...........',
  ...Array(3).fill('........kuuuuuuuuuuuk...........'),
  '........kccccccccccck...........',
  ...Array(3).fill('........kuuuuuuuuuuuk...........'),
  '........knnnnnnnnnnnk...........',
  ...Array(5).fill('........kMMMMMMMMMMMk...........'),
];
// The near arm from the shoulder, the forearm out ahead to the flashlight's handle.
const ARM_SIDE = [
  'kuuk',
  'kuMk',
  'kuMk',
  'kcck',
  'kuMk',
  'kuMkkkkkkkkk',
  'kuMuuuuuuuuukkkk',
  'kuMMMMMMMMMMk::k',
  'kkkkkkkkkkkkk:;k',
  '............kkkk',
];

// Legs, rows 27..35: front (left half of the frame; the right is its mirror), standing and lifted.
const LEG = [
  ...Array(6).fill('........kmMMMMk.'),
  '........klnnnnk.',
  '.......knnnnnnk.',
  '.......kkkkkkkk.',
];
const LEG_UP = [...LEG.slice(0, 4), ...LEG.slice(6), '................', '................'];
const LEGS_FRONT = [[LEG, LEG], [LEG_UP, LEG], [LEG, LEG_UP]].map(([l, r]) => l.map((s, j) => s + rev(r[j])));
const LEGS_SIDE = [
  [
    '.........kMMMMMMMk..............',
    ...Array(5).fill('.........kmMMMMMMk..............'),
    '.........knnnnnnnnk.............',
    '.........knnnnnnnnnk............',
    '.........kkkkkkkkkkk............',
  ],
  [
    '.........kMMMMMMMk..............',
    '........kMMMk.kMMMk.............',
    '.......kMMMk...kMMMk............',
    '.......kMMMk....kMMMk...........',
    '......kMMMk.....kMMMk...........',
    '......kMMMk......kMMMk..........',
    '.....knnnk.......knnnnk.........',
    '.....knnnnk......knnnnnk........',
    '.....kkkkkk......kkkkkkk........',
  ],
  [
    '.........kMMMMMMMk..............',
    '.........kMMMkMMMk..............',
    '........kMMMk.kMMMk.............',
    '........kMMMk.kMMMk.............',
    '........kMMMk..kMMMk............',
    '.......kMMMk...kMMMk............',
    '......knnnk....knnnnk...........',
    '......knnnnk...knnnnnk..........',
    '......kkkkkk...kkkkkkk..........',
  ],
];

// The flashlight: handle out from the hand, chrome head, lens; the lens centre is the light anchor.
const TORCH = [
  '..kkkk',
  'kkkgFk',
  'lmmgFk',
  'kkkgfk',
  '..kkkk',
];
const LX = 26, LY = 20, LIGHT = [LX + 4, LY + 2];
// The walkie-talkie: antenna, red LED, grille.
const WALKIE = ['k..', 'k..', 'kkk', 'kak', 'klk', 'knk', 'kkk'];
// Ring: his left arm (frame left) cleared, then raised, the walkie-talkie at his mouth.
const noArm = rows => put(put(rows, 15, 22, 5, '...'), 23, 23, 6, '..');
const TALK = [
  '......k..',
  '......k..',
  '......kkk',
  '......kak',
  '......klk',
  '...kkkknk',
  '..k:::;nk',
  '..k:;;kkk',
  '..kuuk...',
  '..kuMk...',
  '.kuuMk...',
  'kuuuMk...',
  'kuuuuk...',
  '.kkkk....',
];

export default () => {
  const front = (head, jacket) => [...head, ...jacket];
  const DOWN = front(HEAD_DOWN, JACKET), UP = front(HEAD_UP, BACK);
  const S = front(HEAD_S, zipAt(JACKET, 14)), E = front(HEAD_E, zipAt(JACKET, 17));
  const N = front(HEAD_N, BACK), W = front(HEAD_W, BACK);
  const torch = [TORCH, LX, LY];
  const flat = {}, iso = {};
  for (const i of [0, 1, 2]) {
    flat[`down ${i}`] = frame(DOWN, LEGS_FRONT[i], [WALKIE, 10, 12], torch);
    flat[`up ${i}`] = frame(UP, LEGS_FRONT[i], torch);
    flat[`right ${i}`] = frame(RIGHT, LEGS_SIDE[i], [WALKIE, 19, 12], [ARM_SIDE, 11, 14], torch);
    iso[`E ${i}`] = frame(E, LEGS_FRONT[i], [WALKIE, 11, 12], torch);
    iso[`W ${i}`] = frame(W, LEGS_FRONT[i], torch);
    iso[`S ${i}`] = frame(S, LEGS_FRONT[i], [WALKIE, 10, 12], torch);
    iso[`N ${i}`] = frame(N, LEGS_FRONT[i], torch);
  }
  flat.ring = frame(noArm(DOWN), LEGS_FRONT[0], [TALK, 2, 3], torch);
  iso.ring = frame(noArm(S), LEGS_FRONT[0], [TALK, 2, 3], torch);
  const anchors = { feet: [16, 36], light: LIGHT };
  return { flat, iso, flatAnchors: anchors, isoAnchors: anchors };
};
