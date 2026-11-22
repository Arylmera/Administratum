// Sprites: the art files in ui/art/ (PNG sheets drawn in the key palette, see art.js), loaded at startup into text
// rows, one char per colour of the active theme's px palette (theme.js), '.' transparent. The art started as the
// Claude Design board "Tier II — Data-Shrine".
import { BASE, T, THEMES, onTheme, beforeTheme } from './theme.js';
import { artRootOf, dropTheme, packOf, warnTheme } from './themes.js'; // the themes, and the art they bring (ui/art/<theme>/)
import { loadSheet } from './art.js';
import { checkSheet, knownFrames } from './artcheck.js';
import { outline, outlined } from './outline.js';
import { GESTURES, GESTURE_FRAMES, SEATED_FRAME } from './gestures.js';
export { BASE };

import { RANKS, RANK_FAMILIES, rankOf } from './ranks.js'; // the ranks (ranks.js), and who has one
export { RANKS, rankOf };

export const RES = 2; // art pixels per logical pixel
export const half = v => Math.round(v * 2) / 2; // snap to the art-pixel grid
export const rect = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };

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

// An adept frame with the glyph of its subagent kind ('explore', 'plan', 'general', 'custom': actors.js markOf) laid in
// at the facing's anchor: the chest screen from the front, a plate over the back cog from behind (its back is what shows
// at its console). As is where the art has none (side views, a world's own adept). F, A: ADEPT/ADEPT_AT or the 39° pair.
// Cached per frame and glyph, so the sprite cache finds the result by identity.
const laid = new WeakMap();
export function marked(map, F, A, face, mark) {
  const part = F.marks?.[`glyph ${mark}`], at = A[`glyph ${face}`];
  if (!part || !at) return map;
  const x = at.x * RES, y = at.y * RES, by = laid.get(map) ?? laid.set(map, new WeakMap()).get(map);
  if (!by.has(part)) by.set(part, map.map((row, j) => [...row].map((c, i) => { const o = part[j - y]?.[i - x]; return o && o !== '.' ? o : c; }).join('')));
  return by.get(part);
}

const mirror = map => map.map(row => row.split('').reverse().join(''));

// Prop families, one sheet each (as the sprite discussion issues group them); frames named as in MAPS.
const PROP_SHEETS = ['workstations', 'cogitator', 'sanctum', 'gate', 'refectorium', 'walls', 'clutter', 'skull', 'petitions', 'fire', 'commits', 'breakout', 'suzerain', 'honours', 'lift', 'enclave', 'cilamp', 'cimain', 'roomcog'];
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
// A theme with artOf draws with that theme's art (a style of Neon Grid: same sprites, its own colours). A pack's theme
// (themes.js packOf): read through its pack, each sheet checked against the default (artcheck.js); any problem leaves
// the theme out with its reason (dropTheme) instead of stopping the app. A shipped theme's still throws. A frame this
// version does not know (a pack drawn for a newer app, or a typo) is left out of the sheet before the check, with a
// warning (warnTheme): the theme loads without it. Its rect and pixels were still read and held to the limits (art.js).
const themed = {}; // art folder (theme id) -> family -> sheet
const dirOf = id => THEMES[id]?.artOf ?? id;
// Only the active theme's art (and its base's, artOf) loads at start, with every pack theme (checked at start, so a
// broken one is left out before it can be picked). Any other theme's loads when it is needed: switchTheme (the picker),
// loadAllArt (the art tools, the gallery, the tests). The family names are checked for every theme at once (no read).
for (const th of Object.values(THEMES)) for (const f of th.art ?? []) if (!packOf(th.id) && !FAMILIES.includes(f)) throw new Error(`theme ${th.id}: no art family '${f}'`); // the name ends up in a file path
const loading = new Map(); // theme id -> the promise of its own sheets
function loadTheme(th) {
  if (!loading.has(th.id)) loading.set(th.id, readTheme(th).catch(e => { loading.delete(th.id); throw e; }));
  return loading.get(th.id);
}
async function readTheme(th) {
  const pack = packOf(th.id), sheets = {};
  try {
    await Promise.all(th.art.map(async f => {
      // the name ends up in a file path
      if (!FAMILIES.includes(f)) throw new Error(`${pack ? '' : `theme ${th.id}: `}no art family '${f}'`);
      try {
        sheets[f] = await loadSheet(f, artRootOf(th.id));
      } catch (e) {
        // A 39° family a theme lists before its own file is drawn: falls back to the base 39 family (itself maybe empty).
        // A pack's: only its JSON missing is absence (art.js names a reader's file first).
        if (FAMILIES39.includes(f) && missing(e) && (!pack || e.message.startsWith(`${f}.json: `))) return;
        throw e;
      }
      if (!pack) return;
      const { sheet, unknown } = knownFrames(f, sheets[f], base[f]);
      sheets[f] = sheet;
      if (unknown.length) warnTheme(th.id, `${pack.folder}/${f}: ${unknown.map(n => `'${n}'`).join(', ')} ${unknown.length === 1 ? 'is not a frame' : 'are not frames'} this version of the app knows: ignored`);
      const bad = checkSheet(f, sheet, base[f]);
      if (bad.length) throw new Error(bad.join('; '));
    }));
  } catch (e) {
    if (!pack) throw e;
    return dropTheme(th.id, `${pack.folder}/${e.message}`);
  }
  if (!pack || THEMES[th.id]) themed[th.id] = sheets;
}
// What the art of theme `id` needs: its own folder's sheets, and the folder it borrows (artOf).
const needs = id => [...new Set([id, dirOf(id)])].map(i => THEMES[i]).filter(th => th?.art?.length);
const hooks = []; // faces.js: its own sheets, by theme id
export const onLoadArt = fn => { hooks.push(fn); };
const ready = new Set(); // theme ids whose art (here and in the hooks) is in
// Loads the art of theme `id` (its sheets, then the hooks': faces.js reads the frames of these). Resolves once it is in.
export async function loadArt(id) {
  if (ready.has(id)) return;
  await Promise.all(needs(id).map(loadTheme));
  for (const hook of hooks) await hook(id);
  ready.add(id);
}
// Loads every theme's art: the art tools and the gallery draw every world, the tests visit them.
export const loadAllArt = () => Promise.all(Object.keys(THEMES).map(loadArt)).then(() => {});
beforeTheme(id => (ready.has(id) ? null : loadArt(id))); // theme.js switchTheme waits for the art
await Promise.all([T.id, ...Object.keys(THEMES).filter(packOf)].map(loadArt));
// The sheet of a family as the theme sees it: the default with the theme's frames, anchors and tiles laid over (its
// own folder's first, else the folder it borrows, artOf).
function sheetOf(id, f) {
  const o = themed[id]?.[f] ?? themed[dirOf(id)]?.[f], d = base[f];
  if (!o) return d;
  const anchors = { ...d.anchors };
  for (const [k, v] of Object.entries(o.anchors)) anchors[k] = v && typeof v === 'object' && !Array.isArray(v) && anchors[k] && !Array.isArray(anchors[k]) ? { ...anchors[k], ...v } : v;
  return { frames: { ...d.frames, ...o.frames }, anchors, tiles: { ...d.tiles, ...o.tiles } };
}
// A sheet's anchors in logical px; the rank keys (per-rank anchors, rankAnchors) are left out.
export const anchorsOf = sheet => Object.fromEntries(Object.entries(sheet.anchors).filter(([k]) => !RANKS.includes(k)).map(([k, [x, y]]) => [k, { x: x / RES, y: y / RES }]));
// Per-rank anchors (meta.anchors.<rank>: base anchor keys only), each the sheet's anchors with the rank's laid over, in
// logical px: { [rank]: anchors }, only the ranks that set some.
export const rankAnchors = sheet => Object.fromEntries(RANKS.filter(r => sheet.anchors?.[r] && typeof sheet.anchors[r] === 'object' && !Array.isArray(sheet.anchors[r]))
  .map(r => [r, { ...anchorsOf(sheet), ...anchorsOf({ anchors: sheet.anchors[r] }) }]));
const logical = v => (Array.isArray(v) ? v.map(logical) : typeof v === 'number' ? v / RES : Object.fromEntries(Object.entries(v).map(([k, w]) => [k, logical(w)])));
const walk = (sheet, dir) => [0, 1, 2].map(i => sheet.frames[`${dir} ${i}`]);
const walker = sheet => ({ up: walk(sheet, 'up'), down: walk(sheet, 'down'), right: walk(sheet, 'right'), left: walk(sheet, 'right').map(mirror) });
const marksOf = (frames, mine = () => true) => Object.fromEntries(Object.entries(frames).filter(([n]) => n.startsWith('glyph ') && mine(n)));
// The gesture frames a scribe sheet draws (gestures.js: `up think`... flat, `N think`... 2.5D), by gesture; mine(name):
// whether to take it (only with the body it was drawn for). A gesture the sheet lacks is left out: never played.
const gesturesOf = (family, frames, mine = () => true) => Object.fromEntries(GESTURES.map((g, i) => [g, GESTURE_FRAMES[family][i]]).filter(([, n]) => frames[n] && mine(n)).map(([g, n]) => [g, frames[n]]));
// The rank layer of a character family (scribe, adept, scribe39, adept39; spec 2026-11-21-rank-art): per rank, its walk
// frames where it drew `<rank> <frame>`, the plain frame where it did not (flat: up down right, left the right mirrored;
// 39°: E W S N), and its gestures, each only with that rank's own seated frame (null when it drew no seat). same(name): whether the rank frame
// `name` comes from the source of its plain frame (a world's own scribe never wears the base art's rank frames). A rank
// with no walk frame of its own is absent: { [rank]: { [dir]: rows[], gesture: { [g]: rows } } }.
export function rankLayer(family, frames, same) {
  const dirs = family.endsWith('39') ? DIRS39 : ['up', 'down', 'right'], seat = SEATED_FRAME[family], out = {};
  for (const r of RANKS) {
    const own = n => !!frames[`${r} ${n}`] && same(`${r} ${n}`), pick = n => (own(n) ? frames[`${r} ${n}`] : frames[n]);
    if (!dirs.some(d => [0, 1, 2].some(i => own(`${d} ${i}`)))) continue;
    const layer = Object.fromEntries(dirs.map(d => [d, [0, 1, 2].map(i => pick(`${d} ${i}`))]));
    if (!family.endsWith('39')) layer.left = layer.right.map(mirror);
    // null: the rank did not draw its seated frame, so the plain gestures (drawn for the plain seat) still play
    layer.gesture = seat && own(seat) ? Object.fromEntries(GESTURES.map((g, i) => [g, GESTURE_FRAMES[family][i]]).filter(([, n]) => own(n)).map(([g, n]) => [g, frames[`${r} ${n}`]])) : null;
    out[r] = layer;
  }
  return out;
}
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
  scribe39: { frames: [...WALK39, 'scroll'], anchors: ['feet', 'scroll'] },
  adept39: { frames: WALK39, anchors: ['feet'] },
  magos39: { frames: ['body', 'arm'], anchors: ['arm', 'chest', 'eyeL', 'eyeR'] },
  skull39: { frames: ['skull'], anchors: ['centre', 'carry', 'beam'] },
  watch39: { frames: [...WALK39, 'ring'], anchors: ['feet', 'light'] },
};
// Frames a 39° family may carry, listed before its required extras (tools/sprite_catalog.mjs): the arms of a body
// without arms of its own (the 40k robe), at the arm and armL anchors.
export const OPT39 = { scribe39: ['arm', 'armL'] };
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
// desk. gesture: the optional gesture frames its world draws, by gesture ({ think, wonder, stretch }, actors.js bodyOf). SCRIBE_AT: its anchor points, logical px from the frame's top-left (feet: the actor's position).
export const SCRIBE = {}, SCRIBE_AT = {};
// Adept (one per subagent): 12x14 logical, bone robe with red hem trim, one green optic, data-slate. marks: its
// subagent kind's glyphs ('glyph <kind>'), only those drawn with the body, so a world's own adept stays unmarked;
// ADEPT_AT['glyph down'], ['glyph up']: where they sit (marked).
export const ADEPT = {}, ADEPT_AT = {};
// The Magos on the throne: body, the drill forearm that swings, and claw, his right pincer shut (drawn over the open one
// now and then; only with the body it was drawn for, so a world's own Magos never wears the 40k claw) (scene.js
// drawMagos). MAGOS_AT: where the arm, the claw, the chest screen's scan line and the two optics sit on the body, logical px.
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
  scribe39: sheet => ({ ...walker39(sheet), rank: rankLayer('scribe39', sheet.frames, () => true), arm: sheet.frames.arm, armL: sheet.frames.armL, scroll: sheet.frames.scroll, gesture: gesturesOf('scribe39', sheet.frames) }), // gesture: as SCRIBE.gesture
  adept39: sheet => ({ ...walker39(sheet), rank: rankLayer('adept39', sheet.frames, () => true), marks: marksOf(sheet.frames) }), // marks: optional, as ADEPT.marks (whole sheets: no gate)
  magos39: sheet => ({ body: sheet.frames.body, arm: sheet.frames.arm, claw: sheet.frames.claw }), // claw: optional, as MAGOS.claw
  skull39: sheet => ({ skull: sheet.frames.skull }),
  watch39: sheet => ({ ...walker39(sheet), ring: sheet.frames.ring }),
};
const EXPORT39 = { scribe39: [SCRIBE39, SCRIBE39_AT], adept39: [ADEPT39, ADEPT39_AT], magos39: [MAGOS39, MAGOS39_AT], skull39: [SKULL39, SKULL39_AT], watch39: [WATCH39, WATCH39_AT] };

function useArt(id) {
  const S = Object.fromEntries(FAMILIES.map(f => [f, sheetOf(id, f)]));
  const dir = dirOf(id), src = (f, n) => (themed[id]?.[f]?.frames[n] ? `${id}/${f}` : themed[dir]?.[f]?.frames[n] ? `${dir}/${f}` : f);
  // a frame drawn over a body (a glyph, the claw, the arms) only with the body it was drawn for: never the base art's
  // over a world's own body
  const own = (f, n, body) => src(f, n) === src(f, body);
  // a rank frame only from its plain frame's own source (rankLayer)
  const same = f => n => src(f, n) === src(f, n.slice(n.indexOf(' ') + 1));
  // a rank's anchors by the same rule: only those of the sheet that draws the plain body (its own folder's, else the
  // base's), laid over the anchors as the theme sees them
  const rankAt = (f, body) => {
    const from = src(f, body) === f ? base[f] : themed[id]?.[f] ?? themed[dir]?.[f], own = Object.fromEntries(RANKS.filter(r => from?.anchors?.[r]).map(r => [r, from.anchors[r]]));
    return rankAnchors({ anchors: { ...Object.fromEntries(Object.entries(S[f].anchors).filter(([k]) => !RANKS.includes(k))), ...own } });
  };
  refill(SCRIBE, { ...walker(S.scribe), gesture: gesturesOf('scribe', S.scribe.frames, n => own('scribe', n, 'up 0')), rank: rankLayer('scribe', S.scribe.frames, same('scribe')) }); refill(SCRIBE_AT, { ...anchorsOf(S.scribe), rank: rankAt('scribe', 'up 0') });
  refill(ADEPT, { ...walker(S.adept), marks: marksOf(S.adept.frames, n => own('adept', n, 'down 0')), rank: rankLayer('adept', S.adept.frames, same('adept')) }); refill(ADEPT_AT, { ...anchorsOf(S.adept), rank: rankAt('adept', 'down 0') });
  refill(MAGOS, { body: S.magos.frames.body, arm: S.magos.frames.arm, claw: own('magos', 'claw', 'body') ? S.magos.frames.claw : undefined }); refill(MAGOS_AT, anchorsOf(S.magos));
  refill(WATCH, { ...walker(S.watch), ring: S.watch.frames.ring }); refill(WATCH_AT, anchorsOf(S.watch));
  for (const f of FAMILIES39) {
    const sheet = resolve39(f, themed[dir]?.[f], base[f], `theme '${id}'`), [obj, at] = EXPORT39[f], complete = Object.keys(sheet.frames).length > 0;
    refill(obj, complete ? BUILD39[f](sheet) : {});
    refill(at, complete ? { ...anchorsOf(sheet), ...(RANK_FAMILIES.includes(f) && { rank: rankAnchors(sheet) }) } : {});
  }
  // the arms (actors.js drawCarried): a world's own scribe has them in its body; the 40k robe has none, so its art draws
  // two mechadendrites (the left one the right mirrored)
  const arm = own('scribe', 'arm', 'up 0') ? S.scribe.frames.arm : undefined;
  refill(MAPS, Object.assign({}, arm && { ARM: arm, ARM_L: mirror(arm) }, ...PROP_SHEETS.map(f => S[f].frames)));
  refill(PROP_AT, Object.assign({}, ...PROP_SHEETS.map(f => logical(S[f].anchors ?? {}))));
  refill(ROOM.frames, Object.assign({}, ...ROOM_SHEETS.map(f => S[f].frames)));
  refill(ROOM.tiles, Object.assign({}, ...ROOM_SHEETS.map(f => S[f].tiles)));
  refill(ROOM.anchors, Object.assign({}, ...ROOM_SHEETS.map(f => logical(S[f].anchors))));
  refill(SHEET_OF, { ...(arm && { ARM: src('scribe', 'arm'), ARM_L: src('scribe', 'arm') }), ...Object.fromEntries(PROP_SHEETS.flatMap(f => Object.keys(S[f].frames).map(n => [n, src(f, n)]))) });
  refill(ROOM_SHEET_OF, Object.fromEntries(ROOM_SHEETS.flatMap(f => Object.keys(S[f].frames).map(n => [n, src(f, n)]))));
  // A tile's mix only from its own art: a world that redraws the floor but not its variants keeps the one tile.
  for (const [n, t] of Object.entries(ROOM.tiles)) if (t.mix) ROOM.tiles[n] = { ...t, mix: t.mix.filter(v => ROOM_SHEET_OF[v] === ROOM_SHEET_OF[n]) };
}
useArt(T.id);
// A theme set without switchTheme (setTheme) draws with the default's art until its own is in, then with it.
onTheme(t => {
  useArt(t.id);
  if (!ready.has(t.id)) loadArt(t.id).then(() => { if (T.id === t.id) useArt(t.id); }, e => console.error(`theme ${t.id}: ${e.message}`));
});
// For the tests and the art tools: the default sheets, and each theme's own.
export const ART = { base, themed, dirOf };
// The prop frames (MAPS) as theme `id` draws them, without switching to it (faces.js checks a pack's faces against them).
export const framesOf = id => Object.assign({}, ...PROP_SHEETS.map(f => sheetOf(id, f).frames));
