// Shared helpers for the watchman sheets (tools/watch_art.mjs): frames are rows of key.gpl chars, '.' clear.
// Patches (hand, lantern, ...) are stamped over a body; rev/put mirror and overwrite row slices.
export const stamp = (rows, patch, x, y) => rows.map((r, j) => {
  const p = patch[j - y];
  if (!p) return r;
  const a = [...r];
  [...p].forEach((c, i) => { if (c !== '.') a[x + i] = c; });
  return a.join('');
});
export const frame = (body, legs, ...patches) => patches.reduce((rows, [p, x, y]) => stamp(rows, p, x, y), [...body, ...legs]);
export const rev = s => [...s].reverse().join('');
// Columns x0.. of rows y0..y1 set to str (unlike stamp, it can write '.').
export const put = (rows, y0, y1, x0, str) => rows.map((r, j) => (j < y0 || j > y1 ? r : r.slice(0, x0) + str + r.slice(x0 + str.length)));
