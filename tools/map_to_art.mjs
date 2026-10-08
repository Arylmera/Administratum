// Lays out sprite families as art files: ui/art/<family>.png + .json, drawn in the key palette ui/art/key.gpl.
// It converted the text maps once (2026-10-06); it now reads the sprites back from the art files, so re-running it
// only repacks the sheets (to regroup families, or add one: list its frames below, then load it in sprites.js).
//   node tools/map_to_art.mjs <family|all>
// Writes key.gpl if missing. The key never changes after that: art files depend on its exact colours.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE } from '../ui/theme.js';
import { rgba } from './png_write.mjs';
import { writeSheet } from './sheet_writer.mjs';

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
  gate: ['GATE', 'GATE_L', 'GATE_R', 'GATE_VOID'], refectorium: ['RECAFF', 'TABLE', 'BENCH'], walls: ['WINDOW', 'BANNER', 'SHELF', 'GAUGE', 'CENSER', 'WINDOW_TALL', 'HANGING'],
  clutter: ['PAPER_STACK', 'SCROLL_PILE', 'BOOKS', 'LOOSE_A', 'LOOSE_B', 'CRATE'], skull: ['SKULL'], petitions: ['SCROLL', 'QSCROLL', 'SCROLL_HELD'],
  fire: ['BRAZIER', 'CANDLES'], commits: ['COMMIT_SEAL', 'COMMIT_TAG', 'COMMIT_STAMP'],
};
// Prop anchors, art px from the frame's top-left (rects [x, y, w, h], points [x, y]); first values, moved out of scene.js.
// Once a sheet exists its JSON is the source: a repack keeps the anchors it finds there.
const PROP_ANCHORS = {
  workstations: {
    // screen: sparks on a tool error; lamp: the test lamp; seals: commit seal slots; candle / slate: the desk's light
    // when busy / idle; shadow: under it (its top is the depth-sort line); paper: the pile's origin on the surface;
    // pile: where fallen sheets spread from; cog: the background-shell cog; puff: where an unattended pile vanishes.
    DESK: { screen: [17, 5, 14, 9], lamp: [16, -6], seals: [[3, 16], [11, 17], [53, 16]], candle: [50, 2], slate: [26, 10],
      shadow: [2, 42, 60, 4], paper: [2, 21], pile: [32, 24], cog: [56, 14], puff: [32, 22] },
    LECTERN: { screen: [5, 5, 14, 9], lamp: [4, -6], seals: [[1, 16], [38, 16], [38, 25]], candle: [35, 2], slate: [14, 10],
      shadow: [2, 42, 40, 4], paper: [2, 21], pile: [22, 24], cog: [36, 14], puff: [22, 22] },
    CONSOLE: { screen: [6, 3, 15, 7], lamp: [20, -5], seals: [[30, 7]], shadow: [8, 20, 12, 2], paper: [30, 16], pile: [14, 12], light: [14, 6] },
  },
  // screen: the scrolling centre screen; wave / bars: the side screens; lamps: the first of the lamp row; drums: the data
  // reels' centres; vents: where the steam rises.
  cogitator: { COGITATOR: { screen: [66, 27, 32, 33], wave: [34, 27, 22, 17], bars: [108, 27, 22, 17], lamps: [66, 65],
    drums: [[18, 32], [18, 54], [144, 32], [144, 54]], vents: [[44, 6], [119, 6]] } },
  // entry: the doorstep (the hall's entry point); opening: the doorway the leaves slide in; leafL / leafR: the leaves
  // closed; slide: how far each leaf travels.
  gate: { GATE: { entry: [32, 56], opening: [16, 10, 32, 44], leafL: [16, 10], leafR: [32, 10], slide: [14, 0] } },
  // centre: the skull's position; carry: the sheet it carries on a push; beam: the searchlight's source.
  skull: { SKULL: { centre: [10, 10], carry: [7, 19], beam: [10, 18] } },
};
const metaOf = family => { try { return JSON.parse(fs.readFileSync(path.join(artDir, `${family}.json`), 'utf8')).meta; } catch { return undefined; } };
const existing = family => metaOf(family)?.anchors;
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
  // Room tiles (baked from the old procedural drawing, 2026-10-06): repacked from themselves, rows as they are.
  ...Object.fromEntries(['room-floor', 'room-walls', 'room-pipes', 'room-doors'].map(fam => [fam, async () => {
    const { ROOM, ROOM_SHEET_OF } = await import('../ui/sprites.js');
    const names = Object.keys(ROOM.frames).filter(n => ROOM_SHEET_OF[n] === fam), json = JSON.parse(fs.readFileSync(path.join(artDir, `${fam}.json`), 'utf8'));
    const rows = Object.values(Object.groupBy(names, n => json.frames[n].frame.y));
    return { frames: Object.fromEntries(names.map(n => [n, ROOM.frames[n]])), rows, anchors: json.meta.anchors };
  }])),
  ...Object.fromEntries(Object.entries(PROPS).map(([fam, names]) => [fam, async () => {
    const { MAPS } = await import('../ui/sprites.js');
    return { frames: Object.fromEntries(names.map(n => [n, MAPS[n]])), rows: [names], anchors: PROP_ANCHORS[fam] ?? {} };
  }])),
};

async function convert(family) {
const { frames, rows: given, anchors: first } = await FAMILIES[family](), anchors = existing(family) ?? first;
const { W, H } = writeSheet(family, frames, given, { app: 'tools/map_to_art.mjs', anchors, tiles: metaOf(family)?.tiles });
console.log(`wrote ui/art/${family}.png (${W}x${H}) and ${family}.json: ${Object.keys(frames).length} frames`);
}

const arg = process.argv[2];
if (arg !== 'all' && !FAMILIES[arg]) throw new Error(`usage: map_to_art.mjs <all|${Object.keys(FAMILIES).join('|')}>`);
for (const f of arg === 'all' ? Object.keys(FAMILIES) : [arg]) await convert(f);
