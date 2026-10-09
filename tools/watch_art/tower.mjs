// The Watchman of the Arcane Tower: a cloaked lookout. A deep brown hood and cloak (w, lit L, shade W) with a gold
// clasp (g), the face in the hood's shadow (e); the cloak opens below the waist on a blue tunic (u) and a belt (W)
// with a brass hourglass hung from it (gold g, glass glint O, sand p/s); dark boots (M). He walks with a tall staff
// on his left (frame right) topped by a hooded lantern (gold cap, flame f/F): its centre (28, 6) is the light anchor
// and stays put in every frame, ring included. From behind: the back of the hood with its seam, no face. ring: he
// holds the hourglass up in his other hand. 32x36 art px: rows 0..13 the hood, 14..31 the cloak (hem 31), 32..35 boots.

const stamp = (rows, patch, x, y) => rows.map((r, j) => {
  const p = patch[j - y];
  if (!p) return r;
  const a = [...r];
  [...p].forEach((c, i) => { if (c !== '.') a[x + i] = c; });
  return a.join('');
});
const frame = (body, legs, ...patches) => patches.reduce((rows, [p, x, y]) => stamp(rows, p, x, y), [...body, ...legs]);
const rev = s => [...s].reverse().join('');
// 16-px left halves mirrored into 32-px rows, the lit edge (L) turned to shade (W) on the right.
const sym = half => half.map(h => h + rev(h).replace(/L/g, 'W'));
const pad = (n, rows) => rows.map(r => '.'.repeat(n) + r + '.'.repeat(32 - n - r.length));

// The staff and its hooded lantern, x 25..31, rows 0..35: lantern glass centred on (28, 6), the staff down to the floor.
const STAFF = [
  '..kkk..',
  '.kgggk.',
  'kgGGGgk',
  'kkkkkkk',
  '.kfFfk.',
  '.kFFFk.',
  '.kFFFk.',
  '.kFFFk.',
  '.kfFfk.',
  '.kgggk.',
  '..kGk..',
  ...Array(24).fill('..kGk..'),
  '..kkk..',
];
const LIGHT = [28, 6];
// The hand on the staff, out of the cloak's edge (front and back), and the sleeve reaching forward in profile.
const GRIP = ['wwkkkkk', 'wwk:::k', 'wWk:;;k', 'wWWkkkk'];
const GRIP_SIDE = ['wkkkkkkkkkk', 'wLwwwwwk::k', 'wwwwWWWk:;k', 'wkkkkkkkkkk'];
// The hourglass on the belt: gold ends, glass glints, sand running down.
// From the front it hangs in the cloak's opening, whose edges are its outline; in profile it has its own.
const GLASS = ['gggg', 'OppO', 'kppk', 'OssO', 'gggg', 'kkkk'];
const GLASS_SIDE = ['kkkk', 'kggk', 'kOpk', '.kk.', 'kssk', 'kggk', 'kkkk'];

// Hoods, rows 0..13. From the front: the face in the hood's shadow, eyes and mouth.
const HOOD_TOP = [
  '................................',
  '................................',
  '..............kkkk..............',
  '............kkLwwWkk............',
  '...........kLLwwwwWWk...........',
  '..........kLwwwwwwwWWk..........',
];
const HEAD_DOWN = [
  ...HOOD_TOP,
  ...pad(9, ['kLwwkkkkkkwwWk', 'kLwkeeeeeekwWk']),
  ...pad(8, ['kLwwke::::ekwWWk', 'kLwwkek::kekwWWk', 'kLwwke::::ekwWWk', 'kLwwk::;;::kwWWk', '.kwwWk::::kWWWk.', '..kwWWkkkkWWWk..']),
];
// S: nearly facing, a little left: the face a pixel left, more hood on his left (frame right).
const HEAD_S = [
  ...HOOD_TOP,
  ...pad(9, ['kLwkkkkkkwwwWk', 'kLkeeeeeekwwWk']),
  ...pad(8, ['kLwke::::ekwwWWk', 'kLwkek::kekwwWWk', 'kLwke::::ekwwWWk', 'kLwk::;;::kwwWWk', '.kwWk::::kWWWWk.', '..kwWkkkkWWWWk..']),
];
// E: three-quarters to the viewer and right: the face out to the right edge of the hood.
const HEAD_E = [
  ...HOOD_TOP,
  ...pad(9, ['kLwwwwkkkkkkWk', 'kLwwwkeeeeeekk']),
  ...pad(8, ['kLwwwwke:::::ekk', 'kLwwwwkek::k:ekk', 'kLwwwwke:::::ekk', 'kwwwwwk:::;;:kWk', '.kwwwWk:::::kWk.', '..kwWWWkkkkkkk..']),
];
// From behind: the back of the hood, a seam down its middle, no face.
const HEAD_UP = [
  ...HOOD_TOP,
  ...pad(9, ['kLwwwwwwwwwWWk', 'kLwwwwwwwwwWWk']),
  ...pad(8, Array(4).fill('kLwwwwwwWwwwwWWk')),
  ...pad(8, ['.kwwwwwwWwwwWWk.', '..kWWWWWWWWWWk..']),
];
// N: nearly away, a little right: the seam a pixel right.
const HEAD_N = [
  ...HEAD_UP.slice(0, 8),
  ...pad(8, Array(4).fill('kLwwwwwwwWwwwWWk')),
  ...pad(8, ['.kwwwwwwwWwwWWk.', '..kWWWWWWWWWWk..']),
];
// W: three-quarters away and left: the hood's front rim a dark slit on his right (frame left), the seam left.
const HEAD_W = [
  ...HOOD_TOP,
  ...pad(9, ['kewwwwwwwwwWWk', 'keLwwwwwwwwWWk']),
  ...pad(8, Array(4).fill('keLwwwwWwwwwwWWk')),
  ...pad(8, ['.kewwwwWwwwWWWk.', '..kWWWWWWWWWWk..']),
];

// The cloak from the front, rows 14..31: the gold clasp, a fold down the middle, open below the waist on the tunic
// and the belt.
const CLOAK = sym([
  '........kLwwwwkg',
  ...Array(3).fill('.......kLwwwwwwW'),
  ...Array(2).fill('......kLwwwwwwwW'),
  '......kLwwwwwwkk',
  '......kLwwwwwkuu',
  '......kLwwwwwkWW',
  '......kLwwwwwkuu',
  ...Array(6).fill('.....kLwwwwwwkuu'),
  '.....kWWWWWWWkuu',
  '.....kkkkkkkkkkk',
]);
// From behind: closed, the hood's seam running on down the back.
const CLOAK_BACK = sym([
  '........kLwwwwww',
  ...Array(3).fill('.......kLwwwwwwW'),
  ...Array(6).fill('......kLwwwwwwwW'),
  ...Array(6).fill('.....kLwwwwwwwwW'),
  '.....kWWWWWWWWWW',
  '.....kkkkkkkkkkk',
]);

// Facing right: the hood in profile, the face at its mouth, the cloak, the staff held out ahead.
const RIGHT = [
  ...HOOD_TOP.slice(0, 2),
  '..............kkk...............',
  '............kkLwwkk.............',
  '...........kLwwwwwwk............',
  '..........kLwwwwwwwwk...........',
  '..........kLwwwwwwkkk...........',
  '.........kLwwwwwwkeeek..........',
  '.........kLwwwwwwke:::k.........',
  '.........kLwwwwwwke:k::k........',
  '.........kLwwwwwwke::::k........',
  '.........kwwwwwwwkk:;;k.........',
  '.........kwwwwwwwWk::k..........',
  '..........kwwwwwWWkkk...........',
  '.........kLwwwwwwWWk............',
  '........kLwwwwwwwwwWk...........',
  ...Array(6).fill('........kLwwwwwwwwwwk...........'),
  '........kLwwwwwwwwwkk...........',
  '........kLwwwwwwwwkuk...........',
  ...Array(6).fill('.......kLwwwwwwwwwkuk...........'),
  '.......kWWWWWWWWWWkuk...........',
  '.......kkkkkkkkkkkkkk...........',
];

// Boots, rows 32..35: front (left half; the right is its mirror), standing and lifted; in profile, three steps.
const LEG = ['..........kMMk..', '..........kMMk..', '.........kMMMk..', '.........kkkkk..'];
const LEG_UP = [LEG[0], LEG[2], LEG[3], '................'];
const LEGS_FRONT = [[LEG, LEG], [LEG_UP, LEG], [LEG, LEG_UP]].map(([l, r]) => l.map((s, j) => s + rev(r[j])));
const LEGS_SIDE = [
  ['...........kMMMk................', '...........kMMMk................', '...........kMMMMk...............', '...........kkkkkk...............'],
  ['..........kMMk.kMMk.............', '.........kMMk...kMMk............', '.........kMMMk..kMMMk...........', '.........kkkkk..kkkkk...........'],
  ['...........kMMkMMk..............', '..........kMMk.kMMk.............', '..........kMMMkkMMMk............', '..........kkkkkkkkkk............'],
];

// Ring: his right arm (frame left) raised out of the cloak, the hourglass held up in his hand beside the hood.
const RAISE = [
  '.kkkkk...',
  '.kgggk...',
  '.kOpOk...',
  '..kpk....',
  '.ksssk...',
  '.kgggk...',
  '.kkkkk...',
  'k:::k....',
  'k:;;kk...',
  '.kwwwwk..',
  '..kLwwwk.',
  '...kLwwwk',
];

export default () => {
  const DOWN = [...HEAD_DOWN, ...CLOAK], UP = [...HEAD_UP, ...CLOAK_BACK];
  const S = [...HEAD_S, ...CLOAK], E = [...HEAD_E, ...CLOAK];
  const N = [...HEAD_N, ...CLOAK_BACK], W = [...HEAD_W, ...CLOAK_BACK];
  const staff = [STAFF, 25, 0], grip = [GRIP, 23, 16], glass = [GLASS, 14, 23];
  const flat = {}, iso = {};
  for (const i of [0, 1, 2]) {
    flat[`down ${i}`] = frame(DOWN, LEGS_FRONT[i], staff, grip, glass);
    flat[`up ${i}`] = frame(UP, LEGS_FRONT[i], staff, grip);
    flat[`right ${i}`] = frame(RIGHT, LEGS_SIDE[i], staff, [GRIP_SIDE, 19, 16], [GLASS_SIDE, 18, 23]);
    iso[`E ${i}`] = frame(E, LEGS_FRONT[i], staff, grip, glass);
    iso[`W ${i}`] = frame(W, LEGS_FRONT[i], staff, grip);
    iso[`S ${i}`] = frame(S, LEGS_FRONT[i], staff, grip, glass);
    iso[`N ${i}`] = frame(N, LEGS_FRONT[i], staff, grip);
  }
  flat.ring = frame(DOWN, LEGS_FRONT[0], staff, grip, [RAISE, 1, 7]);
  iso.ring = frame(S, LEGS_FRONT[0], staff, grip, [RAISE, 1, 7]);
  const anchors = { feet: [16, 36], light: LIGHT };
  return { flat, iso, flatAnchors: anchors, isoAnchors: anchors };
};
