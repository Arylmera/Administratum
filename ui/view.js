// The hall's view: today's Flat 3/4 (identity projection) or the 39° projection, switched live (Settings, adm.view).
// Floor model stays in logical px (x, y); a view only maps a floor/wall point to screen logical px. Until the 39°
// hall is drawn (a later task) this module is inert plumbing: the math is exact, nothing draws through it yet.
//
// Mapping to the 3D world (art px, the trial's units): a floor point (x, y >= WALL) -> u = 2x, v = 2(y - WALL),
// z = 0; a point on the back wall band (x, y < WALL) -> u = 2x, v = 0, z = 2(WALL - y). WALL (logical px, the back
// wall's height, ui/layout.js) is a parameter here, defaulting to the real wall, so callers only pass it explicitly
// when they measure against a different one (the tests).
import { WALL as WALL_DEFAULT } from './layout.js';
export { WALL_DEFAULT };

export function floorToWorld(x, y, WALL = WALL_DEFAULT) {
  return y >= WALL ? [2 * x, 2 * (y - WALL), 0] : [2 * x, 0, 2 * (WALL - y)];
}

// The 39° projection (exact, from the trial): horizontal rotation 39°, back wall receding 3:1, side wall 2:1.
export const P39 = (u, v, z = 0) => { const w = Math.floor(v * Math.sqrt(2 / 3)); return [u - w, Math.floor(u / 3) + Math.floor(w / 2) - z]; };
const K = Math.sqrt(2 / 3); // continuous inverse of P39 for floor points (z = 0), used by toFloor

export const view = { mode: 'flat' };
const listeners = new Set();
export const onView = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export function setView(mode) {
  const next = mode === '39' ? '39' : 'flat';
  if (next === view.mode) return;
  view.mode = next;
  for (const f of listeners) f(view.mode);
}

// 39 mode only: the logical-px offset so the hall's whole projected bounding box starts at (0, 0) (sceneSize sets
// it for the current hall; toScreen/toFloor read it back). Flat mode needs none (identity).
let off = { x: 0, y: 0 };

// The canvas size each view needs for a hall (hallOf()'s {w, h, ...}, in logical px): flat is the hall's own size;
// 39 is the projected bounding box of the whole hall (floor + the back wall band up to WALL), which also refreshes
// the offset toScreen/toFloor use. P39's X is affine in u and monotonic in w(v); its Y is monotonic in u, w(v) and
// z; so the extremes over the hall's rectangle land on these 6 points (the wall top, the wall foot/floor top, and
// the floor's far edge), no need to scan every pixel.
export function sceneSize(hall, WALL = WALL_DEFAULT) {
  if (view.mode !== '39') return { w: hall.w, h: hall.h };
  const corners = [[0, 0], [hall.w, 0], [0, WALL], [hall.w, WALL], [0, hall.h], [hall.w, hall.h]];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of corners) {
    const [X, Y] = P39(...floorToWorld(x, y, WALL));
    if (X < minX) minX = X; if (X > maxX) maxX = X;
    if (Y < minY) minY = Y; if (Y > maxY) maxY = Y;
  }
  off = { x: -minX / 2, y: -minY / 2 };
  return { w: Math.ceil((maxX - minX) / 2), h: Math.ceil((maxY - minY) / 2) };
}

// A floor/wall point (plus z: extra height above the floor, in logical px) to screen logical px. Flat: identity
// (today's look, z unused). 39: through P39 in art px (u = 2x etc.), halved back to logical px, with the scene's
// offset (sceneSize) so the hall sits at non-negative coordinates.
export function toScreen(x, y, z = 0, WALL = WALL_DEFAULT) {
  if (view.mode !== '39') return [x, y];
  const [u, v, zw] = floorToWorld(x, y, WALL);
  const [X, Y] = P39(u, v, zw + 2 * z);
  return [X / 2 + off.x, Y / 2 + off.y];
}

// Inverse of toScreen for a floor point (z = 0): flat is identity; 39 solves P39's continuous form (its floors
// round to the nearest art px, so this lands within one logical px of the true floor point).
export function toFloor(sx, sy, WALL = WALL_DEFAULT) {
  if (view.mode !== '39') return [sx, sy];
  const X = 2 * (sx - off.x), Y = 2 * (sy - off.y);
  const v = (Y - X / 3) * 6 / (5 * K), u = X + K * v;
  return [Math.round(u / 2), Math.round(v / 2 + WALL)];
}
