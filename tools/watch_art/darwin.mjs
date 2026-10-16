// The Watchman of Darwin's study: the museum night keeper. A navy peaked cap (crown u, band n, brass badge g, black
// patent peak M), a weathered face (: ;) with a grey walrus moustache (l/m), a long navy greatcoat (u, shade n) with
// two rows of brass buttons (g) and a leather belt (W) with a brass buckle (h), a ring of keys (l/m) on his frame-left
// hip, dark trousers (M/m) and boots (W/w). He carries a brass hurricane lantern (g/G, glass F, flame f) at his frame
// right in every facing, so its flame (the light anchor) stays put. From behind: the cap's band, grey hair at the
// nape, the coat's back seam and vent. ring: he rings a brass hand bell (h/g/G, wooden handle w/W) raised in his
// frame-left hand. 32x36 art px: rows 0..11 the head, 12..28 the coat (hem 28), 29..35 legs and boots.

const stamp = (rows, patch, x, y) => rows.map((r, j) => {
  const p = patch[j - y];
  if (!p) return r;
  const a = [...r];
  [...p].forEach((c, i) => { if (c !== '.') a[x + i] = c; });
  return a.join('');
});
const frame = (body, legs, ...patches) => patches.reduce((rows, [p, x, y]) => stamp(rows, p, x, y), [...body, ...legs]);
const rev = s => [...s].reverse().join('');
// 16-px left halves mirrored into 32-px rows, the coat's lit side (u) turned to shade (n) along the right edge.
const sym = half => half.map(h => h + rev(h));
// Columns x0.. of rows y0..y1 set to str (unlike stamp, it can write '.').
const put = (rows, y0, y1, x0, str) => rows.map((r, j) => (j < y0 || j > y1 ? r : r.slice(0, x0) + str + r.slice(x0 + str.length)));
// Rows shifted by n columns (positive: right), blank filled.
const shift = (rows, n) => rows.map(r => (n > 0 ? '.'.repeat(n) + r.slice(0, 32 - n) : r.slice(-n) + '.'.repeat(-n)));

// Heads, rows 0..11. Front: the cap square on, the badge in the middle, the moustache across.
const HEAD_DOWN = stamp(sym([
  '...........kkkkk',
  '.........kkuuuuu',
  '........kuuuuuuu',
  '........kuuuuuuu',
  '........knnnnnnn',
  '.......kMMMMMMMM',
  '........kk::::::',
  '........k::kk:::',
  '........k:::::::',
  '........k;:lllll',
  '.........k;lm:::',
  '..........kk;;::',
]), ['gg', 'hh'], 15, 3);
// From behind: the cap's crown and band, the peak's edge, grey hair at the nape.
const HEAD_UP = sym([
  '...........kkkkk',
  '.........kkuuuuu',
  '........kuuuuuuu',
  '........kuuuuuuu',
  '........knnnnnnn',
  '........knnnnnnn',
  '........kkllllll',
  '........klllmlll',
  '........klmlllll',
  '.........kllllll',
  '..........k;;;;;',
  '..........kk;;;;',
]);
// S: nearly facing, a little left: the face and badge a column left, more cap on his left (frame right).
const HEAD_S = put(shift(HEAD_DOWN, -1), 0, 11, 30, '..');
// E: three-quarters to the viewer and right: the peak and face out to the right, the cap's back on the left.
const HEAD_E = [
  '............kkkkkkk.............',
  '..........kkuuuuuuukk...........',
  '.........kuuuuuuuuuuuk..........',
  '.........kuuuuuuuugguk..........',
  '.........knnnnnnnnhhnnk.........',
  '.........knnMMMMMMMMMMMMk.......',
  '.........kll::::::::::kk........',
  '.........klll:kk:::kk::k........',
  '.........kll::::::::::::k.......',
  '..........kl;:lllllllll:k.......',
  '...........kk;:lm:::::;k........',
  '.............kk;;;;;;kk.........',
];
// N: from behind, a little right: the band and the peak's edge (M) on his right.
const HEAD_N = put(HEAD_UP, 5, 5, 23, 'M');
// W: three-quarters away and left: the peak's edge on his left, an ear and the cheek's edge.
const HEAD_W = put(put(HEAD_UP, 5, 5, 7, 'MM'), 7, 9, 8, 'k:');

// The greatcoat from the front, rows 12..28: collar, shoulders, arms at the sides, buttons, belt, hands, the long skirt.
const COAT = sym([
  '........kkknnnnn',
  '......kkuuuuunuu',
  '.....kuuuuuuunuu',
  '....kuuukuuuunug',
  '....kuuukuuuunuu',
  '....kuuukuuuunug',
  '....kuuukuuuunuu',
  '....kuuukWWWWWWh',
  '....kuuukuuuunug',
  '....k::kkuuuunuu',
  '....k:;k.kuuunuu',
  '.....kk..kuuunuu',
  '.........kuuunuu',
  '.........kuuunuu',
  '.........kuuunuu',
  '.........knnnnuu',
  '.........kkkkkkk',
]);
// From behind: the back seam, the belt, the vent, no buttons.
const BACK = put(put(put(COAT, 0, 0, 8, 'kkknnnnnnnnnnkkk'), 1, 15, 13, 'uunnuu'), 7, 7, 9, 'WWWWWWWWWWWWWW').map((r, j) => (j > 9 && j < 16 ? r.slice(0, 15) + 'kk' + r.slice(17) : r));

// Facing right: the cap's peak and the profile out ahead, the coat in profile, the moustache.
const RIGHT = [
  '...........kkkkkkk..............',
  '.........kkuuuuuuukk............',
  '........kuuuuuuuuuuk............',
  '........kuuuuuuuuggk............',
  '........knnnnnnnnhhnk...........',
  '........knnnnnMMMMMMMMk.........',
  '........kllll::::::kkk..........',
  '........klll:::kk::::k..........',
  '........kll:::::::::::k.........',
  '.........kl;::::llllll:k........',
  '..........kk;::lm:::;k..........',
  '............kk;;;;;kk...........',
  '...........kkknnnnk.............',
  ...Array(5).fill('.........kuuuuuuuuuk............'),
  '.........kuuuuuuuuguk...........',
  '.........kWWWWWWWWWhk...........',
  ...Array(8).fill('.........kuuuuuuuunuk...........'),
  '.........kkkkkkkkkkkk...........',
];
// The near arm in profile: the sleeve down, the forearm out ahead to the lantern's bail.
const ARM_SIDE = [
  'kuuuk',
  'kuuuk',
  'kuuuk',
  'kuuuk',
  'kuuuk',
  'kuuukkkkkkkkkkkkk',
  'kuuuuuuuuuuuuu::k',
  'knnnnnnnnnnnnn:;k',
  'kkkkkkkkkkkkkkkkk',
];

// Legs, rows 29..35: front (left half; the right is its mirror), standing and lifted.
const LEG = [
  '..........kMmmMk',
  '..........kMmmMk',
  '..........kMmmMk',
  '.........kWWWWWk',
  '.........kWwwwWk',
  '.........kWWWWWk',
  '.........kkkkkkk',
];
const LEG_UP = [...LEG.slice(0, 1), ...LEG.slice(2), '................'];
const LEGS_FRONT = [[LEG, LEG], [LEG_UP, LEG], [LEG, LEG_UP]].map(([l, r]) => l.map((s, j) => s + rev(r[j])));
const LEGS_SIDE = [
  [
    '..........kMmmmmMk..............',
    '..........kMmmmmMk..............',
    '..........kMmmmmMk..............',
    '..........kWWWWWWWWk............',
    '..........kWwwwwwwWk............',
    '..........kWWWWWWWWk............',
    '..........kkkkkkkkkk............',
  ],
  [
    '.........kMmmkMmmMk.............',
    '........kMmmk..kMmmk............',
    '.......kMmmk....kMmmk...........',
    '......kWWWWWk...kWWWWWWk........',
    '......kWwwwWk...kWwwwwWk........',
    '......kWWWWWk...kWWWWWWk........',
    '......kkkkkkk...kkkkkkkk........',
  ],
  [
    '.........kMmmMmmMk..............',
    '.........kMmmkMmmk..............',
    '........kMmmk.kMmmk.............',
    '.......kWWWWWkkWWWWWWk..........',
    '.......kWwwwWk.kWwwwwWk.........',
    '.......kWWWWWk.kWWWWWWk.........',
    '.......kkkkkkk.kkkkkkkk.........',
  ],
];

// The hurricane lantern: its bail, the brass cap, the glass round the flame, the brass foot; the flame is the light.
const LANTERN = [
  '..kk..',
  '.k..k.',
  '.kkkk.',
  'kGggGk',
  'kgFFgk',
  'kgFfgk',
  'kgFFgk',
  'kGggGk',
  '.kkkk.',
];
const LX = 24, LY = 23, LIGHT = [LX + 3, LY + 5];
// The ring of keys on his belt.
const KEYS = ['.kk.', 'klmk', '.kk.', '.lm.', '.l..'];
// Ring: his frame-left arm cleared, then the forearm raised from the elbow, a brass hand bell swinging over his shoulder.
const noArm = rows => put(put(rows, 15, 22, 4, '....'), 23, 23, 5, '..');
const RAISE = [
  '..kkk....',
  '.kWwWk...',
  '..kwk....',
  '.khgGk...',
  'khhggGk..',
  'khgggGk..',
  'kkkkkkk..',
  '...kGk...',
  '..k::k...',
  '..k:;k...',
  '..kuuk...',
  '..kuuk...',
  '.kuuuk...',
  '.kuuuk...',
];

export default () => {
  const front = (head, coat) => [...head, ...coat];
  const DOWN = front(HEAD_DOWN, COAT), UP = front(HEAD_UP, BACK);
  const S = front(HEAD_S, COAT), E = front(HEAD_E, COAT.map(r => '.' + r.slice(0, 31)));
  const N = front(HEAD_N, BACK), W = front(HEAD_W, BACK);
  const lantern = [LANTERN, LX, LY], keys = [KEYS, 7, 20];
  const flat = {}, iso = {};
  for (const i of [0, 1, 2]) {
    flat[`down ${i}`] = frame(DOWN, LEGS_FRONT[i], keys, lantern);
    flat[`up ${i}`] = frame(UP, LEGS_FRONT[i], keys, lantern);
    flat[`right ${i}`] = frame(RIGHT, LEGS_SIDE[i], [ARM_SIDE, 11, 14], lantern);
    iso[`E ${i}`] = frame(E, LEGS_FRONT[i], [KEYS, 8, 20], lantern);
    iso[`W ${i}`] = frame(W, LEGS_FRONT[i], keys, lantern);
    iso[`S ${i}`] = frame(S, LEGS_FRONT[i], keys, lantern);
    iso[`N ${i}`] = frame(N, LEGS_FRONT[i], keys, lantern);
  }
  const ring = body => frame(noArm(body), LEGS_FRONT[0], [RAISE, 1, 2], lantern);
  flat.ring = ring(DOWN);
  iso.ring = ring(S);
  const anchors = { feet: [16, 36], light: LIGHT };
  return { flat, iso, flatAnchors: anchors, isoAnchors: anchors };
};
