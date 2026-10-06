// Sprites: the art files in ui/art/ (PNG sheets drawn in the key palette, see art.js), loaded at startup into text
// rows, one char per colour of the active theme's px palette (theme.js), '.' transparent. The art started as the
// Claude Design board "Tier II — Data-Shrine".
import { BASE, T, onTheme } from './theme.js';
import { loadSheet } from './art.js';
export { BASE };

// Rank by model: opus/fable high, haiku novice, anything else (sonnet, unknown) standard. Edit here.
// Its colours (robe, adept) are the theme's: T.rank[rank].
export const rankOf = model => (/opus|fable/i.test(model ?? '') ? 'high' : /haiku/i.test(model ?? '') ? 'novice' : 'standard');
export const RANK = { high: { name: 'Magos' }, standard: { name: 'Tech-priest' }, novice: { name: 'Novice' } };

export const RES = 2; // art pixels per logical pixel

// Cached per map, then by the override object's identity (callers keep their overrides as constants, or themed()),
// so a blit costs no JSON; a new object with the same overrides still finds the canvas by its JSON key.
// A theme change drops the whole cache.
let cache = new WeakMap();
const NONE = {};
onTheme(() => { cache = new WeakMap(); });
export function sprite(map, over = NONE) {
  let byMap = cache.get(map);
  if (!byMap) { byMap = { obj: new WeakMap(), json: new Map() }; cache.set(map, byMap); }
  let cv = byMap.obj.get(over);
  if (cv) return cv;
  const key = JSON.stringify(over);
  cv = byMap.json.get(key);
  if (!cv) {
    const pal = { ...T.px, ...over };
    cv = document.createElement('canvas');
    cv.width = Math.max(...map.map(r => r.length));
    cv.height = map.length;
    const g = cv.getContext('2d');
    map.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const col = pal[row[i]];
        if (col) { g.fillStyle = col; g.fillRect(i, j, 1, 1); }
      }
    });
    byMap.json.set(key, cv);
  }
  byMap.obj.set(over, cv);
  return cv;
}

// Draws sprite(map, over) at logical (x, y); the HD sprite canvas is downscaled back to logical size.
export function blit(g, map, x, y, over) {
  const cv = sprite(map, over);
  g.drawImage(cv, x, y, cv.width / RES, cv.height / RES);
}

const mirror = map => map.map(row => row.split('').reverse().join(''));

// Prop families, one sheet each (as the sprite discussion issues group them); frames named as in MAPS.
const PROP_SHEETS = ['workstations', 'cogitator', 'sanctum', 'gate', 'refectorium', 'walls', 'clutter', 'skull', 'petitions', 'fire'];
// The room's structure: tiles with fill rules (room.js).
const ROOM_SHEETS = ['room-floor', 'room-walls', 'room-pipes', 'room-doors'];
const [scribe, adept, magos, ...rest] = await Promise.all(['scribe', 'adept', 'magos', ...PROP_SHEETS, ...ROOM_SHEETS].map(loadSheet));
const props = rest.slice(0, PROP_SHEETS.length), room = rest.slice(PROP_SHEETS.length);
const anchorsOf = sheet => Object.fromEntries(Object.entries(sheet.anchors).map(([k, [x, y]]) => [k, { x: x / RES, y: y / RES }]));
const logical = v => (Array.isArray(v) ? v.map(logical) : typeof v === 'number' ? v / RES : Object.fromEntries(Object.entries(v).map(([k, w]) => [k, logical(w)])));
const walk = (sheet, dir) => [0, 1, 2].map(i => sheet.frames[`${dir} ${i}`]);
const walker = sheet => ({ up: walk(sheet, 'up'), down: walk(sheet, 'down'), right: walk(sheet, 'right'), left: walk(sheet, 'right').map(mirror) });

// Scribe (one per session): 16x17 logical, 3 walk frames a direction (left mirrors right), and the arm drawn over the
// desk. SCRIBE_AT: its anchor points, logical px from the frame's top-left (feet: the actor's position).
export const SCRIBE = walker(scribe);
export const SCRIBE_AT = anchorsOf(scribe);
// Adept (one per subagent): 12x14 logical, bone robe with red hem trim, one green optic, data-slate.
export const ADEPT = walker(adept);
export const ADEPT_AT = anchorsOf(adept);
// The Magos on the throne: body, and the drill forearm that swings (scene.js drawMagos). MAGOS_AT: where the arm,
// the chest screen's scan line and the two optics sit on the body, logical px.
export const MAGOS = { body: magos.frames.body, arm: magos.frames.arm };
export const MAGOS_AT = anchorsOf(magos);

// Every other sprite by name.
export const MAPS = Object.assign({ ARM: scribe.frames.arm, ARM_L: mirror(scribe.frames.arm) }, ...props.map(p => p.frames));
// Prop anchors by sprite name, logical px from its top-left: points [x, y], rects [x, y, w, h] (what each one is: the
// sheet's JSON, tools/map_to_art.mjs PROP_ANCHORS). Desks, lecterns, consoles, the cogitator, the gate, the skull.
export const PROP_AT = Object.assign({}, ...props.map(p => logical(p.anchors ?? {})));
// Room tiles by name: frames, fill rules and anchors (logical px), merged over the room sheets.
export const ROOM = { frames: Object.assign({}, ...room.map(r => r.frames)), tiles: Object.assign({}, ...room.map(r => r.tiles)),
  anchors: Object.assign({}, ...room.map(r => logical(r.anchors))) };
export const ROOM_SHEET_OF = Object.fromEntries(ROOM_SHEETS.flatMap((f, i) => Object.keys(room[i].frames).map(n => [n, f])));
// Which art file each MAPS sprite comes from (the gallery, the tests).
export const SHEET_OF = { ARM: 'scribe', ARM_L: 'scribe', ...Object.fromEntries(PROP_SHEETS.flatMap((f, i) => Object.keys(props[i].frames).map(n => [n, f]))) };
