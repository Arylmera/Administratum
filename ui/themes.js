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
