// Flat drawing helper for the Breaking Bad generators (tools/*_art/breakingbad.mjs): shapes fill a grid of key.gpl
// chars ('.' clear), outline() rings the silhouette in k, rows() returns the frame.
export class Flat {
  constructor(w, h) { this.w = w; this.h = h; this.a = Array.from({ length: h }, () => Array(w).fill('.')); }
  set(x, y, c) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.a[y][x] = c; return this; }
  get(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.a[y][x] : '.'; }
  rect(x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c); return this; }
  hline(x0, x1, y, c) { return this.rect(x0, y, x1 - x0 + 1, 1, c); }
  vline(x, y0, y1, c) { return this.rect(x, y0, 1, y1 - y0 + 1, c); }
  box(x, y, w, h, fill) { this.rect(x, y, w, h, 'k'); if (w > 2 && h > 2) this.rect(x + 1, y + 1, w - 2, h - 2, fill); return this; }
  disc(cx, cy, rx, ry, c) {
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) if (((i + .5 - cx) / rx) ** 2 + ((j + .5 - cy) / ry) ** 2 <= 1) this.set(i, j, c);
    return this;
  }
  outline() {
    const o = this.a.map(r => r.slice());
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++)
      if (this.a[j][i] === '.' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !['.', 'k'].includes(this.get(i + a, j + b)))) o[j][i] = 'k';
    this.a = o; return this;
  }
  rows() { return this.a.map(r => r.join('')); }
}
export const flat = (w, h) => new Flat(w, h);
export const mirror = rows => rows.map(r => [...r].reverse().join(''));
