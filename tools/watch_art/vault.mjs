// The Watchman of Vault 111: a Vault-Tec security officer. A blue riot helmet (r, lit R, shade d) with a Vault-Tec
// yellow stripe over the crown (g), a light grey visor (l, glint b) in a steel rim (M) and a steel neck guard (m/M) at
// the back; the blue jumpsuit (r/R/d) with a yellow collar and front stripe (g/T), steel shoulder pads (m/l), a belt (M)
// with a yellow buckle, steel gloves (m/M) and boots (M/m), a big yellow 111 on his back, a steel baton (l/m/M) hung at
// his frame-left hip, a Maglite (steel handle, head l, lens F/f) held out at his frame right in every facing, so the
// light anchor stays put. Ring: he blows a whistle (l/b), the frame-left hand raised to his mouth. 32x36 art px.
// Bodies are rows 0..26 (helmet 0..11, jumpsuit 12..26), legs rows 27..35 (they carry the walk); patches stamped over.

const stamp = (rows, patch, x, y) => rows.map((r, j) => {
  const p = patch[j - y];
  if (!p) return r;
  const a = [...r];
  [...p].forEach((c, i) => { if (c !== '.') a[x + i] = c; });
  return a.join('');
});
const frame = (body, legs, ...patches) => patches.reduce((rows, [p, x, y]) => stamp(rows, p, x, y), [...body, ...legs]);
const rev = s => [...s].reverse().join('');
// 16-px left halves mirrored into 32-px rows, the lit blue (R) turned to shade (d) on the right.
const sym = half => half.map(h => h + rev(h).replace(/R/g, 'd'));
// Columns x0.. of rows y0..y1 set to str (unlike stamp, it can write '.').
const put = (rows, y0, y1, x0, str) => rows.map((r, j) => (j < y0 || j > y1 ? r : r.slice(0, x0) + str + r.slice(x0 + str.length)));

// Helmets, rows 0..11. Front: visor down over the eyes, mouth and chin bare under it, cheek guards (d).
const HEAD_DOWN = stamp(sym([
  '..........kkkkkk',
  '........kkRRrrrg',
  '.......kRRrrrrrg',
  '......kRrrrrrrrg',
  '......kRrrrrrrrg',
  '......kdMMMMMMMM',
  '......kdMlllllll',
  '......kdMlllllll',
  '......kdMMMMMMMM',
  '......kdk:::::::',
  '......kdk:::::;;',
  '.......kdk;:::::',
]), ['bb', 'b.'], 10, 6);
// From behind: the shell all blue, the stripe down to the neck guard (m), no visor, no skin.
const HEAD_UP = sym([
  '..........kkkkkk',
  '........kkRRrrrg',
  '.......kRRrrrrrg',
  '......kRrrrrrrrg',
  '......kRrrrrrrrg',
  '......kRrrrrrrrg',
  '......kdrrrrrrrg',
  '......kdrrrrrrrg',
  '......kddrrrrrrg',
  '......kMMMMMMMMM',
  '......kMmmmmmmmm',
  '.......kMMmmmmmm',
]);
// The stripe moved to columns c, c+1 on rows y0..y1 (the crown turning with the head).
const stripeAt = (rows, c, y0, y1) => rows.map((r, j) => {
  if (j < y0 || j > y1) return r;
  const a = [...r];
  a[15] = a[16] = 'r';
  a[c] = a[c + 1] = 'g';
  return a.join('');
});
// S: nearly facing, a little left: the visor and face a column left, more cheek guard on his left (frame right).
const HEAD_S = stamp(stripeAt([
  ...HEAD_DOWN.slice(0, 5),
  '......kMMMMMMMMMMMMMMMMddk......',
  '......kMllllllllllllllMddk......',
  '......kMllllllllllllllMddk......',
  '......kMMMMMMMMMMMMMMMMddk......',
  '......kk::::::::::::::kddk......',
  '......kk:::::;;;;:::::kddk......',
  '.......k;::::::::::;kddk........',
], 14, 1, 4), ['bb', 'b.'], 9, 6);
// E: three-quarters to the viewer and right: the visor out to the right, the neck guard showing behind on the left.
const HEAD_E = stamp([
  '...........kkkkkkkkkkkk.........',
  '.........kkRRRrrrrggrrrkk.......',
  '........kRRrrrrrrrggrrrrk.......',
  '.......kRrrrrrrrrrggrrrrrk......',
  '.......kRrrrrrrrrrggrrrrrk......',
  '.......kRrrrrrMMMMMMMMMMMMk.....',
  '.......kdrrrrrrMllllllllllk.....',
  '.......kdrrrrrrMllllllllllk.....',
  '.......kddrrrrrMMMMMMMMMMMk.....',
  '.......kMMddrrk::::::::::k......',
  '........kMMddk:::::;;;::k.......',
  '.........kMMMk;::::::;k.........',
], ['bb', 'b.'], 17, 6);
// N: nearly away, a little right: the stripe off centre to the left, the visor rim's edge (M) on his right.
const HEAD_N = put(stripeAt(HEAD_UP, 14, 1, 8), 5, 8, 24, 'M');
// W: three-quarters away and left: the stripe off to the right, the visor rim's side (M) on his left.
const HEAD_W = put(stripeAt(HEAD_UP, 17, 1, 8), 5, 8, 7, 'MM');

// The jumpsuit from the front, rows 12..26: shoulder pads, arms at the sides, the stripe, belt and buckle, gloves.
const SUIT = sym([
  '.....kkkkkkkTggg',
  '....kmllmkRrrrrg',
  '....kMmmMkRrrrrg',
  '.....kkkkRrrrrrg',
  '.....kRrkRrrrrrg',
  '.....kRrkRrrrrrg',
  '.....kRrkRrrrrrg',
  '.....kRrkRrrrrrg',
  '.....kRrkRrrrrrg',
  '.....kRrkMMMMMMg',
  '.....kmMkRrrrrrr',
  '......kkkRrrrrrr',
  '........kRrrrrrr',
  '........kRrrrrrr',
  '........kRrrrrkk',
]);
// The stripe moved to column c (S a little left, E right), or gone (from behind: c = null).
const zipAt = (rows, c) => rows.map((r, j) => {
  if (j < 1 || j > 8) return r;
  const a = [...r];
  a[15] = a[16] = 'r';
  if (c !== null) a[c] = a[c + 1] = 'g';
  return a.join('');
});
// From behind: the vault's number, 111, in Vault-Tec yellow (stamped at x, 15).
const NUMBER = [
  'gg..gg..gg.',
  '.g...g...g.',
  '.g...g...g.',
  '.g...g...g.',
  'ggg.ggg.ggg',
];
const BACK = zipAt(SUIT, null);

// Facing right: the profile, the visor out ahead, the stripe along the crown, the buckle at the front.
const RIGHT = [
  '...........kkkkkkkk.............',
  '.........kkggggggggk............',
  '........kRrrrrrrrrrrk...........',
  '........kRrrrrrrrrrrrk..........',
  '........kRrrrrrrrrrrrk..........',
  '........kRrrrrrrMMMMMMk.........',
  '........kdrrrrrrMlblllk.........',
  '........kdrrrrrrMlllllk.........',
  '........kddrrrrrMMMMMMk.........',
  '........kMMdrrrk:::::k..........',
  '.........kMMddrk::;;k...........',
  '..........kMMMMk:::k............',
  '.........kkkgggggk..............',
  ...Array(8).fill('........kRrrrrrrrrrk............'),
  '........kMMMMMMMMMgk............',
  ...Array(5).fill('........kRrrrrrrrrrk............'),
];
// The near arm: shoulder pad, the arm down, the forearm out ahead to the Maglite's grip.
const ARM_SIDE = [
  'kmllmk',
  'kMmmMk',
  'kkRrkk',
  '.kRrk',
  '.kRrk',
  '.kRrk',
  '.kRrk',
  '.kRrkkkkkkkkkk',
  '.kRrrrrrrrrrrrk',
  '.kddddddddddddk',
  '.kkkkkkkkkkkkk',
];

// Legs, rows 27..35: front (left half of the frame; the right is its mirror), standing and lifted.
const LEG = [
  ...Array(4).fill('........kRrrrdk.'),
  '........kMMMMMk.',
  '........kmmmmMk.',
  '.......kmmmmmMk.',
  '.......kMMMMMMk.',
  '.......kkkkkkkk.',
];
const LEG_UP = [...LEG.slice(0, 2), ...LEG.slice(4), '................', '................'];
const LEGS_FRONT = [[LEG, LEG], [LEG_UP, LEG], [LEG, LEG_UP]].map(([l, r]) => l.map((s, j) => s + rev(r[j]).replace(/R/g, 'd')));
const LEGS_SIDE = [
  [
    ...Array(4).fill('.........kRrrrrrdk..............'),
    '.........kMMMMMMMk..............',
    '.........kmmmmmmMk..............',
    '.........kmmmmmmmMMk............',
    '.........kmmmmmmmmMk............',
    '.........kkkkkkkkkkk............',
  ],
  [
    '.........kRrrrrrdk..............',
    '........kRrrdkRrrdk.............',
    '.......kRrrdk..kRrrdk...........',
    '......kRrrdk....kRrrdk..........',
    '......kRrrdk.....kRrrdk.........',
    '.....kMMMMk......kMMMMk.........',
    '.....kmmmMk......kmmmmMk........',
    '.....kmmmmMk.....kmmmmmMk.......',
    '.....kkkkkkk.....kkkkkkkk.......',
  ],
  [
    '.........kRrrrrrdk..............',
    '.........kRrrdRrrdk.............',
    '........kRrrdkRrrdk.............',
    '........kRrrdk.kRrrdk...........',
    '.......kRrrdk..kRrrdk...........',
    '.......kMMMMk...kMMMMk..........',
    '......kmmmMk....kmmmmMk.........',
    '......kmmmmMk...kmmmmmMk........',
    '......kkkkkkk...kkkkkkkk........',
  ],
];

// The Maglite: the glove (m) on the steel handle (M), the flared head (l), the lens; the lens centre is the light anchor.
const TORCH = [
  '....kkk.',
  'kkkkklFk',
  'mmMMMlFk',
  'kkkkklfk',
  '....kkk.',
];
const LX = 24, LY = 20, LIGHT = [LX + 6, LY + 2];
// The baton in its yellow belt loop.
const BATON = ['kgk', 'klk', 'kmk', 'kmk', 'kMk', 'kMk', 'kkk'];
// Ring: his frame-left arm cleared, then raised, elbow out, the glove at his mouth with the whistle.
const noArm = rows => put(put(rows, 16, 22, 5, '...'), 23, 23, 6, '..');
const RAISE = [
  '..........',
  '.....kmmmk',
  '.....kmMMk',
  '....kRrkk.',
  '...kRrk...',
  '..kRrk....',
  '.kRrk.....',
  'kRrk......',
  'kRrk......',
  'kkkk......',
];
const WHISTLE = ['kbllk', '.kkkk'];

export default () => {
  const front = (head, suit) => [...head, ...suit];
  const DOWN = front(HEAD_DOWN, SUIT), UP = front(HEAD_UP, BACK);
  const S = front(HEAD_S, zipAt(SUIT, 14)), E = front(HEAD_E, zipAt(SUIT, 17));
  const N = front(HEAD_N, BACK), W = front(HEAD_W, BACK);
  const torch = [TORCH, LX, LY], baton = [BATON, 8, 21], num = x => [NUMBER, x, 15];
  const flat = {}, iso = {};
  for (const i of [0, 1, 2]) {
    flat[`down ${i}`] = frame(DOWN, LEGS_FRONT[i], baton, torch);
    flat[`up ${i}`] = frame(UP, LEGS_FRONT[i], num(10), baton, torch);
    flat[`right ${i}`] = frame(RIGHT, LEGS_SIDE[i], [BATON, 14, 21], [ARM_SIDE, 10, 13], torch);
    iso[`E ${i}`] = frame(E, LEGS_FRONT[i], baton, torch);
    iso[`W ${i}`] = frame(W, LEGS_FRONT[i], num(11), baton, torch);
    iso[`S ${i}`] = frame(S, LEGS_FRONT[i], baton, torch);
    iso[`N ${i}`] = frame(N, LEGS_FRONT[i], num(9), baton, torch);
  }
  const ring = body => frame(noArm(body), LEGS_FRONT[0], baton, [RAISE, 2, 9], [WHISTLE, 11, 10], torch);
  flat.ring = ring(DOWN);
  iso.ring = ring(S);
  const anchors = { feet: [16, 36], light: LIGHT };
  return { flat, iso, flatAnchors: anchors, isoAnchors: anchors };
};
