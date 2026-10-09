// Sprites: the art files in ui/art/ (PNG sheets drawn in the key palette, see art.js), loaded at startup into text
// rows, one char per colour of the active theme's px palette (theme.js), '.' transparent. The art started as the
// Claude Design board "Tier II — Data-Shrine".
import { BASE, T, THEMES, onTheme } from './theme.js';
import './themes.js'; // the themes, and the art they bring (ui/art/<theme>/)
import { loadSheet } from './art.js';
import { outline, outlined } from './outline.js';
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
  if (outline.on) { const o = outlined(cv); g.drawImage(o, x - 1 / RES, y - 1 / RES, o.width / RES, o.height / RES); return; }
  g.drawImage(cv, x, y, cv.width / RES, cv.height / RES);
}

const mirror = map => map.map(row => row.split('').reverse().join(''));

// Prop families, one sheet each (as the sprite discussion issues group them); frames named as in MAPS.
const PROP_SHEETS = ['workstations', 'cogitator', 'sanctum', 'gate', 'refectorium', 'walls', 'clutter', 'skull', 'petitions', 'fire', 'commits', 'breakout'];
// The room's structure: tiles with fill rules (room.js).
const ROOM_SHEETS = ['room-floor', 'room-walls', 'room-pipes', 'room-doors'];
// The 39° character families (wave 2): optional, drawn by separate art agents one world at a time. A missing base
// or theme file is absence, not an error (the exports stay empty and callers fall back); any other load error
// (a bad palette colour, a corrupt JSON) still throws, as loadSheet already does.
export const FAMILIES39 = ['scribe39', 'adept39', 'magos39', 'skull39', 'watch39'];
const missing = e => e.code === 'ENOENT' || /HTTP 404/.test(e.message);
const EMPTY_SHEET = { frames: {}, anchors: {}, tiles: {}, meta: {} };
const loadOptional = f => loadSheet(f).catch(e => { if (missing(e)) return EMPTY_SHEET; throw e; });
const FAMILIES = ['scribe', 'adept', 'magos', 'watch', ...PROP_SHEETS, ...ROOM_SHEETS, ...FAMILIES39];
const base = Object.fromEntries(FAMILIES.map((f, i) => [f, i]));
const loaded = await Promise.all(FAMILIES.map(f => (FAMILIES39.includes(f) ? loadOptional(f) : loadSheet(f))));
Object.keys(base).forEach((f, i) => { base[f] = loaded[i]; });
// A theme's own art (theme.art: the families it redraws): ui/art/<theme>/<family>.png + .json holding only the frames it
// changes, same sizes; anchors and fill rules it lists replace the default's. Everything else stays the default art.
// A theme with artOf draws with that theme's art (an accent of Neon Grid: same sprites, its own colours).
const themed = {}; // art folder (theme id) -> family -> sheet
const dirOf = id => THEMES[id]?.artOf ?? id;
await Promise.all(Object.values(THEMES).flatMap(th => (th.art ?? []).map(async f => {
  if (!base[f]) throw new Error(`theme ${th.id}: no art family '${f}'`);
  try {
    (themed[th.id] ??= {})[f] = await loadSheet(`${th.id}/${f}`);
  } catch (e) {
    // A 39° family a theme lists before its own file is drawn: falls back to the base 39 family (itself maybe empty).
    if (FAMILIES39.includes(f) && missing(e)) return;
    throw e;
  }
})));
// The sheet of a family as the theme sees it: the default with the theme's frames, anchors and tiles laid over (its
// own folder's first, else the folder it borrows, artOf).
function sheetOf(id, f) {
  const o = themed[id]?.[f] ?? themed[dirOf(id)]?.[f], d = base[f];
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

// 39° walk frames: E along +u (the back wall, to the right), W = -u, S = +v (toward the viewer), N = -v (away). No
// mirroring: each direction is its own art (the 39° view is asymmetric, unlike the flat left/right mirror above).
const DIRS39 = ['E', 'W', 'S', 'N'];
const WALK39 = DIRS39.flatMap(d => [0, 1, 2].map(i => `${d} ${i}`));
const walk39 = (sheet, d) => [0, 1, 2].map(i => sheet.frames[`${d} ${i}`]);
// The frame and anchor names each 39° family's art file must carry once it exists (step 2 of the brief: the contract
// the art agents follow; also the shape tools/sprite_catalog.mjs builds its listing from). Checked by
// checkComplete39 below.
export const REQ39 = {
  scribe39: { frames: [...WALK39, 'arm', 'armL', 'scroll'], anchors: ['feet', 'arm', 'armL', 'scroll'] },
  adept39: { frames: WALK39, anchors: ['feet'] },
  magos39: { frames: ['body', 'arm'], anchors: ['arm', 'chest', 'eyeL', 'eyeR'] },
  skull39: { frames: ['skull'], anchors: ['centre', 'carry', 'beam'] },
  watch39: { frames: [...WALK39, 'ring'], anchors: ['feet', 'light'] },
};
// A 39° family's sheet is either wholly absent (no frames: not drawn yet) or complete (every frame and anchor the
// brief names present); anything in between is a bug in a committed art file. This throws loudly (used by the
// tests, which check every committed scribe39/adept39/magos39/skull39 file this way, base and every theme folder,
// so an incomplete file can never land); resolve39 below degrades instead of throwing at runtime. Returns false
// for absent, true for complete.
export function checkComplete39(family, sheet) {
  if (!Object.keys(sheet.frames).length) return false;
  const req = REQ39[family];
  const missingNames = [...req.frames.filter(n => !(n in sheet.frames)), ...req.anchors.filter(n => !(n in sheet.anchors)).map(n => `anchor ${n}`)];
  if (missingNames.length) throw new Error(`${family}: missing ${missingNames.join(', ')}`);
  return true;
}
// Runtime use only: like checkComplete39, but an incomplete sheet degrades (console.error naming the family, where
// it came from and what's missing) instead of throwing, so a bad art file never takes the app down.
const degrade39 = (family, sheet, where) => {
  try { return checkComplete39(family, sheet); } catch (e) { console.error(`39° ${where}: ${e.message}`); return false; }
};
// Resolves a 39° family for one theme: its own sheet if complete, else the base family's if that is complete, else
// empty (the "export is then empty" case the brief names). Exported as the seam the test drives directly, with
// fabricated sheets, to prove the themed-missing/incomplete -> base, and both-bad -> empty, fallbacks.
export function resolve39(family, themedSheet, baseSheet, where) {
  if (themedSheet && degrade39(family, themedSheet, where)) return themedSheet;
  if (degrade39(family, baseSheet, 'base')) return baseSheet;
  return EMPTY_SHEET;
}

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
// The Watchman (Night Vigil, while armed): 16x18 logical, walks like the scribe (left mirrors right), and `ring`, his
// signal pose (bell, walkie-talkie, wrist panel, hourglass or whistle depending on the world). WATCH_AT: feet (the
// actor's floor point), light (his light source's centre, where its glow is drawn).
export const WATCH = {}, WATCH_AT = {}; // light is the right-facing frames'; WATCH.left mirrors it: x = 16 - light.x (actors.js lanternOf)
// Every other sprite by name.
export const MAPS = {};
// Prop anchors by sprite name, logical px from its top-left: points [x, y], rects [x, y, w, h] (what each one is: the
// sheet's JSON, tools/map_to_art.mjs PROP_ANCHORS). Desks, lecterns, consoles, the cogitator, the gate, the skull.
export const PROP_AT = {};
// Room tiles by name: frames, fill rules and anchors (logical px), merged over the room sheets.
export const ROOM = { frames: {}, tiles: {}, anchors: {} };
// Which art file each sprite comes from, for the active theme ('walls', 'cyber/walls'): the gallery, the tests.
export const SHEET_OF = {}, ROOM_SHEET_OF = {};

// The 39° character families (wave 2): empty until an art agent's PNG exists for the active theme, then refilled
// like SCRIBE above. No left/right mirror: W, S, N are each drawn, not derived from E.
export const SCRIBE39 = {}, SCRIBE39_AT = {};
export const ADEPT39 = {}, ADEPT39_AT = {};
export const MAGOS39 = {}, MAGOS39_AT = {};
export const SKULL39 = {}, SKULL39_AT = {};
export const WATCH39 = {}, WATCH39_AT = {};
const walker39 = sheet => Object.fromEntries(DIRS39.map(d => [d, walk39(sheet, d)]));
// How to build each family's export object from its (complete) sheet, and which [obj, at] pair to refill.
const BUILD39 = {
  scribe39: sheet => ({ ...walker39(sheet), arm: sheet.frames.arm, armL: sheet.frames.armL, scroll: sheet.frames.scroll }),
  adept39: walker39,
  magos39: sheet => ({ body: sheet.frames.body, arm: sheet.frames.arm }),
  skull39: sheet => ({ skull: sheet.frames.skull }),
  watch39: sheet => ({ ...walker39(sheet), ring: sheet.frames.ring }),
};
const EXPORT39 = { scribe39: [SCRIBE39, SCRIBE39_AT], adept39: [ADEPT39, ADEPT39_AT], magos39: [MAGOS39, MAGOS39_AT], skull39: [SKULL39, SKULL39_AT], watch39: [WATCH39, WATCH39_AT] };

function useArt(id) {
  const S = Object.fromEntries(FAMILIES.map(f => [f, sheetOf(id, f)]));
  const dir = dirOf(id), src = (f, n) => (themed[id]?.[f]?.frames[n] ? `${id}/${f}` : themed[dir]?.[f]?.frames[n] ? `${dir}/${f}` : f);
  refill(SCRIBE, walker(S.scribe)); refill(SCRIBE_AT, anchorsOf(S.scribe));
  refill(ADEPT, walker(S.adept)); refill(ADEPT_AT, anchorsOf(S.adept));
  refill(MAGOS, { body: S.magos.frames.body, arm: S.magos.frames.arm }); refill(MAGOS_AT, anchorsOf(S.magos));
  refill(WATCH, { ...walker(S.watch), ring: S.watch.frames.ring }); refill(WATCH_AT, anchorsOf(S.watch));
  for (const f of FAMILIES39) {
    const sheet = resolve39(f, themed[dir]?.[f], base[f], `theme '${id}'`), [obj, at] = EXPORT39[f], complete = Object.keys(sheet.frames).length > 0;
    refill(obj, complete ? BUILD39[f](sheet) : {});
    refill(at, complete ? anchorsOf(sheet) : {});
  }
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
export const ART = { base, themed, dirOf };
