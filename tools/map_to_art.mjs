// Lays out sprite families as art files: ui/art/<family>.png + .json, drawn in the key palette ui/art/key.gpl.
// It converted the text maps once (2026-10-06); it now reads the sprites back from the art files, so re-running it
// only repacks the sheets (to regroup families, or add one: list its frames below, then load it in sprites.js).
//   node tools/map_to_art.mjs <family|all>
// Writes key.gpl if missing. The key never changes after that: art files depend on its exact colours.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE } from '../ui/theme.js';
import { png, rgba } from './png_write.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const artDir = path.join(root, 'ui', 'art');
fs.mkdirSync(artDir, { recursive: true });

// Key palette: one colour per palette char, the Tier II colour itself unless an earlier char has it (rank slots share
// the robe's colours, the optic shares the phosphor's), then nudged in blue until unique: same look, own identity.
const NAMES = {
  k: 'outline', g: 'brass', G: 'brass shadow', p: 'parchment', P: 'parchment shadow', w: 'wood', W: 'wood dark',
  m: 'iron', M: 'iron dark', c: 'phosphor', C: 'phosphor dark', f: 'flame', F: 'flame core', x: 'red trim',
  b: 'bone', B: 'bone shadow', n: 'near black', u: 'deep blue', v: 'deep green', r: 'robe', d: 'robe shadow',
  a: 'alarm red', o: 'optic', y: 'sash (department colour)', s: 'tan', e: 'hood shadow', R: 'robe lit', h: 'brass lit',
  l: 'iron lit', O: 'optic glint', L: 'wood lit', q: 'adept bone', Q: 'adept bone shadow',
  t: 'rank: hood rim', T: 'rank: shoulder seam', z: 'rank: cog', j: 'rank: cog hub', J: 'adept rank: hood cog', I: 'adept rank: cog hub',
};
const keyFile = path.join(artDir, 'key.gpl');
if (!fs.existsSync(keyFile)) {
  const used = new Set(), lines = ['GIMP Palette', 'Name: Administratum key', 'Columns: 8',
    '# Draw sprites in these exact colours. Each one is a palette slot that themes recolour (ui/theme.js);',
    '# the first letter of a name is its slot. Never edit: the art files depend on these values.'];
  for (const [ch, hex] of Object.entries(BASE)) {
    let [r, g, b] = rgba(hex);
    while (used.has(`${r},${g},${b}`)) b = b < 255 ? b + 1 : 0;
    used.add(`${r},${g},${b}`);
    lines.push(`${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}\t${ch} ${NAMES[ch] ?? ''}`.trimEnd());
  }
  fs.writeFileSync(keyFile, lines.join('\n') + '\n');
  console.log('wrote', path.relative(root, keyFile));
}
const key = {}; // char -> [r, g, b]
for (const line of fs.readFileSync(keyFile, 'utf8').split('\n')) {
  const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S)/);
  if (m) key[m[4]] = [+m[1], +m[2], +m[3]];
}

// Families: frames to lay out (name -> text map), in rows, and anchor points (art px, from a frame's top-left).
// Characters carry their anchors here; props keep theirs in scene.js for now (same-size redraws need none).
const walkFrames = (set, frames) => { for (const dir of ['down', 'up', 'right']) set[dir].forEach((f, i) => { frames[`${dir} ${i}`] = f; }); };
const WALK = [['down 0', 'down 1', 'down 2', 'up 0', 'up 1', 'up 2', 'right 0', 'right 1', 'right 2']];
// Prop families, one sheet each, as the sprite discussion issues group them (docs/superpowers/specs/...-design.md).
export const PROPS = {
  workstations: ['DESK', 'LECTERN', 'CONSOLE'], cogitator: ['COGITATOR'], sanctum: ['THRONE', 'LORD_DESK', 'COG_MECH', 'SEAL'],
  gate: ['GATE', 'GATE_L', 'GATE_R'], refectorium: ['RECAFF', 'TABLE', 'BENCH'], walls: ['WINDOW', 'BANNER', 'SHELF', 'GAUGE', 'CENSER'],
  clutter: ['PAPER_STACK', 'SCROLL_PILE', 'BOOKS', 'LOOSE_A', 'LOOSE_B', 'CRATE'], skull: ['SKULL'], petitions: ['SCROLL', 'QSCROLL'],
  fire: ['BRAZIER', 'CANDLES'],
};
const FAMILIES = {
  async scribe() {
    const { SCRIBE, MAPS } = await import('../ui/sprites.js');
    const frames = { arm: MAPS.ARM };
    walkFrames(SCRIBE, frames);
    // feet: where the actor's position sits; arm / armL: the arms over the desk; scroll: the petition scroll in hand.
    return { frames, rows: [...WALK, ['arm']], anchors: { feet: [16, 34], arm: [28, 4], armL: [0, 4], scroll: [28, 16] } };
  },
  // The seated Magos: the body, and the drill forearm (art cols 0..9 of the old map) as its own frame so it can swing.
  // arm: where the arm frame's top-left sits on the body frame; chest: the scanning screen line; eyeL / eyeR: optics.
  async magos() {
    const { MAPS, MAGOS } = await import('../ui/sprites.js');
    const full = MAPS.MAGOS; // only while the old map still exists (the conversion)
    const body = full ? full.map(r => '.'.repeat(10) + r.slice(10)) : MAGOS.body, arm = full ? full.map(r => r.slice(0, 10)) : MAGOS.arm;
    return { frames: { body, arm }, rows: [['body', 'arm']], anchors: { arm: [0, 0], chest: [26, 30], eyeL: [26, 19], eyeR: [29, 19] } };
  },
  async adept() {
    const { ADEPT } = await import('../ui/sprites.js');
    const frames = {};
    walkFrames(ADEPT, frames);
    return { frames, rows: WALK, anchors: { feet: [12, 28] } };
  },
  ...Object.fromEntries(Object.entries(PROPS).map(([fam, names]) => [fam, async () => {
    const { MAPS } = await import('../ui/sprites.js');
    return { frames: Object.fromEntries(names.map(n => [n, MAPS[n]])), rows: [names], anchors: {} };
  }])),
};

async function convert(family) {
const { frames, rows: given, anchors } = await FAMILIES[family]();
// wrap a row past 512 art px, so wide families stay workable in an editor
const rows = given.flatMap(row => {
  const out = [[]];
  let w = 0;
  for (const n of row) {
    const fw = Math.max(...frames[n].map(r => r.length));
    if (w && w + fw > 512) { out.push([]); w = 0; }
    out.at(-1).push(n); w += fw + 1;
  }
  return out;
});

// Pack: one row of frames per rows[] entry, left to right, 1 px apart (keeps frames apart in an editor).
const rect = {};
let y = 0, W = 0;
for (const row of rows) {
  let x = 0, h = 0;
  for (const name of row) {
    const f = frames[name], w = Math.max(...f.map(r => r.length));
    rect[name] = { x, y, w, h: f.length };
    x += w + 1; h = Math.max(h, f.length);
  }
  W = Math.max(W, x - 1); y += h + 1;
}
const H = y - 1, cells = new Array(W * H).fill(null);
for (const [name, r] of Object.entries(rect)) frames[name].forEach((row, j) => {
  for (let i = 0; i < row.length; i++) if (row[i] !== '.') {
    if (!key[row[i]]) throw new Error(`${name}: char '${row[i]}' has no key colour`);
    cells[(r.y + j) * W + r.x + i] = row[i];
  }
});
const img = png(W, H, (x, yy) => { const c = cells[yy * W + x]; return c ? [...key[c], 255] : [0, 0, 0, 0]; });
fs.writeFileSync(path.join(artDir, `${family}.png`), img);
// Aseprite-style "json-hash" sheet data, plus meta.anchors (art px) for the drawing code.
const json = { frames: Object.fromEntries(Object.entries(rect).map(([n, r]) => [n, { frame: r }])),
  meta: { app: 'tools/map_to_art.mjs', image: `${family}.png`, format: 'RGBA8888', size: { w: W, h: H }, palette: 'key.gpl', anchors } };
fs.writeFileSync(path.join(artDir, `${family}.json`), JSON.stringify(json, null, 2) + '\n');
console.log(`wrote ui/art/${family}.png (${W}x${H}) and ${family}.json: ${Object.keys(rect).length} frames`);
}

const arg = process.argv[2];
if (arg !== 'all' && !FAMILIES[arg]) throw new Error(`usage: map_to_art.mjs <all|${Object.keys(FAMILIES).join('|')}>`);
for (const f of arg === 'all' ? Object.keys(FAMILIES) : [arg]) await convert(f);
