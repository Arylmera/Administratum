// Shared drawing helpers and layout for the Hall of Honours plaque (tools/honours_art.mjs): frames are rows of key.gpl
// chars, '.' clear. Every world draws its own plaque from scratch on the same layout, so the overlay (ui/overlay.js)
// lays the title and the four marks over the same places: the anchors below, in art px.
export const W = 72, H = 96;
export const SIZES = { HONOURS: [W, H] };
// The title band, and per mark (commits, longest, fast, busiest) its icon box and its text field.
export const TITLE = [12, 7, 48, 11];
export const ICON = i => [7, 24 + 17 * i, 12, 12];
export const ROW = i => [21, 23 + 17 * i, 45, 14];
export const ANCHORS = { HONOURS: { title: TITLE, ...Object.fromEntries([0, 1, 2, 3].map(i => [`row${i}`, ROW(i)])) } };

export const row = (w, f) => Array.from({ length: w }, (_, x) => f(x) ?? '.').join('');
export const grid = (w, h, f) => Array.from({ length: h }, (_, y) => row(w, x => f(x, y)));
export const inRect = ([rx, ry, rw, rh], x, y) => x >= rx && x < rx + rw && y >= ry && y < ry + rh;
// Where (x, y) is in rect r: 'edge' on its 1 px border, 'in' inside, null outside.
export const part = (r, x, y) => (!inRect(r, x, y) ? null : x === r[0] || y === r[1] || x === r[0] + r[2] - 1 || y === r[1] + r[3] - 1 ? 'edge' : 'in');
// A rounded rectangle (corner radius rad) filling [x0, x1] x [y0, y1]: true inside.
export const rounded = (x0, y0, x1, y1, rad) => (x, y) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = x < x0 + rad ? x0 + rad : x > x1 - rad ? x1 - rad : x, cy = y < y0 + rad ? y0 + rad : y > y1 - rad ? y1 - rad : y;
  return Math.hypot(x - cx, y - cy) <= rad + 0.2;
};
// A shape's outline ring (any 8-neighbour inside, itself outside).
export const ringOf = (inside, x, y) => !inside(x, y) && [-1, 0, 1].some(dx => [-1, 0, 1].some(dy => inside(x + dx, y + dy)));
// Distance in px from (x, y) to the outside of shape `inside`, capped at n (0 outside): bevels and borders.
export const depth = (inside, x, y, n = 4) => {
  if (!inside(x, y)) return 0;
  for (let d = 1; d <= n; d++) for (let dx = -d; dx <= d; dx++) for (let dy = -d; dy <= d; dy++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) === d && !inside(x + dx, y + dy)) return d;
  }
  return n + 1;
};
// A 12x12 icon from a picture: rows of chars, each mapped through `key` (a char not in key is drawn as itself; ' '
// and '.' clear). Returns a function (x, y) -> char|null in icon coordinates.
export const pic = (rows, key = {}) => (x, y) => {
  const c = rows[y]?.[x];
  if (!c || c === ' ' || c === '.') return null;
  return key[c] ?? c;
};
// The plaque: body(x, y) draws everything but the icons, laid over at ICON(i) (icons[i](x, y) in icon coordinates).
export function plaque(body, icons) {
  return grid(W, H, (x, y) => {
    for (let i = 0; i < 4; i++) {
      const [ix, iy] = ICON(i);
      if (x >= ix && x < ix + 12 && y >= iy && y < iy + 12) { const c = icons[i](x - ix, y - iy); if (c) return c; }
    }
    return body(x, y);
  });
}
