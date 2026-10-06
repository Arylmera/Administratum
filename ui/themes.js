// The themes beyond Tier II (theme.js), each only what it changes. Picked in Settings (adm.theme); the gallery renders
// any of them (node tools/sprite_sheet.mjs --theme <id>). Design and slot names: theme.js, ui/art/key.gpl.
import { defineTheme } from './theme.js';

// Molten industry: rust-dark plates, orange plasma in the floor channels, amber screens and cant.
defineTheme({
  id: 'forge', name: 'Forge World',
  px: { 4: '#2e2622', 5: '#302824', 6: '#1a1410', 1: '#2c2622', 2: '#15110e', 3: '#4e3422', D: '#3a1a10', E: '#22100a', N: '#2a0e08',
    '!': '#8a3a12', '+': '#ffb05a', c: '#ffb347', C: '#3a2008', o: '#ffb347', O: '#fff2d8', X: '#d0702a', Y: '#ffa860', Z: '#8a3e14', i: '#5a240a' },
  ink: { coolant: '#ff8a2a', screenHot: '#ffe0a8', screenDim: '#c87a2a', screenMark: '#8a4a18', screenFlicker: 'rgba(58,32,8,.55)', screenOff: '#7a4a20',
    cant: 'rgba(255,170,80,.38)' },
  light: { green: 'rgba(255,170,80,.16)', lampOn: 'rgba(255,190,110,.55)' },
  ui: { '--green': '#ffb347', '--yes': '#7a4a20', '--yes-deep': '#3a2008' },
  text: { subtitle: 'Forge World · Manufactorum of the Cult Mechanicus', motto: 'The forge never cools' },
});

// Cold and clinical: black-green robes, silver instead of brass, teal screens and coolant, cold candlelight.
defineTheme({
  id: 'xenos', name: 'Ordo Xenos',
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

// The same hall, easy on the eyes: muted parchment and screens, softer glows.
defineTheme({
  id: 'night', name: 'Night Shift',
  px: { p: '#a89c80', P: '#857652', b: '#a49a86', c: '#4fbf74', o: '#4fbf74', O: '#b8d8c0', f: '#c8883a', F: '#e0c890', '+': '#4f9a6a', h: '#c0944a' },
  ink: { coolant: '#2a7a4a', screenHot: '#8fcfa0', cant: 'rgba(124,255,158,.18)' },
  light: { amber: 'rgba(240,168,60,.16)', green: 'rgba(124,255,158,.09)', red: 'rgba(200,40,28,.14)', lampOn: 'rgba(124,255,158,.3)' },
  ui: { '--ink': '#b8ac8c', '--light': '#d8ccac', '--green': '#4fbf74', '--pink': '#d06a5a', '--red': '#7a1a14', '--glow': '#801c14',
    '--card': '#b0a078', '--paper': '#b8a882', '--paper-edge': '#a49264', '--paper-hi': '#c4b48c', '--paper-q': '#b8ac8c' },
});

// Accessibility: pure black outlines, a lighter floor, brighter robes, colour-blind-safe departments (Okabe-Ito), no
// wall weathering, stronger glows, and a high-contrast frame.
defineTheme({
  id: 'contrast', name: 'High Contrast',
  px: { k: '#000000', 1: '#3a3d42', 2: '#0a0b0c', 3: '#5a5e64', 4: '#34343a', 5: '#36363c', r: '#8a1c12', R: '#c23a24', d: '#4a0c08',
    p: '#f0e6c8', P: '#b8a878', c: '#9affb8', o: '#9affb8' },
  sash: ['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7', '#ffffff'],
  ink: { cant: 'rgba(0,0,0,0)', grime: 'rgba(0,0,0,0)', scratchSheen: 'rgba(0,0,0,0)', scratch: '#0e0a08' },
  light: { amber: 'rgba(240,168,60,.34)', green: 'rgba(124,255,158,.22)' },
  ui: { '--bg': '#000000', '--bar': '#000000', '--ink': '#f0e6c8', '--dim': '#c0b090', '--edge': '#8a7a5c', '--red': '#ff3a20', '--pink': '#ffb0a0',
    '--green': '#9affb8', '--label': '#000000', '--paper-ink': '#000000', '--paper-ink-2': '#2a1a08', '--paper-ink-3': '#1a1006' },
});

// Not the 40k scriptorium: a neon netrunner den. Hooded robes read as hoodies, optics as visors; brass turns to chrome
// cyan, copper pipes to magenta neon tubes, coolant to violet floor light, parchment panels to dark glass. Its own art
// replaces what only fits 40k (ui/art/cyber/: skull banners, the Cog, the servo-skull...).
defineTheme({
  id: 'cyber', name: 'Neon Grid',
  art: ['walls', 'sanctum', 'skull', 'gate', 'cogitator'], // ui/art/cyber/: neon signs, the hex-chip emblem, the drone, the gate's neon box, the cogitator's faceplate
  px: {
    k: '#05040a', e: '#08060e', n: '#0a0812',
    r: '#1c1a2a', R: '#2e2c44', d: '#0e0c18', t: '#ff2e88', T: '#0e0c18', z: '#ff2e88', j: '#ffd0ea', // hoodie, neon trim
    g: '#2fb8d8', G: '#155a78', h: '#9af0ff', U: '#0a2a3a', // chrome cyan for brass
    m: '#4a4a66', M: '#22223a', l: '#7a7aa0', V: '#0e0e1c',
    p: '#d8dcec', P: '#9aa0bc', b: '#c8ccdc', B: '#8a8ea4', s: '#a0a4bc', q: '#b0b4c8', Q: '#6a6e88', J: '#3af0ff', I: '#3af0ff',
    w: '#2a2440', W: '#16121f', L: '#3e3658', u: '#1a2a5a', v: '#1a3a3a',
    c: '#3af0ff', C: '#06222c', o: '#ff2e88', O: '#ffd0ea', x: '#ff2e88', a: '#ff2040',
    1: '#14141f', 2: '#07070c', 3: '#2a2a3e', 4: '#16142a', 5: '#181630', 6: '#0b0a18', 0: '#0a0814', A: '#08060f',
    D: '#1e0e2a', E: '#10061a', N: '#160a24', S: '#121224',
    X: '#ff2e88', Y: '#ffa0d0', Z: '#a01858', i: '#5a0c32', '!': '#4a1a7a', '+': '#d88aff',
    '@': '#020206', $: '#1a0a2a', '%': '#3a1a5a', '*': '#3a0a1a', '-': '#1a040c', '=': '#5a1a2a',
  },
  sash: ['#ff2e88', '#3af0ff', '#b4ff3a', '#ffd23a', '#b04aff', '#ff7a2e', '#2effc0', '#ff5aff'],
  rank: {
    high: { robe: { r: '#1a1030', R: '#30205a', d: '#0c0618', z: '#3af0ff', j: '#e0fcff', t: '#3af0ff', T: '#155a78', g: '#3af0ff', G: '#155a78' },
      adept: { x: '#3af0ff', b: '#e8ecff', J: '#3af0ff', I: '#155a78' } },
    novice: { robe: { r: '#2a2a32', R: '#3e3e4a', d: '#16161c', z: '#6a6a7a', j: '#6a6a7a', t: '#3e3e4a', T: '#16161c', g: '#16161c', G: '#16161c' },
      adept: { x: '#6a6a7a', q: '#8a8a98', Q: '#4a4a56', b: '#a0a0ac', J: '#8a8a98', I: '#8a8a98' } },
  },
  ink: {
    coolant: '#b04aff', screenHot: '#c8faff', screenDim: '#1aa0c0', screenMark: '#106078', screenFlicker: 'rgba(6,34,44,.55)', screenOff: '#0e4050',
    cant: 'rgba(255,46,136,.34)', grime: 'rgba(20,10,40,.4)', scratchSheen: 'rgba(150,200,255,.06)',
    parchmentWarn: '#ffa0c8', scrollRod: '#4a4a66', scrollInk: '#2a2a44', wax: '#ff2e88', waxLit: '#ffa0d0', waxDark: '#7a0a3a',
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
      pauseHint: 'Near-zero CPU when unseen; requests still alert.' },
    toast: { petition: 'Request from {name}', stale: 'Request still waiting: {name}' },
  },
});
