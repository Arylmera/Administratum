// Shared drawing helpers for the break-out sheets (tools/breakout_art.mjs): frames are rows of key.gpl chars.
export const row = (w, f) => Array.from({ length: w }, (_, x) => f(x)).join('');
export const grid = (w, h, f) => Array.from({ length: h }, (_, y) => row(w, x => f(x, y)));
export const edge = (x, w) => x === 0 || x === w - 1;
