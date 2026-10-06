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

// Ordo Malleus, the vigil against the daemon. The same hall, easy on the eyes: muted parchment and screens, softer glows.
defineTheme({
  id: 'night', world: 'w40k', name: 'Ordo Malleus',
  px: { p: '#a89c80', P: '#857652', b: '#a49a86', c: '#4fbf74', o: '#4fbf74', O: '#b8d8c0', f: '#c8883a', F: '#e0c890', '+': '#4f9a6a', h: '#c0944a' },
  ink: { coolant: '#2a7a4a', screenHot: '#8fcfa0', cant: 'rgba(124,255,158,.18)' },
  light: { amber: 'rgba(240,168,60,.16)', green: 'rgba(124,255,158,.09)', red: 'rgba(200,40,28,.14)', lampOn: 'rgba(124,255,158,.3)' },
  ui: { '--ink': '#b8ac8c', '--light': '#d8ccac', '--green': '#4fbf74', '--pink': '#d06a5a', '--red': '#7a1a14', '--glow': '#801c14',
    '--card': '#b0a078', '--paper': '#b8a882', '--paper-edge': '#a49264', '--paper-hi': '#c4b48c', '--paper-q': '#b8ac8c' },
  text: { subtitle: 'Ordo Malleus · Night vigil of the Inquisition', motto: 'The hammer falls in the dark' },
});

// Ordo Hereticus, whose witch-light leaves no shadow. Accessibility: pure black outlines, a lighter floor, brighter robes, colour-blind-safe departments (Okabe-Ito), no
// wall weathering, stronger glows, and a high-contrast frame.
defineTheme({
  id: 'contrast', world: 'w40k', name: 'Ordo Hereticus',
  px: { k: '#000000', 1: '#3a3d42', 2: '#0a0b0c', 3: '#5a5e64', 4: '#34343a', 5: '#36363c', r: '#8a1c12', R: '#c23a24', d: '#4a0c08',
    p: '#f0e6c8', P: '#b8a878', c: '#9affb8', o: '#9affb8' },
  sash: ['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7', '#ffffff'],
  ink: { cant: 'rgba(0,0,0,0)', grime: 'rgba(0,0,0,0)', scratchSheen: 'rgba(0,0,0,0)', scratch: '#0e0a08' },
  light: { amber: 'rgba(240,168,60,.34)', green: 'rgba(124,255,158,.22)' },
  ui: { '--bg': '#000000', '--bar': '#000000', '--ink': '#f0e6c8', '--dim': '#c0b090', '--edge': '#8a7a5c', '--red': '#ff3a20', '--pink': '#ffb0a0',
    '--green': '#9affb8', '--label': '#000000', '--paper-ink': '#000000', '--paper-ink-2': '#2a1a08', '--paper-ink-3': '#1a1006' },
  text: { subtitle: 'Ordo Hereticus · Witch-light of the Inquisition', motto: 'Innocence proves nothing' },
});

// Not the 40k scriptorium: a neon netrunner den. Hooded robes read as hoodies, optics as visors; brass turns to chrome
// cyan, copper pipes to magenta neon tubes, coolant to violet floor light, parchment panels to dark glass. Its own art
// replaces what only fits 40k (ui/art/cyber/: skull banners, the Cog, the servo-skull...).
defineTheme({
  id: 'cyber', world: 'cyber', name: 'Neon Grid',
  art: ['walls', 'sanctum', 'skull', 'gate', 'cogitator', 'scribe', 'adept', 'magos', 'workstations', 'fire', 'petitions', 'commits', 'room-doors', 'clutter', 'room-floor', 'room-walls', 'room-pipes'], // ui/art/cyber/: neon signs, the hex-chip emblem, the drone, the shutter gate, the terminal bank, the hacker crew, the hologram daemons and the fixer, battlestations and a cyberdeck, oil drums, datapads, holo-stickers, sliding doors, a server rack and data-rod clutter, a neon-grid floor and panelled walls under neon tubes, neon tube runs on dark clips
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
    event: { commit: 'Commit signed', petition: 'Request', 'petition-answered': 'Request answered', compaction: 'Cache flushed' },
    prefs: { chime: 'Request ping', petitions: 'Requests', questions: 'A question at the end of a turn counts as a request',
      stale: 'Request goes stale after', nap: 'Idle to the lounge after', cog: 'Stay at the server rack for',
      pauseHint: 'Near-zero CPU when unseen; requests still alert.',
      cat: { hall: 'Den', petitions: 'Requests', scribes: 'Runners', system: 'System', remote: 'Remote access' } },
    toast: { petition: 'Request from {name}', stale: 'Request still waiting: {name}' },
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
    event: { commit: 'Commit uplinked', petition: 'Call', 'petition-answered': 'Call answered', compaction: 'Memory purged' },
    prefs: { chime: 'Call chime', petitions: 'Calls', questions: 'A question at the end of a turn counts as a call',
      stale: 'Call goes stale after', nap: 'Idle to the bunk after', cog: 'Stay at the airlock for',
      pauseHint: 'Near-zero CPU when unseen; calls still alert.',
      cat: { hall: 'Deck', petitions: 'Calls', scribes: 'Crew', system: 'System', remote: 'Remote access' } },
    toast: { petition: 'Call from {name}', stale: 'Call still waiting: {name}' },
  },
});
