// The themes beyond Tier II (theme.js), each only what it changes. Picked in Settings (adm.theme); the gallery renders
// any of them (node tools/sprite_sheet.mjs --theme <id>). Design and slot names: theme.js, ui/art/key.gpl.
import { defineTheme } from './theme.js';

// Ordo Machinum, hunters of the thinking machine. Molten industry: rust-dark plates, orange plasma in the floor channels, amber screens and cant.
defineTheme({
  id: 'forge', world: 'w40k', name: 'Ordo Machinum',
  px: { 4: '#2e2622', 5: '#302824', 6: '#1a1410', 1: '#2c2622', 2: '#15110e', 3: '#4e3422', D: '#3a1a10', E: '#22100a', N: '#2a0e08',
    '!': '#8a3a12', '+': '#ffb05a', c: '#ffb347', C: '#3a2008', o: '#ffb347', O: '#fff2d8', X: '#d0702a', Y: '#ffa860', Z: '#8a3e14', i: '#5a240a' },
  ink: { coolant: '#ff8a2a', screenHot: '#ffe0a8', screenDim: '#c87a2a', screenMark: '#8a4a18', screenFlicker: 'rgba(58,32,8,.55)', screenOff: '#7a4a20',
    cant: 'rgba(255,170,80,.38)' },
  light: { green: 'rgba(255,170,80,.16)', lampOn: 'rgba(255,190,110,.55)' },
  ui: { '--green': '#ffb347', '--yes': '#7a4a20', '--yes-deep': '#3a2008' },
  text: { subtitle: 'Ordo Machinum · Forge-archive of the Inquisition', motto: 'Trust not the thinking machine' },
});

// Cold and clinical: black-green robes, silver instead of brass, teal screens and coolant, cold candlelight.
defineTheme({
  id: 'xenos', world: 'w40k', name: 'Ordo Xenos',
  px: { r: '#1c2a24', R: '#2e4438', d: '#0e1612', t: '#2e4438', T: '#0e1612', z: '#1c2a24', j: '#1c2a24',
    g: '#9aa6a8', G: '#5a6466', h: '#d6e2e2', U: '#2a3233', w: '#2a2e30', W: '#181b1c', L: '#3c4244',
    4: '#1e2426', 5: '#202628', 6: '#101416', 1: '#1f2527', 2: '#0d1112', 3: '#2f3a3c', D: '#13261f', E: '#0a1612', N: '#0f2019', S: '#151a1c',
    X: '#6a7e80', Y: '#a6bcbe', Z: '#3e4a4c', i: '#262e30', '!': '#1f7a6a', '+': '#6fe0c8',
    c: '#6fffd8', C: '#0f2e28', o: '#6fffd8', O: '#e0fff8', f: '#bfe0ff', F: '#ffffff', x: '#2a6a5a' },
  rank: { high: { robe: { r: '#24382e', R: '#3c5a4a', d: '#12201a' } },
    novice: { robe: { r: '#3a3f3c', R: '#565c58', d: '#232725', z: '#3a3f3c', j: '#3a3f3c', t: '#565c58', T: '#232725' } } },
  ink: { coolant: '#2fb89a', screenHot: '#c8fff0', screenDim: '#2fb89a', screenMark: '#1f7a6a', screenOff: '#1f5a4e', cant: 'rgba(111,255,216,.32)' },
  light: { amber: 'rgba(170,215,255,.22)', green: 'rgba(111,255,216,.16)', burn: 'rgba(190,225,255,.5)' },
  ui: { '--bg': '#030606', '--bar': '#0b1110', '--edge': '#1e2a28', '--btn': '#0f1817', '--copper': '#9aa6a8', '--green': '#6fffd8',
    '--red': '#1f7a6a', '--pink': '#6fe0c8', '--blood': '#0f2e28', '--glow': '#2fb89a', '--wax': '#1f5a4e', '--wax-deep': '#0a1612',
    '--label': '#0a1612', '--label-sel': '#123028', '--label-btn': '#0d201b', '--plaque': '#0a1210', '--leather': '#3e4a4c', '--leather-deep': '#1c2224',
    '--rod-hi': '#c8d4d6', '--rod': '#7a8688', '--rod-lo': '#3a4446', '--rod-edge': '#161c1d', '--rod-cap': '#e6f0f0' },
  text: { subtitle: 'Ordo Xenos · Archive of the Inquisition', motto: 'Suffer not the alien to live' },
});

// Ordo Malleus, the vigil against the daemon: Grey Knight silver for brass, slate-blue robes, warded blue screens and
// coolant, pale violet witch-candles, the warp glowing beyond the gate. Kept dim and soft, easy on the eyes.
defineTheme({
  id: 'night', world: 'w40k', name: 'Ordo Malleus',
  px: { r: '#2a3040', R: '#3e4660', d: '#161a24', t: '#3e4660', T: '#161a24', z: '#2a3040', j: '#2a3040',
    g: '#a8b0bc', G: '#5e6674', h: '#dce2ea', U: '#2a303a', p: '#a8a28c', P: '#80785e', b: '#a09c8c', x: '#3a4a8a',
    c: '#8fb4e8', C: '#16203a', o: '#8fb4e8', O: '#d0e0ff', f: '#9a8ad0', F: '#d8d0f0',
    1: '#1e2028', 2: '#0c0e12', 3: '#2c3040', 4: '#1e2028', 5: '#20222a', 6: '#101218', D: '#1a1e30', E: '#0e1020', N: '#161a2c',
    X: '#7a8494', Y: '#aab4c4', Z: '#454c5a', i: '#2a2e38', '!': '#3a4a8a', '+': '#8a9ae0', $: '#1a0a2a', '%': '#3a1a5a' },
  rank: { high: { robe: { r: '#323a54', R: '#4a5478', d: '#1a1e30', z: '#dce2ea', t: '#dce2ea', T: '#a8b0bc', g: '#dce2ea', G: '#a8b0bc' } },
    novice: { robe: { r: '#3a3c42', R: '#54565e', d: '#222428', z: '#3a3c42', j: '#3a3c42', t: '#54565e', T: '#222428' } } },
  ink: { coolant: '#5a6ac0', screenHot: '#c8d8ff', screenDim: '#5a7ab0', screenMark: '#3a4a8a', screenFlicker: 'rgba(22,32,58,.55)',
    screenOff: '#2e3e6a', cant: 'rgba(143,180,232,.2)' },
  light: { amber: 'rgba(160,140,220,.16)', green: 'rgba(143,180,232,.1)', red: 'rgba(200,40,28,.14)', burn: 'rgba(190,180,240,.4)',
    lampOn: 'rgba(143,180,232,.3)' },
  ui: { '--bg': '#04050a', '--bar': '#0a0c14', '--edge': '#262c3c', '--btn': '#10131c', '--ink': '#b0b4c0', '--light': '#d0d6e0',
    '--dim': '#6e7688', '--copper': '#a8b0bc', '--green': '#8fb4e8', '--red': '#3a4a8a', '--pink': '#9aa8e8', '--blood': '#1a2040',
    '--glow': '#4a5ac0', '--wax': '#2e3a6a', '--wax-deep': '#10142a', '--label': '#0c0f1c', '--label-sel': '#1a2040',
    '--label-btn': '#121628', '--plaque': '#0a0c14', '--leather': '#454c5a', '--leather-deep': '#1e222a', '--yes': '#2e3e6a',
    '--yes-deep': '#16203a', '--card': '#a8a28c', '--paper': '#b0aa92', '--paper-edge': '#989078', '--paper-hi': '#bcb69e',
    '--paper-q': '#b0b4c0', '--rod-hi': '#c8d0dc', '--rod': '#7a8494', '--rod-lo': '#3a404a', '--rod-edge': '#161a20', '--rod-cap': '#e6ecf4' },
  text: { subtitle: 'Ordo Malleus · Night vigil of the Inquisition', motto: 'The hammer falls in the dark' },
});

// Ordo Hereticus, whose witch-light leaves no shadow: black, bone and blood red, the screens and coolant burning like
// a pyre. Accessibility first: pure black outlines, a lighter floor, bright robes, colour-blind-safe departments
// (Okabe-Ito), no wall weathering, strong glows, a high-contrast frame.
defineTheme({
  id: 'contrast', world: 'w40k', name: 'Ordo Hereticus',
  px: { k: '#000000', 1: '#3a3a3e', 2: '#0a0a0c', 3: '#5e5e64', 4: '#38363a', 5: '#3a383c', r: '#9a1a10', R: '#d0382a', d: '#4a0a06',
    g: '#e0b040', G: '#8a6010', h: '#ffe080', p: '#f4ead0', P: '#c0ac80', b: '#f0e8d8',
    c: '#ffc040', C: '#3a1a00', o: '#ffc040', O: '#fff4d0', f: '#ff8a20', F: '#fff0a0',
    D: '#4a1410', E: '#200806', N: '#3a0c08', '!': '#c03a10', '+': '#ffa040', '%': '#a02010' },
  sash: ['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7', '#ffffff'],
  ink: { cant: 'rgba(0,0,0,0)', grime: 'rgba(0,0,0,0)', scratchSheen: 'rgba(0,0,0,0)', scratch: '#0e0a08',
    coolant: '#ff6a20', screenHot: '#fff0b0', screenDim: '#e08a20', screenMark: '#a04a10', screenFlicker: 'rgba(58,26,0,.55)', screenOff: '#7a3a10' },
  light: { amber: 'rgba(255,150,40,.36)', green: 'rgba(255,192,64,.22)', burn: 'rgba(255,170,60,.6)', lampOn: 'rgba(255,192,64,.55)' },
  ui: { '--bg': '#000000', '--bar': '#000000', '--ink': '#f4ead0', '--dim': '#c8b890', '--edge': '#8a7a5c', '--red': '#ff3a20', '--pink': '#ffb0a0',
    '--green': '#ffc040', '--copper': '#e0b040', '--blood': '#6a0e08', '--glow': '#ff3a20', '--yes': '#7a3a10', '--yes-deep': '#3a1a00',
    '--label': '#000000', '--paper-ink': '#000000', '--paper-ink-2': '#2a1a08', '--paper-ink-3': '#1a1006' },
  text: { subtitle: 'Ordo Hereticus · Witch-light of the Inquisition', motto: 'Innocence proves nothing' },
});

// Not the 40k scriptorium: a neon netrunner den. Hooded robes read as hoodies, optics as visors; brass turns to chrome
// cyan, copper pipes to magenta neon tubes, coolant to violet floor light, parchment panels to dark glass. Its own art
// replaces what only fits 40k (ui/art/cyber/: skull banners, the Cog, the servo-skull...).
const NEON = defineTheme({
  id: 'cyber', world: 'cyber', name: 'Neon Grid',
  art: ['walls', 'sanctum', 'skull', 'gate', 'cogitator', 'scribe', 'adept', 'magos', 'workstations', 'fire', 'petitions', 'commits', 'room-doors', 'clutter', 'room-floor', 'room-walls', 'room-pipes', 'refectorium'], // ui/art/cyber/: neon signs, the hex-chip emblem, the drone, the shutter gate, the terminal bank, the hacker crew, the hologram daemons and the fixer, battlestations and a cyberdeck, oil drums, datapads, holo-stickers, sliding doors, a server rack and data-rod clutter, a neon-grid floor and panelled walls under neon tubes, neon tube runs on dark clips
  px: {
    k: '#05040a', e: '#08060e', n: '#0a0812',
    r: '#1c1a2a', R: '#2e2c44', d: '#0e0c18', t: '#ff2e88', T: '#0e0c18', z: '#ff2e88', j: '#ffd0ea', // hoodie, neon trim
    g: '#2fb8d8', G: '#155a78', h: '#9af0ff', U: '#0a2a3a', // chrome cyan for brass
    m: '#4a4a66', M: '#22223a', l: '#7a7aa0', V: '#0e0e1c',
    p: '#d8dcec', P: '#9aa0bc', b: '#c8ccdc', B: '#8a8ea4', s: '#a0a4bc', ':': '#e0a888', ';': '#9a6450', q: '#b0b4c8', Q: '#6a6e88', J: '#3af0ff', I: '#3af0ff',
    w: '#2a2440', W: '#16121f', L: '#3e3658', u: '#1a2a5a', v: '#1a3a3a',
    c: '#3af0ff', C: '#06222c', o: '#ff2e88', O: '#ffd0ea', x: '#ff2e88', a: '#ff2040',
    1: '#14141f', 2: '#07070c', 3: '#2a2a3e', 4: '#16142a', 5: '#181630', 6: '#0b0a18', 0: '#0a0814', A: '#08060f',
    D: '#1e0e2a', E: '#10061a', N: '#160a24', S: '#121224',
    X: '#ff2e88', Y: '#ffa0d0', Z: '#a01858', i: '#5a0c32', '!': '#4a1a7a', '+': '#d88aff',
    '@': '#020206', $: '#1a0a2a', '%': '#3a1a5a', '*': '#3a0a1a', '-': '#1a040c', '=': '#5a1a2a',
    '(': '#ff2e88', ')': '#ffa0d0', '[': '#7a0a3a', ']': '#2a2a44',
  },
  sash: ['#ff2e88', '#3af0ff', '#b4ff3a', '#ffd23a', '#b04aff', '#ff7a2e', '#2effc0', '#ff5aff'],
  rank: {
    high: { robe: { r: '#1a1030', R: '#30205a', d: '#0c0618', z: '#3af0ff', j: '#e0fcff', t: '#3af0ff', T: '#155a78', g: '#3af0ff', G: '#155a78' },
      adept: { x: '#ffd23a', b: '#e8ecff', J: '#ffd23a', I: '#fff4c0' } },
    novice: { robe: { r: '#2a2a32', R: '#3e3e4a', d: '#16161c', z: '#6a6a7a', j: '#6a6a7a', t: '#3e3e4a', T: '#16161c', g: '#16161c', G: '#16161c' },
      adept: { x: '#6a6a7a', q: '#8a8a98', Q: '#4a4a56', b: '#a0a0ac', J: '#8a8a98', I: '#8a8a98' } },
  },
  ink: {
    coolant: '#b04aff', screenHot: '#c8faff', screenDim: '#1aa0c0', screenMark: '#106078', screenFlicker: 'rgba(6,34,44,.55)', screenOff: '#0e4050',
    cant: 'rgba(255,46,136,.34)', grime: 'rgba(20,10,40,.4)', scratchSheen: 'rgba(150,200,255,.06)',
    parchmentWarn: '#ffa0c8',
    smoke: '#8a8aa8', sparkSmoke: '#9a9ab8', steam: '#a8a0d0', alarmGlow: '#ffc0d0', beaconSweep: '#ff7090', searchlight: '#ff2e88',
    windowDay: { u: '#2a4a8a', v: '#5a2a7a', g: '#ff2e88', x: '#3af0ff' }, windowNight: { u: '#0e0820', v: '#2a0a3a', g: '#ff2e88' },
    backdrop: '#0b0a16', backdropLit: '#16142a', backdropEdge: '#121022', backdropDark: '#050409', backdropSeam: '#08070f', backdropSeamLit: '#141228',
    backdropRivet: '#2a2848', overflowPlaque: '#7a7aa8',
  },
  light: { amber: 'rgba(255,46,136,.24)', green: 'rgba(58,240,255,.18)', red: 'rgba(255,32,64,.22)', lampOn: 'rgba(58,240,255,.5)',
    glint: 'rgba(58,240,255,.6)', spark: 'rgba(200,250,255,.8)', night: '4,3,12', beam: '120,150,255' },
  ui: {
    '--bg': '#04030a', '--bar': '#0b0918', '--ink': '#c8d0ff', '--dim': '#6a70a0', '--light': '#e8ecff', '--edge': '#2a2448', '--btn': '#120f24',
    '--copper': '#3af0ff', '--outline': '#05040a', '--bone': '#c8ccdc', '--iron': '#5a5a7a', '--green': '#3af0ff',
    '--red': '#ff2e88', '--pink': '#ff8ac0', '--blood': '#3a0a2a', '--glow': '#ff2e88', '--wax': '#a0105a', '--wax-deep': '#2a0418',
    '--alarm': '#ff2040', '--flame': '#ffe0f0', '--label': '#0e0818', '--label-sel': '#24103a', '--label-btn': '#160a24', '--plaque': '#0a0814',
    '--yes': '#1a6a7a', '--yes-deep': '#06222c',
    // dark glass instead of parchment
    '--card': '#151330', '--paper': '#1a1840', '--paper-edge': '#100e28', '--paper-hi': '#24205a', '--paper-tab': '#1c1940', '--paper-q': '#2a2450',
    '--paper-shade': '#5a5a8a', '--paper-line': '#3a3a7a', '--paper-ink': '#e0e4ff', '--paper-ink-2': '#9aa0d8', '--paper-ink-3': '#7a80c0',
    '--paper-err': '#ff5a8a', '--leather': '#2a2458', '--leather-deep': '#120f2a', '--chart-new': '#ff2e88', '--chart-cache': '#3af0ff',
    '--rod-hi': '#ff8ac0', '--rod': '#ff2e88', '--rod-lo': '#7a0a4a', '--rod-edge': '#1a0410', '--rod-cap': '#ffd0ea',
    // terminal type for titles, hot pink over the glass
    '--display': "'VT323', monospace", '--paper-accent': '#ff2e88',
  },
  text: {
    subtitle: 'Sector 7 · Netrunner Den', motto: 'Jack in, stay frosty',
    rank: { high: 'Netrunner', standard: 'Hacker', novice: 'Script kiddie' },
    status: { busy: 'Coding', shell: 'At the server rack', idle: 'Turn done, awaiting input', waiting: 'Request pinged',
      background: 'Idle · daemon running', napping: 'Idle · crashed in the lounge' },
    petitions: ['{n} request', '{n} requests'], petitioning: '{n} pinging', petitionLabel: '{name}, request: {want}',
    adeptOf: '{kind} · daemon of {owner}', overflow: '+{n} in cold storage', empty: 'No runners jacked in',
    modes: { full: 'Daylight', candles: 'Neon only' },
    log: { title: 'Netlog', open: 'Open the Netlog', close: 'Close the Netlog', silent: 'The Netlog is empty: no record could be read for this day.' },
    tithe: { hint: 'Bandwidth today: tokens and uptime', day: 'Bandwidth today: {tokens} tokens, {time} of uptime' },
    event: { commit: 'Commit signed', petition: 'Request', 'petition-answered': 'Request answered', compaction: 'Cache flushed', limit: 'Throttled' },
    prefs: { chime: 'Request ping', petitions: 'Requests', questions: 'A question at the end of a turn counts as a request',
      stale: 'Request goes stale after', nap: 'Idle to the lounge after', cog: 'Stay at the server rack for',
      pauseHint: 'Near-zero CPU when unseen; requests still alert.',
      cat: { hall: 'Den', petitions: 'Requests', scribes: 'Runners', system: 'System', remote: 'Remote access' } },
    limitLabel: 'throttled · back at {time}', limitSealed: 'throttled',
    toast: { petition: 'Request from {name}', stale: 'Request still waiting: {name}', limit: '{name} throttled until {time}', limitMany: '{n} runners throttled until {time}' },
  },
});

// A white orbital station, not 40k: off-white hull panels, safety orange and blue accents, cyan screens, Earth
// seen through the windows. Its own art (later tasks) replaces what only fits 40k.
defineTheme({
  id: 'orbital', world: 'space', name: 'Orbital Station',
  art: ['scribe', 'adept', 'magos', 'sanctum', 'workstations', 'cogitator', 'walls', 'skull', 'gate', 'fire', 'petitions', 'commits', 'clutter', 'refectorium', 'room-floor', 'room-walls', 'room-doors', 'room-pipes'], // ui/art/orbital/: the astronaut crew, floating helper bots, the Commander with his robotic arm, the command chair, console and mission patches, crew flight consoles, a rack terminal and a strapped-down laptop, the flight-control screen wall, portholes, a mission poster, stowage nets, pressure gauges and pendant LED lamps, the floating camera drone, the airlock with its sliding hatch and the starfield beyond, air scrubbers and LED light strips, checklist cards and a clipboard, mission stickers on flight tags and the label scanner, velcroed checklists, cargo bags, strapped manuals, drifting pages and cargo containers, the galley food warmer and drink dispenser, galley tables and padded benches with foot loops, grid deck plates with LED floor strips, the command deck, the hatch tunnel floor, the module joint ring, padded wall cushions with handrails, galley stowage lockers, navy command-module padding, white columns, bulkhead posts, a rotating warning light, sliding module hatches with hazard-striped pockets and status lamps, cable trays on hangers and flex air ducts with clamp rings
  px: {
    k: '#0c0e14', e: '#141822', n: '#0a0c12',
    r: '#2a4a8a', R: '#3a62b0', d: '#16284e', t: '#ff7a1a', T: '#16284e', z: '#ff7a1a', j: '#ffe0c0', // flight suit, orange trim
    g: '#2a5ab8', G: '#1a3a78', h: '#6a9ae0', U: '#102050', // blue accent for brass
    m: '#5a5e68', M: '#2e3038', l: '#a0a4ac', V: '#1a1c22',
    p: '#d8dce2', P: '#a8aeb8', b: '#c8ccd4', B: '#9aa0aa', s: '#a8aeb8', ':': '#e0a888', ';': '#9a6450', q: '#c8ccd4', Q: '#8a8ea0', J: '#5ad8ff', I: '#eaffff', // the bot's eye light
    w: '#242836', W: '#121420', L: '#5a5e68', u: '#2a6ad8', v: '#3a8a4a',
    c: '#5ad8ff', C: '#08202c', o: '#5ad8ff', O: '#eaffff', f: '#fff0d0', F: '#ffffff', x: '#ff7a1a', a: '#ff3a20',
    1: '#a8aeb8', 2: '#3a3e46', 3: '#d8dce2', 4: '#d8dce2', 5: '#a8aeb8', 6: '#3a3e46', 0: '#141822', A: '#0c0e14',
    D: '#16284e', E: '#0c1830', N: '#0c1830', S: '#5a5e68',
    X: '#ff7a1a', Y: '#ffb380', Z: '#b85a10', i: '#6a3208', '!': '#1a6a8a', '+': '#5ad8ff',
    '@': '#050814', $: '#0a1428', '%': '#142850', '*': '#8a3a10', '-': '#4a1e08', '=': '#ffa860', '&': '#ff7a1a',
    '(': '#ff7a1a', ')': '#ffb380', '[': '#8a3a10', ']': '#2e3a50',
  },
  sash: ['#ff7a1a', '#5ad8ff', '#2a5ab8', '#ffc83a', '#3a8a4a', '#ff5a5a', '#9ab8ff', '#d8dce2'],
  rank: {
    high: { robe: { r: '#16284e', R: '#2a4a8a', d: '#0a1428', z: '#ffc83a', j: '#fff4c0', t: '#ffc83a', T: '#8a6010', g: '#ffc83a', G: '#8a6010' },
      adept: { x: '#ffc83a', b: '#fff4c0', J: '#ffc83a', I: '#fff4c0' } },
    novice: { robe: { r: '#4a4e58', R: '#6a6e78', d: '#2a2e36', z: '#6a6e78', j: '#9aa0aa', t: '#6a6e78', T: '#2a2e36', g: '#2a2e36', G: '#2a2e36' },
      adept: { x: '#6a6e78', q: '#8a8e98', Q: '#4a4e58', b: '#9aa0aa', J: '#8a8e98', I: '#8a8e98' } },
  },
  ink: {
    coolant: '#5ad8ff', screenHot: '#eaffff', screenDim: '#2a8ab0', screenMark: '#1a5a78', screenFlicker: 'rgba(8,32,44,.55)', screenOff: '#145a70',
    cant: 'rgba(0,0,0,0)', grime: 'rgba(10,12,16,.25)', scratchSheen: 'rgba(255,255,255,.08)',
    parchmentWarn: '#ffb380',
    smoke: '#c8ccd4', sparkSmoke: '#d8dce2', steam: '#e8ecf0', alarmGlow: '#ffd0a0', beaconSweep: '#ff9a4a', searchlight: '#ff7a1a',
    // the porthole's glass: Earth's limb by day; by night its dark side, the ocean specks and space dots turn to stars
    windowDay: { u: '#2a6ad8', v: '#3a8a4a', G: '#eef4fa', x: '#5ad8ff', g: '#eef4fa', h: '#0a0c12' },
    windowNight: { u: '#070b18', v: '#08101e', G: '#070b18', x: '#12224a', g: '#c8d8ff', h: '#ffffff' },
    backdrop: '#0c0e16', backdropLit: '#181c28', backdropEdge: '#141620', backdropDark: '#08090e', backdropSeam: '#0a0c12', backdropSeamLit: '#1a1e2a',
    backdropRivet: '#3a3e46', overflowPlaque: '#8a8ea0',
  },
  light: { amber: 'rgba(255,122,26,.24)', green: 'rgba(90,216,255,.18)', red: 'rgba(255,74,26,.22)', lampOn: 'rgba(90,216,255,.5)',
    glint: 'rgba(90,216,255,.6)', spark: 'rgba(234,255,255,.8)', night: '5,8,20', beam: '255,240,208' },
  ui: {
    '--bg': '#0a0e18', '--bar': '#12182a', '--ink': '#d8dce2', '--dim': '#7a8292', '--light': '#f0f2f6', '--edge': '#2a3040', '--btn': '#161c2c',
    '--copper': '#2a5ab8', '--outline': '#0c0e14', '--bone': '#d8dce2', '--iron': '#5a5e68', '--green': '#5ad8ff',
    '--red': '#ff7a1a', '--pink': '#ffb380', '--blood': '#8a3a10', '--glow': '#ff7a1a', '--wax': '#ff7a1a', '--wax-deep': '#4a1e08',
    '--alarm': '#ff3a20', '--flame': '#fff0d0', '--label': '#10141e', '--label-sel': '#1a2440', '--label-btn': '#141a2a', '--plaque': '#0c0e16',
    '--yes': '#2a6ad8', '--yes-deep': '#0a1428',
    // white-grey station panels instead of parchment or dark glass
    '--card': '#d8dce2', '--paper': '#e4e8ec', '--paper-edge': '#a8aeb8', '--paper-hi': '#f0f2f6', '--paper-tab': '#c8ccd4', '--paper-q': '#dde1e6',
    '--paper-shade': '#9aa0aa', '--paper-line': '#6a7078', '--paper-ink': '#161a22', '--paper-ink-2': '#3a3e46', '--paper-ink-3': '#5a5e68',
    '--paper-err': '#b83a10', '--leather': '#3a3e46', '--leather-deep': '#1c1e24', '--chart-new': '#ff7a1a', '--chart-cache': '#5ad8ff',
    '--rod-hi': '#f0f2f6', '--rod': '#a8aeb8', '--rod-lo': '#5a5e68', '--rod-edge': '#2a2e36', '--rod-cap': '#f0f2f6',
    // terminal type for titles, blue accent over the white card
    '--display': "'VT323', monospace", '--paper-accent': '#2a5ab8',
  },
  text: {
    subtitle: 'Low Earth Orbit · Station Deck', motto: 'Ad astra',
    rank: { high: 'Commander', standard: 'Astronaut', novice: 'Cadet' },
    status: { busy: 'Working', shell: 'At the airlock', idle: 'Turn done, awaiting input', waiting: 'Calling the Commander',
      background: 'Idle · bot on task', napping: 'Idle · asleep in the bunk' },
    petitions: ['{n} call', '{n} calls'], petitioning: '{n} calling', petitionLabel: '{name}, call: {want}',
    adeptOf: '{kind} · bot of {owner}', overflow: '+{n} in the hab module', empty: 'No crew aboard',
    modes: { full: 'Cabin lights', candles: 'Night cycle' },
    log: { title: 'Flight log', open: 'Open the flight log', close: 'Close the flight log', silent: 'The flight log is empty: no record could be read for this day.' },
    tithe: { hint: 'Telemetry today: tokens and mission time', day: 'Telemetry today: {tokens} tokens, {time} of mission time' },
    event: { commit: 'Commit uplinked', petition: 'Call', 'petition-answered': 'Call answered', compaction: 'Memory purged', limit: 'Grounded' },
    prefs: { chime: 'Call chime', petitions: 'Calls', questions: 'A question at the end of a turn counts as a call',
      stale: 'Call goes stale after', nap: 'Idle to the bunk after', cog: 'Stay at the airlock for',
      pauseHint: 'Near-zero CPU when unseen; calls still alert.',
      cat: { hall: 'Deck', petitions: 'Calls', scribes: 'Crew', system: 'System', remote: 'Remote access' } },
    limitLabel: 'grounded · relaunch {time}', limitSealed: 'grounded',
    toast: { petition: 'Call from {name}', stale: 'Call still waiting: {name}', limit: '{name} grounded until {time}', limitMany: '{n} crew grounded until {time}' },
  },
});

// Accents of Neon Grid, as the Ordos are of Tier II: the same den, art and wording, its colours moved hue band by hue
// band (bands: the pink neon, the violet coolant, the night blue of its walls, the cyan chrome and screens), each to
// [hue, saturation x, lightness +]. The alarm red, skin, gold rank trim and the department sashes keep their colours.
const BANDS = [['pink', 300, 345], ['violet', 260, 300], ['night', 210, 260], ['cyan', 165, 210]];
function rehue(rgb, bands) {
  const [r, g, b] = rgb.map(c => c / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  if (!d) return rgb;
  const h = 60 * (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4);
  const to = bands[BANDS.find(([, lo, hi]) => h >= lo && h < hi)?.[0]];
  if (!to) return rgb;
  const [H, sx = 1, dl = 0] = to, L = Math.min(1, Math.max(0, l + dl)), S = Math.min(1, d / (1 - Math.abs(2 * l - 1)) * sx);
  const a = S * Math.min(L, 1 - L), k = n => (n + H / 30) % 12;
  return [0, 8, 4].map(n => Math.round(255 * (L - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))));
}
// Every '#rrggbb', 'rgba(r,g,b,a)' and 'r,g,b' in a theme part, rehued.
const recolour = (v, bands) => typeof v === 'string'
  ? v.replace(/#([0-9a-f]{6})/gi, (m, x) => '#' + rehue([0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16)), bands).map(n => n.toString(16).padStart(2, '0')).join(''))
    .replace(/(\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})/g, (m, ...c) => rehue(c.slice(0, 3).map(Number), bands).join(','))
  : v && typeof v === 'object' ? (Array.isArray(v) ? v.map(x => recolour(x, bands)) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, recolour(x, bands)])))
  : v;
function accent(base, { bands, text, ...t }) {
  const { px: { ':': skin, ';': shade, ...px }, rank, ink, light, ui } = base;
  const c = recolour({ px, rank, ink, light, ui }, bands);
  return defineTheme({ world: base.world, artOf: base.id, sash: base.sash, ...c, ...t, px: { ...c.px, ':': skin, ';': shade, ...t.px },
    text: { ...base.text, ...text } });
}

// Corpo Tower: a megacorp's netsec floor. Black glass, blood-red neon, white chrome and white screens.
accent(NEON, {
  id: 'corpo', name: 'Corpo Tower',
  bands: { pink: [356, 1, -0.04], violet: [352, 0.9, -0.06], night: [0, 0.12], cyan: [210, 0.1, 0.2] },
  text: { subtitle: 'Tower 42 · Corporate netsec floor', motto: 'The company owns the night' },
});

// Rain City: the lower levels in the rain. Sodium-amber neon, teal screens, burnt-orange coolant, blue-green smog.
accent(NEON, {
  id: 'rain', name: 'Rain City',
  bands: { pink: [30, 1, 0.02], violet: [18, 0.8, -0.04], night: [196, 0.7], cyan: [174, 0.75, -0.04] },
  text: { subtitle: 'Lower Levels · Night market den', motto: 'It never stops raining down here' },
});

// Green Code: the mainframe seen from inside. Every neon, screen and wall turned phosphor green on black.
accent(NEON, {
  id: 'matrix', name: 'Green Code',
  bands: { pink: [128, 1, 0], violet: [150, 0.8, -0.06], night: [140, 0.5, -0.02], cyan: [105, 0.9, 0.04] },
  text: { subtitle: 'Mainframe · Green-code terminal', motto: 'Follow the white rabbit' },
});

// Sunset Drive: synthwave. A purple dusk, magenta neon, the chrome and screens a sunset orange.
accent(NEON, {
  id: 'synth', name: 'Sunset Drive',
  bands: { pink: [318, 1, 0.02], violet: [285, 1, 0.02], night: [272, 1.4, 0.01], cyan: [28, 1, 0.02] },
  text: { subtitle: 'Outrun Strip · Midnight arcade', motto: 'Drive into the sunset' },
});

// A wizards' tower, not 40k: night-blue stone, warm wood, gold trim, violet and teal arcane glow, candles,
// parchment. Its own art (later tasks) replaces what only fits 40k.
defineTheme({
  id: 'tower', world: 'arcane', name: 'Arcane Tower',
  art: ['scribe', 'adept', 'magos', 'sanctum', 'workstations', 'cogitator', 'walls', 'skull', 'gate', 'fire', 'commits', 'petitions', 'clutter', 'refectorium', 'room-floor', 'room-walls', 'room-doors', 'room-pipes'], // ui/art/tower/: apprentices in pointed hats, wisp-owl familiars, the Archmage on his carved high seat, spellbook lectern, sigil circle, rune seals, alchemist tables and slant-top desks with glowing grimoires, scrying crystals, the orrery wall, round-arched leaded windows, tower tapestries, potion shelves, hourglasses, lanterns, the bat-winged floating eye, the runic arch with plank doors on a portal, cauldrons over log fires, candle clusters in a gold dish, grimoire piles with clasps, a basket of scrolls, rune pages, an iron-bound chest, ribboned letters under wax rune seals, a scroll on wooden rollers, signet rings, the kitchen stove with its brass kettle, a trestle table and split-log benches, square flagstones, glowing rune lines, the sanctum's mosaic with its inlaid ring, coursed stone masonry under a dentil cornice, stone columns and half-columns, the magic crystal on its gold sconce, arched oak doors, oak beams on iron brackets
  px: {
    k: '#0a0a12', e: '#12141f', n: '#0a0a12',
    r: '#3a2a6a', R: '#5a46a0', d: '#1e1438', t: '#c0c4d0', T: '#5a5e68', z: '#c0c4d0', j: '#8a8e98', // apprentice robe, silver stars
    g: '#d8a83a', G: '#8a6418', h: '#ffd870', U: '#5a3a10', // gold trim
    m: '#2a3048', M: '#1a1e30', l: '#3e4664', V: '#10121f',
    p: '#e0d0a0', P: '#a89868', b: '#d8c8a0', B: '#8a7850', s: '#c8b888', ':': '#e8b890', ';': '#a06a50', q: '#c8b888', Q: '#6a5840', J: '#3ad8c8', I: '#eafcf8', // familiar's glow
    w: '#6a4428', W: '#3e2614', L: '#8a5e38', u: '#2a3a6a', v: '#2a5a4a',
    c: '#3ad8c8', C: '#0f3a34', o: '#3ad8c8', O: '#eafffa', f: '#ffb050', F: '#fff0b0', x: '#9a5aff', a: '#ff4a30',
    1: '#3a3e58', 2: '#14151f', 3: '#565c7a', 4: '#30344a', 5: '#363a52', 6: '#181a28', 0: '#14151f', A: '#0e0f16',
    D: '#2a1e4a', E: '#160f28', N: '#241536', S: '#2a2e44',
    X: '#6a4428', Y: '#8a5e38', Z: '#4a2e18', i: '#2e1a0c', '!': '#5a3aa0', '+': '#9a5aff',
    '@': '#0a0515', $: '#2a1050', '%': '#5a2a9a', '*': '#4a2a6a', '-': '#2a1a40', '=': '#c89aff', '&': '#9a5aff',
    '(': '#9a5aff', ')': '#c8a0ff', '[': '#4a2a6a', ']': '#4a3018',
  },
  sash: ['#9a5aff', '#3ad8c8', '#d8a83a', '#ffb050', '#e0d0a0', '#ff5a5a', '#8ab8ff', '#7adca0'],
  rank: {
    high: { robe: { r: '#241848', R: '#3e2e78', d: '#120a28', z: '#ffd870', j: '#8a6418', t: '#ffd870', T: '#8a6418', g: '#ffd870', G: '#8a6418' },
      adept: { x: '#ffd870', b: '#fff4d0', J: '#ffd870', I: '#fff4d0' } },
    novice: { robe: { r: '#4a3424', R: '#6a4e38', d: '#2a1c12', z: '#4a3424', j: '#4a3424', t: '#6a4e38', T: '#2a1c12', g: '#2a1c12', G: '#2a1c12' },
      adept: { x: '#6a5840', q: '#8a7858', Q: '#4a3828', b: '#9a8868', J: '#8a7858', I: '#c9bfa0' } },
  },
  ink: {
    coolant: '#3ad8c8', screenHot: '#eafffa', screenDim: '#1a8a7a', screenMark: '#14645a', screenFlicker: 'rgba(10,40,36,.55)', screenOff: '#1a4a44',
    cant: 'rgba(0,0,0,0)', grime: 'rgba(10,8,16,.3)', scratchSheen: 'rgba(255,240,220,.08)',
    parchmentWarn: '#c89060',
    smoke: '#c8c0b0', sparkSmoke: '#d0c8c0', steam: '#dcd4c8', alarmGlow: '#c89aff', beaconSweep: '#9a5aff', searchlight: '#3ad8c8',
    // the arched window's leaded glass: blue sky, green hills, a round sun by day; by night indigo, stars, a crescent moon
    windowDay: { u: '#5a8cc8', v: '#4a7a48', g: '#ffe080', h: '#ffe080', x: '#5a8cc8' },
    windowNight: { u: '#181a3c', v: '#10122a', g: '#e8e4d0', h: '#181a3c', x: '#c8c8f0' },
    backdrop: '#141024', backdropLit: '#201a38', backdropEdge: '#1a1630', backdropDark: '#0a0814', backdropSeam: '#0e0a1c', backdropSeamLit: '#1e1836',
    backdropRivet: '#3a2a6a', overflowPlaque: '#8a7aa0',
  },
  light: { amber: 'rgba(255,176,80,.24)', green: 'rgba(58,216,200,.18)', red: 'rgba(255,74,48,.22)', lampOn: 'rgba(58,216,200,.5)',
    glint: 'rgba(154,90,255,.6)', spark: 'rgba(255,240,176,.8)', night: '6,4,12', beam: '200,170,255' },
  ui: {
    '--bg': '#0e0c1a', '--bar': '#181430', '--ink': '#e4d8b8', '--dim': '#8a7fa0', '--light': '#f0e8d0', '--edge': '#2e2650', '--btn': '#201a3a',
    '--copper': '#d8a83a', '--outline': '#0a0a12', '--bone': '#e0d0a0', '--iron': '#3e4664', '--green': '#3ad8c8',
    '--red': '#ff4a30', '--pink': '#ff9a80', '--blood': '#6a1c10', '--glow': '#9a5aff', '--wax': '#9a5aff', '--wax-deep': '#2a1a40',
    '--alarm': '#ff3a20', '--flame': '#fff0b0', '--label': '#120f22', '--label-sel': '#241c40', '--label-btn': '#1c1632', '--plaque': '#141024',
    '--yes': '#3ad8c8', '--yes-deep': '#0f3a34',
    // warm parchment cards instead of white panels or dark glass
    '--card': '#e0d0a0', '--paper': '#e8dcb0', '--paper-edge': '#b8a878', '--paper-hi': '#f4ecc8', '--paper-tab': '#d8c89c', '--paper-q': '#e4d6ac',
    '--paper-shade': '#a89868', '--paper-line': '#8a7850', '--paper-ink': '#2a1e14', '--paper-ink-2': '#4a3828', '--paper-ink-3': '#6a5840',
    '--paper-err': '#a03010', '--leather': '#3e2614', '--leather-deep': '#201206', '--chart-new': '#9a5aff', '--chart-cache': '#3ad8c8',
    '--rod-hi': '#ffd870', '--rod': '#d8a83a', '--rod-lo': '#8a6418', '--rod-edge': '#4a3a10', '--rod-cap': '#fff4d0',
    // blackletter type for titles, dark violet accent over the parchment
    '--display': "'Pirata One', serif", '--paper-accent': '#5a3a9a',
  },
  text: {
    subtitle: 'The Tower · Hall of Apprentices', motto: 'Knowledge is power',
    rank: { high: 'Archmage', standard: 'Wizard', novice: 'Apprentice' },
    status: { busy: 'Scribing spells', shell: 'At the scrying orb', idle: 'Turn done, awaiting input', waiting: 'Pleading to the Archmage',
      background: 'Idle · familiar at work', napping: 'Idle · dozing by the fire' },
    petitions: ['{n} plea', '{n} pleas'], petitioning: '{n} pleading', petitionLabel: '{name}, plea: {want}',
    adeptOf: '{kind} · familiar of {owner}', overflow: '+{n} in the library', empty: 'No apprentices at work',
    modes: { full: 'Daylight', candles: 'Candlelight' },
    log: { title: 'Grimoire', open: 'Open the Grimoire', close: 'Close the Grimoire', silent: 'The Grimoire is blank: no record could be read for this day.' },
    tithe: { hint: 'Mana spent today: tokens and time', day: 'Mana spent today: {tokens} tokens, {time} of study' },
    event: { commit: 'Spell sealed', petition: 'Plea', 'petition-answered': 'Plea answered', compaction: 'Memory distilled' },
    prefs: { chime: 'Plea chime', petitions: 'Pleas', questions: 'A question at the end of a turn counts as a plea',
      stale: 'Plea goes stale after', nap: 'Idle to the fireside after', cog: 'Stay at the scrying orb for',
      pauseHint: 'Near-zero CPU when unseen; pleas still alert.',
      cat: { hall: 'Hall', petitions: 'Pleas', scribes: 'Apprentices', system: 'System', remote: 'Remote access' } },
    toast: { petition: 'Plea from {name}', stale: 'Plea still waiting: {name}' },
  },
});

// Vault 111, a Fallout vault, not 40k: Vault-Tec blue and yellow, riveted steel, concrete, rust, Pip-Boy green
// phosphor, Nuka-Cola red, warm incandescent light. Its own art (later tasks) replaces what only fits 40k.
defineTheme({
  id: 'vault', world: 'vault', name: 'Vault 111', art: ['scribe', 'adept'], // ui/art/vault/: vault dwellers in the blue jumpsuit with the Pip-Boy, Mr. Handy robots
  px: {
    k: '#0c0c0c', e: '#141822', n: '#0a0c10',
    r: '#1e4a8a', R: '#2e66b8', d: '#12305e', t: '#f2c23a', T: '#a07a14', z: '#f2c23a', j: '#a07a14', // jumpsuit, yellow stripe
    g: '#f2c23a', G: '#a07a14', h: '#ffe07a', U: '#5a4010', // Vault-Tec yellow
    m: '#6a7078', M: '#3a3e44', l: '#9aa0a8', V: '#202428', // riveted steel
    p: '#d9cf9a', P: '#a89a68', b: '#c8ccd0', B: '#9aa0a8', s: '#b8b8a8', ':': '#e0a888', ';': '#9a6450',
    q: '#8a909a', Q: '#5a6068', J: '#5aff7a', I: '#c8ffd8', // Mr. Handy eye glow, Pip-Boy green
    w: '#5a5a54', W: '#3a3a36', L: '#7a7a70', u: '#12305e', v: '#3a3e34', // concrete
    c: '#5aff7a', C: '#0a2a12', o: '#5aff7a', O: '#c8ffd8', f: '#ffd890', F: '#fff4d0', x: '#d8202a', a: '#d8202a', // Pip-Boy green, incandescent, Nuka-Cola red
    1: '#8a9098', 2: '#2a2e32', 3: '#a8aeb4', 4: '#4a4e54', 5: '#52565c', 6: '#2a2e32', 0: '#16181a', A: '#0e0f10',
    D: '#12305e', E: '#0a1c38', N: '#1a3660', S: '#6a7078',
    X: '#7a8088', Y: '#9aa0a8', Z: '#4a4e54', i: '#2a2e32', '!': '#1a8a4a', '+': '#7affa0',
    '@': '#05060a', $: '#3a2a10', '%': '#5a4018', '*': '#4a0a0e', '-': '#2a0608', '=': '#8a3a3e', '&': '#d8202a',
    '(': '#d8202a', ')': '#ff6a6a', '[': '#4a0a0e', ']': '#2a2e32',
  },
  sash: ['#f2c23a', '#5aff7a', '#2e66b8', '#d8202a', '#9aa0a8', '#ffd890', '#8a4a24', '#d9cf9a'],
  rank: {
    high: { robe: { r: '#1a3e78', R: '#2a5aa6', d: '#0e2852', z: '#9aa0a8', j: '#6a7078', t: '#9aa0a8', T: '#3a3e44', g: '#9aa0a8', G: '#3a3e44' },
      adept: { x: '#9aa0a8', b: '#d8dce0', J: '#9aa0a8', I: '#eef0f2' } },
    novice: { robe: { r: '#3a4a68', R: '#5a6a88', d: '#242e40', z: '#6a6a5a', j: '#6a6a5a', t: '#8a8a78', T: '#4a4a3e', g: '#4a4a3e', G: '#4a4a3e' },
      adept: { x: '#5a5a4e', q: '#8a8e98', Q: '#5a6068', b: '#9a9a90', J: '#5a7a5e', I: '#7a9a7e' } },
  },
  ink: {
    coolant: '#5aff7a', screenHot: '#eafff0', screenDim: '#1a8a4a', screenMark: '#136a3a', screenFlicker: 'rgba(10,42,18,.55)', screenOff: '#1a5a30',
    cant: 'rgba(0,0,0,0)', grime: 'rgba(10,10,10,.25)', scratchSheen: 'rgba(255,240,220,.08)',
    parchmentWarn: '#e0a080',
    smoke: '#c8c8c0', sparkSmoke: '#d0d0c8', steam: '#dcdcd0', alarmGlow: '#ffd890', beaconSweep: '#d8202a', searchlight: '#5aff7a',
    // the wasteland viewport: dusty sky and hazy sun by day; dark and starless by night
    windowDay: { u: '#a89868', v: '#8a9a6a', g: '#d8c080', x: '#b8604a' },
    windowNight: { u: '#1a1a20', v: '#141418', g: '#4a4038' },
    backdrop: '#141822', backdropLit: '#202838', backdropEdge: '#1a2230', backdropDark: '#0a0c12', backdropSeam: '#0e1218', backdropSeamLit: '#1e2838',
    backdropRivet: '#3a4048', overflowPlaque: '#8a8e98',
  },
  light: { amber: 'rgba(255,216,144,.24)', green: 'rgba(90,255,122,.18)', red: 'rgba(216,32,42,.22)', lampOn: 'rgba(90,255,122,.5)',
    glint: 'rgba(242,194,58,.6)', spark: 'rgba(255,224,122,.8)', night: '6,10,8', beam: '180,220,255' },
  ui: {
    '--bg': '#0a0e16', '--bar': '#101a2a', '--ink': '#d9cf9a', '--dim': '#7a8290', '--light': '#f0e8c8', '--edge': '#2a3240', '--btn': '#141e30',
    '--copper': '#f2c23a', '--outline': '#0c0c0c', '--bone': '#d9cf9a', '--iron': '#6a7078', '--green': '#5aff7a',
    '--red': '#d8202a', '--pink': '#ff8a7a', '--blood': '#6a1016', '--glow': '#5aff7a', '--wax': '#d8202a', '--wax-deep': '#3a0a0e',
    '--alarm': '#d8202a', '--flame': '#ffd890', '--label': '#101a2a', '--label-sel': '#1a2a40', '--label-btn': '#141e30', '--plaque': '#0e1420',
    '--yes': '#5aff7a', '--yes-deep': '#0a2a12',
    // cream requisition cards over the dark blue bar
    '--card': '#d9cf9a', '--paper': '#e4dcb0', '--paper-edge': '#a89a68', '--paper-hi': '#f0e8c8', '--paper-tab': '#d0c89c', '--paper-q': '#ddd4a8',
    '--paper-shade': '#a89a68', '--paper-line': '#8a7c50', '--paper-ink': '#2a2414', '--paper-ink-2': '#4a4028', '--paper-ink-3': '#6a5e40',
    '--paper-err': '#a01818', '--leather': '#3a3e44', '--leather-deep': '#1c1e22', '--chart-new': '#f2c23a', '--chart-cache': '#5aff7a',
    '--rod-hi': '#ffe07a', '--rod': '#f2c23a', '--rod-lo': '#a07a14', '--rod-edge': '#5a4010', '--rod-cap': '#fff4d0',
    // terminal type for titles, Vault-Tec blue accent over the cream card
    '--display': "'VT323', monospace", '--paper-accent': '#1e4a8a',
  },
  text: {
    subtitle: "Vault 111 · Overseer's Office", motto: 'Prepare for the future',
    rank: { high: 'Overseer', standard: 'Dweller', novice: 'Newcomer' },
    status: { busy: 'On shift', shell: 'At the mainframe', idle: 'Turn done, awaiting input', waiting: 'Requisition filed',
      background: 'Idle · robot on duty', napping: 'Idle · in the bunk' },
    petitions: ['{n} requisition', '{n} requisitions'], petitioning: '{n} requisitioning', petitionLabel: '{name}, requisition: {want}',
    adeptOf: '{kind} · robot of {owner}', overflow: '+{n} in cryo', empty: 'No dwellers on shift',
    modes: { full: 'Day shift', candles: 'Lights out' },
    log: { title: "Overseer's log", open: "Open the Overseer's log", close: "Close the Overseer's log", silent: "The Overseer's log is empty: no record could be read for this day." },
    tithe: { hint: 'Rations today: tokens and shift time', day: 'Rations today: {tokens} tokens, {time} on shift' },
    event: { commit: 'Commit approved', petition: 'Requisition', 'petition-answered': 'Requisition approved', compaction: 'Records archived' },
    prefs: { chime: 'Requisition chime', petitions: 'Requisitions', questions: 'A question at the end of a turn counts as a requisition',
      stale: 'Requisition goes stale after', nap: 'Idle to the bunk after', cog: 'Stay at the mainframe for',
      pauseHint: 'Near-zero CPU when unseen; requisitions still alert.',
      cat: { hall: 'Vault', petitions: 'Requisitions', scribes: 'Dwellers', system: 'System', remote: 'Remote access' } },
    toast: { petition: 'Requisition from {name}', stale: 'Requisition still waiting: {name}' },
  },
});
