// The worlds' own GitHub main lamps (CIMAIN, spec 2026-11-22-ci-lamps-scribe-main-design.md section 3): each
// tools/cimain_art/<theme>.mjs draws one 14 x 28 shape and frames() turns it into the five frames. The lens is a 4 x 4
// block at columns 5..8, rows 4..7 (its centre the base sheet's lens anchor [7, 6]; the foot is [7, 28]), written with
// placeholders: '*' the lens, '+' its glint, '-' its shade. Each frame swaps them for that frame's lens chars, the same
// chars as the scribe's CILAMP (ui/cilamp.js LENS fixes their colours over the whole sprite, so the housing never uses
// any of them).
export const W = 14, H = 28;
export const NAMES = ['CIMAIN.off', 'CIMAIN.amber', 'CIMAIN.amber_dim', 'CIMAIN.green', 'CIMAIN.red'];
const LIT = { 'CIMAIN.off': ['n', 'M', 'k'], 'CIMAIN.amber': ['f', 'F', 'g'], 'CIMAIN.amber_dim': ['g', 'f', 'G'], 'CIMAIN.green': ['c', 'O', 'C'], 'CIMAIN.red': ['a', 'F', 'x'] };
// Every char some frame's LENS recolours: never in the housing.
export const LENS_CHARS = new Set(Object.values(LIT).slice(1).flat());

export function frames(shape, who) {
  if (shape.length !== H || shape.some(r => r.length !== W)) throw new Error(`${who}: want ${W} x ${H}, rows ${shape.map(r => r.length).join(',')}`);
  for (const [y, r] of shape.entries()) for (const [x, ch] of [...r].entries()) {
    const lens = x >= 5 && x <= 8 && y >= 4 && y <= 7;
    if (!lens && '*+-'.includes(ch)) throw new Error(`${who}: lens char '${ch}' outside the lens block at ${x},${y}`);
    if (LENS_CHARS.has(ch)) throw new Error(`${who}: housing char '${ch}' at ${x},${y} is a lens char`);
  }
  return Object.fromEntries(NAMES.map(n => { const [L, Hi, S] = LIT[n]; return [n, shape.map(r => r.replace(/\*/g, L).replace(/\+/g, Hi).replace(/-/g, S))]; }));
}
