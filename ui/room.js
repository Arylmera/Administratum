// The room's structure from tiles (ui/art/room-*.png): floor, wall plates, pipes, coolant channels, pillars, doors...
// Each tile's JSON says how it fills a rect (meta.tiles[name].fill):
//   repeat      tiled both ways from the rect's top-left; `top`: another tile for the first row (plates with no seam above)
//   repeat-x/y  a strip along one axis, its own size across (pipes, channels, sills, pillars)
//   nine        nine-slice: corners kept, edges and centre tiled; `edge`: the border in art px (the sanctum floor)
//   once        drawn as is (doors, fittings, pilasters, the beacon); the default
// `glow`: the tile glows in that ink colour (the coolant), `glowPasses` times over for a stronger glow (default 1).
// Where things go stays in scene.js: a theme reskins the
// tiles, the room keeps its shape.
import { sprite, RES, ROOM } from './sprites.js';
import { T } from './theme.js';

const parts = new WeakMap(); // tile canvas -> 'sx,sy,sw,sh' -> canvas of that part (nine-slice pieces)
function part(cv, sx, sy, sw, sh) {
  let by = parts.get(cv);
  if (!by) parts.set(cv, (by = new Map()));
  const k = `${sx},${sy},${sw},${sh}`;
  let c = by.get(k);
  if (!c) {
    c = document.createElement('canvas'); c.width = sw; c.height = sh;
    c.getContext('2d').drawImage(cv, sx, sy, sw, sh, 0, 0, sw, sh);
    by.set(k, c);
  }
  return c;
}
// Fills (x, y, w, h) with the art canvas cv repeated from (ox, oy), by default the rect's corner.
function tiled(g, cv, rep, x, y, w, h, ox = x, oy = y) {
  const p = g.createPattern(cv, rep);
  p.setTransform(new DOMMatrix([1 / RES, 0, 0, 1 / RES, ox, oy]));
  g.fillStyle = p;
  g.fillRect(x, y, w, h);
}

// Draws tile `name` over the rect (x, y, w, h) by its fill rule; strips and `once` tiles ignore the size across.
export function tile(g, name, x, y, w, h) {
  const t = ROOM.tiles[name] ?? {}, cv = sprite(ROOM.frames[name]), tw = cv.width / RES, th = cv.height / RES;
  if (t.glow) { g.save(); g.shadowColor = T.ink[t.glow]; g.shadowBlur = 4; }
  for (let pass = t.glow ? t.glowPasses ?? 1 : 1; pass > 0; pass--) switch (t.fill) {
    case 'repeat':
      if (t.top) {
        tiled(g, sprite(ROOM.frames[t.top]), 'repeat-x', x, y, w, Math.min(th, h));
        if (h > th) tiled(g, cv, 'repeat', x, y + th, w, h - th, x, y);
      } else tiled(g, cv, 'repeat', x, y, w, h);
      break;
    case 'repeat-x': tiled(g, cv, 'repeat-x', x, y, w, th); break;
    case 'repeat-y': tiled(g, cv, 'repeat-y', x, y, tw, h); break;
    case 'nine': {
      const E = t.edge, e = E / RES, W = cv.width, H = cv.height, mw = W - 2 * E, mh = H - 2 * E;
      for (const [sx, sy, dx, dy] of [[0, 0, x, y], [W - E, 0, x + w - e, y], [0, H - E, x, y + h - e], [W - E, H - E, x + w - e, y + h - e]]) g.drawImage(cv, sx, sy, E, E, dx, dy, e, e);
      tiled(g, part(cv, E, 0, mw, E), 'repeat-x', x + e, y, w - 2 * e, e);
      tiled(g, part(cv, E, H - E, mw, E), 'repeat-x', x + e, y + h - e, w - 2 * e, e);
      tiled(g, part(cv, 0, E, E, mh), 'repeat-y', x, y + e, e, h - 2 * e);
      tiled(g, part(cv, W - E, E, E, mh), 'repeat-y', x + w - e, y + e, e, h - 2 * e);
      tiled(g, part(cv, E, E, mw, mh), 'repeat', x + e, y + e, w - 2 * e, h - 2 * e);
      break;
    }
    default: g.drawImage(cv, x, y, tw, th);
  }
  if (t.glow) g.restore();
}
// A room tile's anchors (logical px from its top-left), e.g. a door frame's doorway corner.
export const roomAt = name => ROOM.anchors[name] ?? {};
