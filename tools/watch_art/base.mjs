// The Watchman of the 40k worlds: an Inquisitor on the night watch. Wide-brimmed hat with a red band, pale stern
// face, long dark coat (M, lit m, n under-shirt) edged in red (x), the Inquisitorial rosette in brass on the chest,
// a brass lantern (flame f/F) held out to the right in every facing, so the glow anchor stays put. 32x36 art px.
// Bodies are rows 0..32 (the coat's hem outline on 32), feet rows 33..35; patches are stamped over a body.

const stamp = (rows, patch, x, y) => rows.map((r, j) => {
  const p = patch[j - y];
  if (!p) return r;
  const a = [...r];
  [...p].forEach((c, i) => { if (c !== '.') a[x + i] = c; });
  return a.join('');
});
const frame = (body, feet, ...patches) => patches.reduce((rows, [p, x, y]) => stamp(rows, p, x, y), [...body, ...feet]);

// The hat, the same from the front and the back.
const HAT = [
  '...........kkkkkkkkkk...........',
  '..........kmmmmmMMMMMk..........',
  '..........kmMMMMMMMMnk..........',
  '..........kxxxxxxxxxxk..........',
  '.....kkkkkkmMMMMMMMMnkkkkkk.....',
  '...kkmmmmmmmmmmmmmmmmmmmMMMMkk..',
  '..kMMMMMMMMMMMMMMMMMMMMMMMMMnnk.',
  '...kkkkkkkknnnnnnnnnnkkkkkkkk...',
];
// The lower coat seen from the front: the skirt flares, the near hand at its side, the red hem.
const SKIRT = open => [
  `....kmkkkMMMMM${open}MMMMMMMMMk....`,
  `....kmMMMMMMMM${open}MMMMMMMMMk....`,
  `....kmMMMMMMMM${open}MMMMMMMMMk....`,
  `...kmMMMMMMMMM${open}MMMMMMMMMMk...`,
  `...kmMMMMMMMMM${open}MMMMMMMMMMk...`,
  `...kmMMMMMMMMM${open}MMMMMMMMMMk...`,
  '...kxxxxxxxxxxx' + (open === 'xnnx' ? 'nn' : 'xx') + 'xxxxxxxxxxxk...',
  '...kkkkkkkkkkkkkkkkkkkkkkkkkk...',
];
const torso = (open, belt) => [
  ...Array(6).fill(`.....kmmmkMMMM${open}MMMMkMMMk.....`),
  `.....kmmmk${belt}kMMMk.....`,
  `.....kmmmkMMMM${open}MMMMkMMMk.....`,
  `.....kxxxkMMMM${open}MMMMMMMMk.....`,
  `.....k::;kMMMM${open}MMMMMMMMk.....`,
];

// Facing the viewer.
const DOWN = [
  ...HAT,
  '...........k;;;;;;;;k...........',
  '...........k:kk::kk:k...........',
  '...........k::::::::k...........',
  '...........k:::;;:::k...........',
  '.........kxxk::kk::kxxk.........',
  '........kxxxxk;;;;kxxxxk........',
  '.....kkMMMxxxxkkkkxxxxMMMkk.....',
  ...torso('xnnx', 'nnnnkghknnnn'),
  ...SKIRT('xnnx'),
];
// From behind: the back of the head, the coat's high collar, the seam down the back.
const UP = [
  ...HAT,
  '...........knnnnnnnnk...........',
  '...........knnnnnnnnk...........',
  '...........knnnnnnnnk...........',
  '...........knnnnnnnnk...........',
  '.........kmMMMMMMMMMMMk.........',
  '........kmMMMMMMMMMMMMMMk.......',
  '.....kkmMMMMMMMMMMMMMMMMMMkk....',
  ...torso('MnnM', 'nnnnnnnnnnnn').map(r => r.replace('::;', ';;;')),
  ...SKIRT('MnnM'),
].map(r => r.length === 32 ? r : r.padEnd(32, '.').slice(0, 32));
// Facing right, the lantern held out ahead.
const RIGHT = [
  '............kkkkkkkkk...........',
  '...........kmmmmMMMMMk..........',
  '...........kmMMMMMMMnk..........',
  '...........kxxxxxxxxxk..........',
  '.......kkkkkmMMMMMMMnkkkkkk.....',
  '.....kkmmmmmmmmmmmmmmmmmmmMkk...',
  '....kMMMMMMMMMMMMMMMMMMMMMMnk...',
  '.....kkkkkkkkknnnnnnnkkkkkkk....',
  '............knnnnn;;;;k.........',
  '............knnnnn::k:k.........',
  '............knnnn::::::k........',
  '............knnnn:::;:k.........',
  '..........kxxknnn:::kkk.........',
  '.........kxxxxk;;;kxk...........',
  '........kkMMMxxxkkkxxk..........',
  ...Array(6).fill('........kmMMMMMMMMMMMxk.........'),
  '........knnnnnnnnnnngxk.........',
  ...Array(3).fill('........kmMMMMMMMMMMMxk.........'),
  ...Array(3).fill('.......kmMMMMMMMMMMMMxk.........'),
  ...Array(3).fill('......kmMMMMMMMMMMMMMMxk........'),
  '......kxxxxxxxxxxxxxxxxk........',
  '......kkkkkkkkkkkkkkkkkk........',
];

const FEET_FRONT = [
  ['.........kMMMk....kMMMk.........', '........kmMMMk....kmMMMk........', '........kkkkkk....kkkkkk........'],
  ['........kMMMk......kkkk.........', '.......kmMMMk...................', '.......kkkkkk...................'],
  ['.........kkkk......kMMMk........', '...................kmMMMk.......', '...................kkkkkk.......'],
];
const FEET_SIDE = [
  ['...........kMMk...kMMk..........', '...........kmMMMk.kmMMMk........', '...........kkkkkk.kkkkkk........'],
  ['.........kMMk.......kMMk........', '........kmMMMk......kmMMMk......', '........kkkkkk......kkkkkk......'],
  ['.............kMMMk..............', '.............kmMMMMk............', '.............kkkkkkk............'],
];

// The lantern: brass cage, flame inside; its centre is the light anchor.
const LANTERN = [
  '..kgk..',
  '.kkgkk.',
  'khgggGk',
  'khFFfGk',
  'kgFFfGk',
  'kgfffGk',
  'khgggGk',
  '.kkkkk.',
];
const LX = 25, LY = 24, LIGHT = [LX + 3, LY + 4];
// The right forearm out to the lantern's handle, from the front.
const ARM_FRONT = [
  'kMMMMk....',
  'kMMMMxkk..',
  'kMMMkx::k.',
  'kMMMkk:;k.',
];
// From the side: the arm forward from the shoulder.
const ARM_SIDE = [
  'kMMk',
  'kmMk',
  'kmMk',
  'kmMMk',
  'kmMMk',
  'kmMMMkkkkkkkkkk',
  'kmMMMMMMMMMMMxkkk',
  '.kkkkkkkkkkkkx::k',
  '.............k;;k',
];
// The rosette: brass, the I in black.
const ROSETTE = ['kgGk', 'ghkG', 'gkhG', 'kGGk'];
// Ring: the free arm raised, a brass hand bell swinging under the hand.
const BELL_ARM = [
  '.kkk.....',
  'k:::k....',
  'k:;:k....',
  'kkgkxk...',
  '.khGxMk..',
  'khggGkMk.',
  'khggGkmMk',
  'kkkkkkkmk',
  '...k..kmk',
];
const NO_ARM = ['kmMMk', 'kmMMk', 'kmMMk', 'kmMMk', 'kmMMk', 'kmMMk', 'kmMMk', 'kmMMk', 'kmMMk', 'kmMMk', 'kmMMk'];

// 39°: E turned three-quarters to the viewer and right, W three-quarters away and left, S nearly facing (a little
// left), N nearly away (a little right); each drawn, the lantern always out to the right.
const E = [
  '............kkkkkkkkkk..........',
  '...........kmmmmmMMMMMk.........',
  '...........kmMMMMMMMMnk.........',
  '...........kxxxxxxxxxxk.........',
  '......kkkkkkmMMMMMMMMnkkkkkk....',
  '....kkmmmmmmmmmmmmmmmmmmmMMMkk..',
  '...kMMMMMMMMMMMMMMMMMMMMMMMMnnk.',
  '....kkkkkkkkkknnnnnnnnnkkkkkkk..',
  '............knn;;;;;;;k.........',
  '............knn:kk::kk:k........',
  '............knn::::::::k........',
  '............knn::::;;::k........',
  '..........kxxkn:::kk::k.........',
  '.........kxxxxk;;;;;;kxxk.......',
  '......kkMMMxxxxkkkkkkxxxxMkk....',
  ...Array(6).fill('......kmmmkMMMMMMxnnxMMMMk......'),
  '......kmmmknnnnnnkghknnnnk......',
  '......kmmmkMMMMMMxnnxMMMMk......',
  '......kxxxkMMMMMMxnnxMMMMMk.....',
  '......k::;kMMMMMMxnnxMMMMMk.....',
  '.....kmkkkMMMMMMMxnnxMMMMMMk....',
  ...Array(2).fill('.....kmMMMMMMMMMMxnnxMMMMMMk....'),
  ...Array(3).fill('....kmMMMMMMMMMMMxnnxMMMMMMMk...'),
  '....kxxxxxxxxxxxxxnnxxxxxxxxk...',
  '....kkkkkkkkkkkkkkkkkkkkkkkkk...',
];
const S = [
  ...HAT,
  '..........k;;;;;;;;nk...........',
  '..........k:kk::kk:nk...........',
  '..........k::::::::nk...........',
  '..........k::;;::::nk...........',
  '........kxxk::kk::kxxk..........',
  '.......kxxxxk;;;;kxxxxk.........',
  '.....kkMMxxxxkkkkxxxxMMMMkk.....',
  ...Array(6).fill('.....kmmmkMMMxnnxMMMMMkMMMk.....'),
  '.....kmmmknnnkghknnnnnkMMMk.....',
  '.....kmmmkMMMxnnxMMMMMkMMMk.....',
  '.....kxxxkMMMxnnxMMMMMMMMMk.....',
  '.....k::;kMMMxnnxMMMMMMMMMk.....',
  '....kmkkkMMMMxnnxMMMMMMMMMMk....',
  ...Array(2).fill('....kmMMMMMMMxnnxMMMMMMMMMMk....'),
  ...Array(3).fill('...kmMMMMMMMMxnnxMMMMMMMMMMMk...'),
  '...kxxxxxxxxxxnnxxxxxxxxxxxxk...',
  '...kkkkkkkkkkkkkkkkkkkkkkkkkk...',
];
// The back's seam moved to column c (N a little right, W further left).
const seamAt = (rows, c) => rows.map(r => {
  if (r.slice(14, 18) !== 'MnnM') return r;
  const a = [...r];
  a[15] = a[16] = 'M'; a[c] = a[c + 1] = 'n';
  return a.join('');
});
const N = seamAt(UP, 17);
const W = seamAt([
  ...HAT,
  '...........k:;nnnnnnnk..........',
  '...........k:;nnnnnnnk..........',
  '...........k;nnnnnnnnk..........',
  '...........knnnnnnnnnk..........',
  ...UP.slice(12),
], 12);

export default () => {
  const front = (body, i, ...p) => frame(body, FEET_FRONT[i], [ARM_FRONT, 22, 20], [LANTERN, LX, LY], ...p);
  const flat = {}, iso = {};
  for (const i of [0, 1, 2]) {
    flat[`down ${i}`] = front(DOWN, i, [ROSETTE, 18, 16]);
    flat[`up ${i}`] = front(UP, i);
    flat[`right ${i}`] = frame(RIGHT, FEET_SIDE[i], [ARM_SIDE, 13, 15], [LANTERN, LX, LY]);
    iso[`E ${i}`] = frame(E, FEET_SIDE[i], [ARM_FRONT, 22, 20], [LANTERN, LX, LY], [ROSETTE, 21, 16]);
    iso[`W ${i}`] = front(W, i);
    iso[`S ${i}`] = front(S, i, [ROSETTE, 17, 16]);
    iso[`N ${i}`] = front(N, i);
  }
  flat.ring = front(DOWN, 0, [ROSETTE, 18, 16], [NO_ARM, 5, 15], [BELL_ARM, 0, 9]);
  iso.ring = front(S, 0, [ROSETTE, 17, 16], [NO_ARM, 5, 15], [BELL_ARM, 0, 9]);
  const anchors = { feet: [16, 36], light: LIGHT };
  return { flat, iso, flatAnchors: anchors, isoAnchors: anchors };
};
