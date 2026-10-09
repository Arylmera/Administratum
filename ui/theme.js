// Themes: every colour the hall is drawn with, swappable at runtime
// (docs/superpowers/specs/2026-10-06-sprite-themes-design.md).
//   px    the pixel-map palette, one char per colour (the maps in sprites.js)
//   sash  department colours (rug, plaque, the scribe's sash: px y)
//   rank  per-model overrides of px: robe (scribe maps), adept (adept maps)
//   ink   colours drawn in code (scene.js, actors.js, app.js), by name. Where it is the same material as a px char
//         (brass, iron, parchment, phosphor, flame) it is derived from px, so recolouring the material moves both.
//   light glow colours (lighting.js reads them off the lights, scene.js picks them), the night tint, the window beams
//   ui    the page's chrome colours: CSS variables of index.html's :root by name ('--blood': '#...'), only those changed
//   text  the wording: rank names, petitions, rooms, the Chronicon... (TEXT below), only the keys a theme changes
// A theme lists only what it changes from its base (default Tier II); px edits flow into the derived ink.

// Tier II palette (ported from the Claude Design board "Tier II — Data-Shrine").
export const BASE = {
  k: '#0e0a08', g: '#b8742e', G: '#6e3f17', p: '#d6c79f', P: '#a8946a', w: '#4a3020', W: '#2e1c12',
  m: '#5a5e63', M: '#2a2c30', c: '#7cff9e', C: '#16301f', f: '#f0a83c', F: '#ffe6a0', x: '#8e1c16',
  b: '#cfc3a8', B: '#948669', n: '#140c08', u: '#2b3f5e', v: '#2f4a33', r: '#5e1710', d: '#3a0d09',
  a: '#ff3a20', o: '#7cff9e', y: '#d9a84e', s: '#b89a7c', e: '#120c0a',
  // HD mid-tones/highlights: robe lit, brass lit, iron lit, optic glint, wood lit
  R: '#8c2c1c', h: '#e8b45a', l: '#8a9096', O: '#e6ffee', L: '#6a4630',
  // adept robe: bone mid, bone shadow
  q: '#a89a78', Q: '#6a5e48',
  // rank markers in the scribe maps (t hood rim, T shoulder seam, z cog, j cog hub): robe-coloured unless rank gilds them
  t: '#8c2c1c', T: '#3a0d09', z: '#5e1710', j: '#5e1710',
  J: '#a89a78', I: '#a89a78', // adept hood cog, bone unless gilded
  // the room tiles (ui/art/room-*.png): floor grate, wall plates, sanctum, pillars, copper pipes, coolant, the gate's void,
  // the alarm beacon. 7 8 9 H K (sheen and rivet glints) are derived from their plate / seam unless a theme sets them.
  1: '#2b2d30', 2: '#141516', 3: '#383b3f', // floor: grate, gaps, lit lips
  4: '#2a2a2c', 5: '#2c2c2e', 6: '#18191b', 7: '#393838', 8: '#3a393a', 9: '#413f3e', // plates west / east, seams, sheens, rivet glint
  0: '#140f0c', A: '#100b08', // wall foot, dark walls between rooms
  D: '#301612', E: '#1e0c09', H: '#3e2520', K: '#46342f', N: '#3a110e', // sanctum: plates, seams, sheen, rivet glint, floor
  S: '#1c1d20', U: '#3a200c', V: '#141516', // pillar iron, deep brass shadow, iron shadow
  X: '#c8853a', Y: '#e8b070', Z: '#8a4f22', i: '#5a3214', // copper pipe: body, lit, shade, dark
  '!': '#2a8a50', '+': '#77d496', // coolant channel: edge, glowing core
  '@': '#060404', $: '#2a0a07', '%': '#4e110c', // the void beyond the gate: dark, ember, glow
  '&': '#c8281a', '*': '#5e1710', '-': '#3a0d09', '=': '#8c2c1c', // alarm beacon: lit dome, dark dome, dark rim, dull glint
  // the commit seals' wax (and the stamp's wax drop), the held scroll's writing
  '(': '#c8281a', ')': '#ff8a6a', '[': '#5e1710', ']': '#5a3c16',
  // skin, lit and shadow: faces and hands (unused by Tier II's hooded scribes; Neon Grid's crew)
  ':': '#c89a74', ';': '#8a6248',
};
// Slots blended from another (a plate's sheen, a seam's lit rivet): [base slot, [r, g, b, alpha] laid over it]. A theme
// that changes the base and not the blend gets it recomputed.
const OVER = { 7: ['4', [255, 240, 220, 0.07]], 8: ['5', [255, 240, 220, 0.07]], 9: ['6', [255, 240, 220, 0.18]],
  H: ['D', [255, 240, 220, 0.07]], K: ['E', [255, 240, 220, 0.18]] };
const over = (hex, [r, g, b, a]) => '#' + [r, g, b].map((c, i) => Math.round(c * a + parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) * (1 - a)).toString(16).padStart(2, '0')).join('');

// robe: scribe palette overrides; adept: adept palette overrides (x = hem/stripe trim).
const gilt = (r, R, d) => ({ r, R, d, z: '#e8b45a', j: '#6e3f17', t: '#e8b45a', T: '#b8742e', g: '#e8b45a', G: '#b8742e' });
const plain = (r, R, d) => ({ r, R, d, z: r, j: r, t: R, T: d, g: d, G: d });

const inkOf = px => ({
  // shared with the maps
  outline: px.k, brass: px.g, brassDark: px.G, brassLit: px.h, parchment: px.p, parchmentShade: px.P, bone: px.b,
  iron: px.m, ironDark: px.M, ironLit: px.l, phosphor: px.c, phosphorDark: px.C, glint: px.O,
  flame: px.f, flameCore: px.F, alarm: px.a, crimson: px.x,
  // weathering on the walls: scratches and cracks, their lit edge, the binary cant, grime stains (transparent to drop them)
  scratch: px.k, scratchSheen: 'rgba(255,240,220,.06)', cant: 'rgba(124,255,158,.38)', grime: 'rgba(10,6,4,.35)',
  // the background-shell cog's teeth (copper, as the room's pipes); the coolant channels' glow
  copperShade: px.Z, coolant: '#3aa864',
  // screens: the cogitator bank, the Magos's chest, an unlit desk slate
  screenHot: '#b8ffc8', screenDim: '#3aa864', screenMark: '#2a8a50', screenFlicker: 'rgba(22,48,31,.55)', screenOff: '#2e6b47',
  lampDead: '#1c1d20',
  // shadows under props and furniture
  shadow: 'rgba(0,0,0,.4)', shadowDeep: 'rgba(0,0,0,.45)',
  // paper, the red warning sheet
  parchmentWarn: '#d8a08a',
  // the stamp's wax drop, the compaction fire, smoke (rgb; alpha set where drawn)
  wax: px['('], ash: '#3a3430', flash: '#ffffff',
  smoke: '#beb4a4', sparkSmoke: '#c4bcae', steam: '#d6cebe',
  // test lamp: [bulb, shine] per state (scene.js lampColor)
  lamp: { on: [px.c, px.O], off: [px.C, '#2a8a50'], red: [px.a, '#ffd0b0'], dim: [px.x, '#c8281a'], dark: ['#3a0d09', '#5e1710'] },
  // the alarm beacon's sweep, the servo-skull's red eye and searchlight
  alarmGlow: '#ffd0b0', beaconSweep: '#ff6a4a', searchlight: '#ff321e',
  // windows by day and night (px overrides of MAPS.WINDOW and, for the tall gothic window, WINDOW_TALL's extra
  // lattice-gem red 'a')
  windowDay: { u: '#6a8fb0', v: '#8aa86a', g: '#e0b85a', x: '#b8423a', a: '#ff3a20' },
  windowNight: { u: '#3a2236', v: '#36401f', g: '#7a5a28', x: '#3a0d09', a: '#3a0d09' },
  // the riveted iron tile behind the scene (chrome.js)
  backdrop: '#17181b', backdropLit: '#24262a', backdropEdge: '#202226', backdropDark: '#0b0b0c',
  backdropSeam: '#101113', backdropSeamLit: '#1f2124', backdropRivet: '#3a3d42', backdropRivetLit: px.m,
  overflowPlaque: '#8a7a5c',
});

const LIGHT = {
  amber: 'rgba(240,168,60,.26)', green: 'rgba(124,255,158,.16)', red: 'rgba(200,40,28,.22)',
  burn: 'rgba(255,196,96,.5)', lampOn: 'rgba(124,255,158,.55)', lampRed: 'rgba(255,58,32,.6)', lampDim: 'rgba(255,58,32,.3)',
  stamp: 'rgba(255,58,32,.7)', spark: 'rgba(255,230,160,.8)', glint: 'rgba(232,180,90,.6)',
  beacon: 'rgba(255,58,32,.6)', beaconSweep: 'rgba(255,40,20,.4)', skullAlarm: 'rgba(255,58,32,.45)',
  night: '6,4,3', beam: '235,220,180', // rgb: the darkness over the hall, the daylight shafts (alpha set by lighting.js)
  shadow: '6,4,3', // rgb: shadows on the floor and ambient occlusion (depth.js)
};

// Tier II's wording, by key. {name} placeholders are filled by t(); [one, other] pairs pick by {n}. A setting that is
// not the 40k scriptorium replaces what it needs (an office: Director, requests, the break room, the logbook...).
// index.html marks its texts with data-t / data-t-title / data-t-aria (chrome.js applies them).
export const TEXT = {
  title: 'Administratum', subtitle: 'II · Data-Shrine of the Cult Mechanicus', motto: 'Knowledge is power, guard it well',
  rank: { high: 'Magos', standard: 'Tech-priest', novice: 'Novice' },
  status: { busy: 'Writing', shell: 'At the cogitator', idle: 'Turn done, awaiting orders', waiting: 'Petition at your door',
    background: 'Idle · background shell running', napping: 'Idle · dozing in the Refectorium' },
  petitions: ['{n} petition', '{n} petitions'], questions: ['{n} question', '{n} questions'], petitioning: '{n} petitioning',
  petitionLabel: '{name}, petition: {want}', adeptOf: '{kind} · adept of {owner}',
  overflow: '+{n} in the stacks', empty: 'No scribes on duty', breakout: 'Menial Pen',
  limitLabel: 'sealed · resets {time}', limitSealed: 'sealed',
  modes: { full: 'Full light', candles: 'Candles' },
  log: { title: 'Chronicon', open: 'Open the Chronicon', close: 'Close the Chronicon', silent: 'The Chronicon is silent: no record could be read for this day.' },
  tithe: { hint: 'Tithe today: tokens and working time', day: 'Tithe today: {tokens} tokens, {time} of work' },
  event: { commit: 'Commit sealed', push: 'Pushed', 'tests-pass': 'Tests pass', 'tests-fail': 'Tests fail', 'tool-error': 'Tool error',
    'task-done': 'Long task done', arrived: 'Arrived', left: 'Left', petition: 'Petition', 'petition-answered': 'Petition answered',
    compaction: 'Context compacted', limit: 'Usage limit' },
  prefs: { theme: 'Theme', chime: 'Petition chime', petitions: 'Petitions', questions: 'A question at the end of a turn counts as a petition',
    stale: 'Petition turns stale after', nap: 'Idle to the Refectorium after', cog: 'Stay at the cogitator for',
    pauseHint: 'Near-zero CPU when unseen; petitions still alert.',
    cat: { hall: 'Hall', petitions: 'Petitions', scribes: 'Scribes', system: 'System', remote: 'Remote view' } },
  // Windows notifications (main.rs, set_toast_text): {name} the session, then the body as today
  toast: { petition: 'Petition from {name}', question: 'Question from {name}', stale: 'Petition still waiting: {name}', needed: 'input needed',
    limit: '{name} sealed until {time}', limitMany: '{n} sessions sealed until {time}', failed: '{name}: open the terminal' },
  // Night Vigil (vigil.js): the night watchman's name, the header moon's title
  watch: { name: 'Inquisitor', button: 'Night Vigil: the Inquisitor shuts the PC down once every session waits on you' },
};
const merge = (a, b) => { // deep merge of plain objects (b wins), arrays replaced
  const out = { ...a };
  for (const [k, v] of Object.entries(b ?? {})) out[k] = v && typeof v === 'object' && !Array.isArray(v) && a?.[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) ? merge(a[k], v) : v;
  return out;
};

export const TIER_II = {
  id: 'tier2', world: 'w40k', name: 'Ordo Administratum',
  px: BASE,
  sash: ['#d9a84e', '#5fae7a', '#5a7ec9', '#c46a9a', '#c9b95a', '#6ac9c4', '#c97a4a', '#9a8ad9'],
  rank: {
    high: { robe: gilt('#6e120d', '#9a2a18', '#300806'), adept: { x: '#d9a84e', b: '#e8dcb8', J: '#e8b45a', I: '#6e3f17' } },
    standard: { robe: {}, adept: {} },
    novice: { robe: plain('#6e3a30', '#8a5244', '#43231c'), adept: { x: '#5a564c', q: '#8e8a7e', Q: '#5a564c', b: '#a8a496', J: '#8e8a7e', I: '#8e8a7e' } },
  },
  ink: inkOf,
  light: LIGHT,
  ui: {},
  text: TEXT,
};

// The settings a theme belongs to: Settings picks a world, then one of its themes as the style.
export const WORLDS = { w40k: 'Warhammer 40k', cyber: 'Cyberpunk', space: 'Space', arcane: 'Fantasy', vault: 'Fallout' };
// Registered themes by id. A theme: { id, world, name, px?, sash?, rank?, ink?, light? }, each part only what changes.
export const THEMES = { [TIER_II.id]: TIER_II };
export function defineTheme(t) { THEMES[t.id] = t; return t; }

// A theme over Tier II: px, light and the rank parts merged, ink derived from the merged px then overridden.
export function resolve(t) {
  if (t === TIER_II) return { id: t.id, name: t.name, px: { ...BASE }, sash: [...t.sash], rank: t.rank, ink: inkOf(BASE), light: { ...LIGHT }, ui: {}, text: TEXT };
  const px = { ...BASE, ...t.px }, rank = {};
  for (const [c, [base, layer]] of Object.entries(OVER)) if (!t.px?.[c] && t.px?.[base]) px[c] = over(px[base], layer);
  for (const [k, r] of Object.entries(TIER_II.rank)) rank[k] = { robe: { ...r.robe, ...t.rank?.[k]?.robe }, adept: { ...r.adept, ...t.rank?.[k]?.adept } };
  const ink = inkOf(px);
  if (t.ink) Object.assign(ink, typeof t.ink === 'function' ? t.ink(px) : t.ink);
  return { id: t.id, name: t.name, px, sash: t.sash ?? [...TIER_II.sash], rank, ink, light: { ...LIGHT, ...t.light }, ui: { ...t.ui }, text: merge(TEXT, t.text) };
}

// The active theme, read at draw time (T.ink.brass). T.px, T.ink and T.light are the same objects for the app's
// life, refilled on a theme change (every theme has the same keys), so `const I = T.ink` is safe to keep. Values in
// them (a colour, ink.lamp, ink.windowDay) are replaced: keep those only through themed().
export const T = { gen: 0, ...resolve(TIER_II) };
const listeners = new Set();

// Switches the hall to the theme with this id (unknown ids fall back to Tier II). Caches reset through onTheme.
export function setTheme(id) {
  const next = resolve(THEMES[id] ?? TIER_II);
  if (next.id === T.id) return;
  Object.assign(T.px, next.px); Object.assign(T.ink, next.ink); Object.assign(T.light, next.light);
  Object.assign(T, { id: next.id, name: next.name, sash: next.sash, rank: next.rank, ui: next.ui, text: next.text, gen: T.gen + 1 });
  for (const f of listeners) f(T);
}
// fn(T) after every theme change (drop caches drawn with the old colours).
export const onTheme = fn => { listeners.add(fn); return () => listeners.delete(fn); };
// A value built from the active theme, rebuilt once after each change: keeps a stable identity in between, so the
// sprite cache still finds override objects by identity.
export function themed(make) {
  let gen = -1, v;
  return () => (gen === T.gen ? v : (gen = T.gen, v = make(T)));
}
// '#rrggbb' + alpha -> 'rgba(r,g,b,a)'.
export const hexA = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

// The active theme's wording for a dotted key ('log.title'), placeholders filled from vars; an [one, other] pair picks
// by vars.n. An unknown key reads as itself, so a typo shows on screen instead of vanishing.
export function t(key, vars = {}) {
  let v = key.split('.').reduce((o, k) => o?.[k], T.text);
  if (Array.isArray(v)) v = v[vars.n === 1 ? 0 : 1];
  if (typeof v !== 'string') return key;
  return v.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
