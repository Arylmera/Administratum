// Breaking Bad's Watchman (Night Vigil): Mike, flat. A dark flat cap (V), bald under it, a grey moustache-less stern
// face (:), a tan jacket (s) over a dark shirt, dark trousers (V), black shoes (n), a steel flashlight (m) in his
// right hand, its lens (F) on the light anchor. ring: he raises a walkie-talkie (n, m aerial) to his ear with his left.
// 39°: S is the front, N the back, E the side, W the side turned (flashlight still on the anchor).
import { flat } from '../flat_kit.mjs';

const STEP = [[0, 0], [1, 0], [0, 1]];
const LIGHT = [27, 24];

function front(f, back, ring) {
  const g = flat(32, 36), [l, r] = STEP[f];
  g.rect(11, 27, 4, 6 - l, 'V').rect(17, 27, 4, 6 - r, 'V');
  g.rect(10, 33 - l, 5, 3, 'n').rect(17, 33 - r, 5, 3, 'n');
  g.rect(9, 15, 14, 13, 's'); // jacket
  if (!back) g.rect(14, 15, 4, 6, 'V').vline(16, 21, 27, 'k'); // dark shirt, the jacket's opening
  if (ring) g.rect(6, 9, 3, 7, 's').box(5, 4, 4, 6, 'n').vline(6, 1, 3, 'm'); // his left hand: the walkie-talkie at his ear
  else g.rect(6, 16, 3, 10, 's').rect(6, 26, 3, 2, ':'); // his left arm
  g.rect(23, 16, 3, 9, 's').rect(23, 25, 3, 2, ':').box(23, 23, 6, 3, 'm').set(27, 24, 'F'); // the flashlight, always on the light anchor
  g.disc(16, 9, 5.5, 6, ':'); // head
  g.rect(10, 3, 12, 4, 'V').hline(10, 22, 6, 'V'); // the flat cap and its brim
  if (!back) g.rect(13, 9, 2, 1, 'k').rect(18, 9, 2, 1, 'k').hline(14, 18, 13, 'k'); // eyes, a flat mouth
  else g.rect(11, 7, 10, 2, ':');
  return g.outline().rows();
}
// west (39° only): the side body turned, the flashlight kept in his back hand on the same light anchor
function west(f) {
  const g = flat(32, 36), a = [0, -2, 2][f];
  g.rect(13 + a, 27, 4, 6, 'V').rect(16 - a, 27, 4, 6, 'V');
  g.rect(12 + a, 33, 6, 3, 'n').rect(16 - a, 33, 6, 3, 'n');
  g.rect(10, 15, 11, 13, 's');
  g.disc(16, 9, 5.5, 6, ':'); g.rect(10, 3, 11, 4, 'V').hline(7, 20, 6, 'V'); g.rect(11, 9, 2, 1, 'k');
  g.rect(19, 16, 4, 9, 's').rect(19, 25, 4, 2, ':').box(18, 23, 10, 3, 'm').set(27, 24, 'F');
  return g.outline().rows();
}
function side(f, ring) {
  const g = flat(32, 36), a = [0, -2, 2][f];
  g.rect(13 + a, 27, 4, 6, 'V').rect(16 - a, 27, 4, 6, 'V');
  g.rect(12 + a, 33, 6, 3, 'n').rect(16 - a, 33, 6, 3, 'n');
  g.rect(11, 15, 11, 13, 's');
  g.disc(16, 9, 5.5, 6, ':'); g.rect(11, 3, 11, 4, 'V').hline(11, 24, 6, 'V'); g.rect(19, 9, 2, 1, 'k');
  if (ring) g.rect(18, 9, 3, 7, 's').box(19, 4, 4, 6, 'n').vline(22, 1, 3, 'm');
  else g.rect(15, 16, 4, 9, 's').rect(15, 25, 4, 2, ':').box(18, 23, 10, 3, 'm').set(27, 24, 'F');
  return g.outline().rows();
}
export default () => {
  const flatF = {}, iso = {};
  for (const i of [0, 1, 2]) {
    flatF[`down ${i}`] = front(i, false); flatF[`up ${i}`] = front(i, true); flatF[`right ${i}`] = side(i);
    iso[`S ${i}`] = front(i, false); iso[`N ${i}`] = front(i, true); iso[`E ${i}`] = side(i); iso[`W ${i}`] = west(i);
  }
  flatF.ring = front(0, false, true); iso.ring = front(0, false, true);
  const anchors = { feet: [16, 36], light: LIGHT };
  return { flat: flatF, iso, flatAnchors: anchors, isoAnchors: anchors };
};
