// Shared helpers for the rank bodies (tools/rank_art.mjs): a rank's frames are drawn from the plain frame of the same
// name, cell by cell, so every walk frame of a rank keeps the plain frame's pose and feet. A grid is rows of key chars.
export const grid = rows => rows.map(r => [...r]);
export const rows = g => g.map(r => r.join(''));
export const at = (g, x, y) => g[y]?.[x];
export const put = (g, x, y, c) => { if (g[y] && x >= 0 && x < g[y].length) g[y][x] = c; };
// Every cell of rows y0..y1 (and columns x0..x1) whose char is in `from` becomes f(x, y, char) (a char, or null: kept).
export function paint(g, { y0 = 0, y1 = g.length - 1, x0 = 0, x1 = Infinity, from }, f) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= Math.min(x1, g[y].length - 1); x++) {
    const c = g[y][x];
    if (from.includes(c)) { const n = f(x, y, c); if (n) g[y][x] = n; }
  }
}
// The silhouette's left and right edge on row y (first and last drawn cell), or null.
const edges = (g, y) => { const r = g[y], a = r.findIndex(c => c !== '.'); return a < 0 ? null : [a, r.length - 1 - [...r].reverse().findIndex(c => c !== '.')]; };
// Rows y0..y1 one cell wider each side: a new outline outside, the old outline cell becomes `edge`.
export function widen(g, y0, y1, edge) {
  for (let y = y0; y <= y1; y++) { const e = edges(g, y); if (!e) continue; const [a, b] = e; put(g, a - 1, y, 'k'); put(g, a, y, edge); put(g, b + 1, y, 'k'); put(g, b, y, edge); }
}
// Rows y0..y1 one cell narrower each side: the outline moves in.
export function narrow(g, y0, y1) {
  for (let y = y0; y <= y1; y++) { const e = edges(g, y); if (!e) continue; const [a, b] = e; put(g, a, y, '.'); put(g, a + 1, y, 'k'); put(g, b, y, '.'); put(g, b - 1, y, 'k'); }
}
export const ROBE = 'rRd'; // the robe's cloth: what a rank body redraws
