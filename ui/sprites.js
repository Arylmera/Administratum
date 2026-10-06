// Sprites: the art files in ui/art/ (PNG sheets drawn in the key palette, see art.js), loaded at startup into text
// rows, one char per colour of the active theme's px palette (theme.js), '.' transparent. The art started as the
// Claude Design board "Tier II — Data-Shrine".
import { BASE, T, THEMES, onTheme } from './theme.js';
import './themes.js'; // the themes, and the art they bring (ui/art/<theme>/)
import { loadSheet } from './art.js';
export { BASE };

// Rank by model: opus/fable high, haiku novice, anything else (sonnet, unknown) standard. Edit here.
// Its colours (robe, adept) are the theme's T.rank[rank], its name the theme's wording t(`rank.${rank}`).
export const rankOf = model => (/opus|fable/i.test(model ?? '') ? 'high' : /haiku/i.test(model ?? '') ? 'novice' : 'standard');
export const RANKS = ['high', 'standard', 'novice'];

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
const PROP_SHEETS = ['workstations', 'cogitator', 'sanctum', 'gate', 'refectorium', 'walls', 'clutter', 'skull', 'petitions', 'fire', 'commits'];
// The room's structure: tiles with fill rules (room.js).
const ROOM_SHEETS = ['room-floor', 'room-walls', 'room-pipes', 'room-doors'];
const FAMILIES = ['scribe', 'adept', 'magos', ...PROP_SHEETS, ...ROOM_SHEETS];
const base = Object.fromEntries(FAMILIES.map((f, i) => [f, i]));
const loaded = await Promise.all(FAMILIES.map(loadSheet));
Object.keys(base).forEach((f, i) => { base[f] = loaded[i]; });
// A theme's own art (theme.art: the families it redraws): ui/art/<theme>/<family>.png + .json holding only the frames it
// changes, same sizes; anchors and fill rules it lists replace the default's. Everything else stays the default art.
const themed = {}; // theme id -> family -> sheet
await Promise.all(Object.values(THEMES).flatMap(th => (th.art ?? []).map(async f => {
  if (!base[f]) throw new Error(`theme ${th.id}: no art family '${f}'`);
  (themed[th.id] ??= {})[f] = await loadSheet(`${th.id}/${f}`);
})));
// The sheet of a family as the theme sees it: the default with the theme's frames, anchors and tiles laid over.
function sheetOf(id, f) {
  const o = themed[id]?.[f], d = base[f];
  if (!o) return d;
  const anchors = { ...d.anchors };
  for (const [k, v] of Object.entries(o.anchors)) anchors[k] = v && typeof v === 'object' && !Array.isArray(v) && anchors[k] && !Array.isArray(anchors[k]) ? { ...anchors[k], ...v } : v;
  return { frames: { ...d.frames, ...o.frames }, anchors, tiles: { ...d.tiles, ...o.tiles } };
}
const anchorsOf = sheet => Object.fromEntries(Object.entries(sheet.anchors).map(([k, [x, y]]) => [k, { x: x / RES, y: y / RES }]));
const logical = v => (Array.isArray(v) ? v.map(logical) : typeof v === 'number' ? v / RES : Object.fromEntries(Object.entries(v).map(([k, w]) => [k, logical(w)])));
const walk = (sheet, dir) => [0, 1, 2].map(i => sheet.frames[`${dir} ${i}`]);
const walker = sheet => ({ up: walk(sheet, 'up'), down: walk(sheet, 'down'), right: walk(sheet, 'right'), left: walk(sheet, 'right').map(mirror) });
const refill = (target, from) => { for (const k of Object.keys(target)) delete target[k]; return Object.assign(target, from); };

// The exports below are the same objects for the app's life, refilled for the active theme's art (the drawing code
// reads them at draw time; the sprite cache is per theme too).
// Scribe (one per session): 16x17 logical, 3 walk frames a direction (left mirrors right), and the arm drawn over the
// desk. SCRIBE_AT: its anchor points, logical px from the frame's top-left (feet: the actor's position).
export const SCRIBE = {}, SCRIBE_AT = {};
// Adept (one per subagent): 12x14 logical, bone robe with red hem trim, one green optic, data-slate.
export const ADEPT = {}, ADEPT_AT = {};
// The Magos on the throne: body, and the drill forearm that swings (scene.js drawMagos). MAGOS_AT: where the arm,
// the chest screen's scan line and the two optics sit on the body, logical px.
export const MAGOS = {}, MAGOS_AT = {};
// Every other sprite by name.
export const MAPS = {};
// Prop anchors by sprite name, logical px from its top-left: points [x, y], rects [x, y, w, h] (what each one is: the
// sheet's JSON, tools/map_to_art.mjs PROP_ANCHORS). Desks, lecterns, consoles, the cogitator, the gate, the skull.
export const PROP_AT = {};
// Room tiles by name: frames, fill rules and anchors (logical px), merged over the room sheets.
export const ROOM = { frames: {}, tiles: {}, anchors: {} };
// Which art file each sprite comes from, for the active theme ('walls', 'cyber/walls'): the gallery, the tests.
export const SHEET_OF = {}, ROOM_SHEET_OF = {};

function useArt(id) {
  const S = Object.fromEntries(FAMILIES.map(f => [f, sheetOf(id, f)]));
  const src = (f, n) => (themed[id]?.[f]?.frames[n] ? `${id}/${f}` : f);
  refill(SCRIBE, walker(S.scribe)); refill(SCRIBE_AT, anchorsOf(S.scribe));
  refill(ADEPT, walker(S.adept)); refill(ADEPT_AT, anchorsOf(S.adept));
  refill(MAGOS, { body: S.magos.frames.body, arm: S.magos.frames.arm }); refill(MAGOS_AT, anchorsOf(S.magos));
  refill(MAPS, Object.assign({ ARM: S.scribe.frames.arm, ARM_L: mirror(S.scribe.frames.arm) }, ...PROP_SHEETS.map(f => S[f].frames)));
  refill(PROP_AT, Object.assign({}, ...PROP_SHEETS.map(f => logical(S[f].anchors ?? {}))));
  refill(ROOM.frames, Object.assign({}, ...ROOM_SHEETS.map(f => S[f].frames)));
  refill(ROOM.tiles, Object.assign({}, ...ROOM_SHEETS.map(f => S[f].tiles)));
  refill(ROOM.anchors, Object.assign({}, ...ROOM_SHEETS.map(f => logical(S[f].anchors))));
  refill(SHEET_OF, { ARM: src('scribe', 'arm'), ARM_L: src('scribe', 'arm'), ...Object.fromEntries(PROP_SHEETS.flatMap(f => Object.keys(S[f].frames).map(n => [n, src(f, n)]))) });
  refill(ROOM_SHEET_OF, Object.fromEntries(ROOM_SHEETS.flatMap(f => Object.keys(S[f].frames).map(n => [n, src(f, n)]))));
}
useArt(T.id);
onTheme(t => useArt(t.id));
// For the tests and the art tools: the default sheets, and each theme's own.
export const ART = { base, themed };
