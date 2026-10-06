// Renders every sprite of a theme to PNG, plus a gallery page, for reviewing and discussing them one by one
// (docs/sprites/README.md, docs/superpowers/specs/2026-10-06-sprite-themes-design.md). No dependencies.
//   node tools/sprite_sheet.mjs [--theme tier2] [--scale 4] [--out docs/sprites]
// Re-run after editing a map or a palette: the PNGs are committed so issues and the gallery can show them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAPS, SCRIBE, ADEPT, RES, RANK, rankOf, SHEET_OF } from '../ui/sprites.js';
import { THEMES, resolve } from '../ui/theme.js';
import { png, rgba } from './png_write.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const themeId = arg('theme', 'tier2'), scale = Number(arg('scale', 4)), outRoot = path.resolve(root, arg('out', 'docs/sprites'));
if (!THEMES[themeId]) throw new Error(`unknown theme ${themeId}: ${Object.keys(THEMES).join(', ')}`);
const theme = resolve(THEMES[themeId]);

// Frames side by side, 2 art px apart, each scaled; a map char resolves through the theme's px and the overrides.
function strip(frames, over = {}) {
  const pal = { ...theme.px, ...over }, gap = 2;
  const fw = frames.map(f => Math.max(...f.map(r => r.length))), fh = Math.max(...frames.map(f => f.length));
  const w = fw.reduce((a, b) => a + b, 0) + gap * (frames.length - 1);
  const cells = new Array(w * fh).fill(null);
  let x0 = 0;
  frames.forEach((f, i) => { f.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== '.') cells[y * w + x0 + x] = pal[row[x]]; }); x0 += fw[i] + gap; });
  return { w: w * scale, h: fh * scale, buf: png(w * scale, fh * scale, (x, y) => rgba(cells[Math.floor(y / scale) * w + Math.floor(x / scale)])) };
}

// Where each map is drawn: the ui files that name it.
const uiDir = path.join(root, 'ui'), sources = fs.readdirSync(uiDir).filter(f => f.endsWith('.js') && f !== 'sprites.js');
const usedIn = name => sources.filter(f => new RegExp(`MAPS\\.${name}\\b|'${name}'`).test(fs.readFileSync(path.join(uiDir, f), 'utf8')));

const entries = []; // { id, group, file, note, size }
const outDir = path.join(outRoot, themeId);
fs.mkdirSync(outDir, { recursive: true });
function emit(id, group, frames, over, note) {
  const { w, h, buf } = strip(frames, over), file = `${id}.png`;
  fs.writeFileSync(path.join(outDir, file), buf);
  const f0 = frames[0], lw = Math.max(...f0.map(r => r.length)) / RES, lh = f0.length / RES;
  entries.push({ id, group, file, note, size: `${lw}×${lh}`, w, h });
}

const sash = theme.sash[0], ranks = Object.keys(RANK);
for (const r of ranks) {
  const robe = { ...theme.rank[r].robe, y: sash };
  for (const dir of ['down', 'up', 'right', 'left']) emit(`SCRIBE.${r}.${dir}`, 'Scribe (one per session)', SCRIBE[dir], robe, `${RANK[r].name} (${['opus', 'sonnet', 'haiku'].find(m => rankOf(m) === r)}), walking ${dir}, 3 frames. Source: \`ui/art/scribe.png\``);
}
{ // the department colours: one standing scribe per sash
  const f = SCRIBE.down[0], fw = 32, gap = 2, w = theme.sash.length * (fw + gap) - gap, h = f.length;
  const cells = new Array(w * h).fill(null);
  theme.sash.forEach((col, i) => f.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== '.') cells[y * w + i * (fw + gap) + x] = row[x] === 'y' ? col : theme.px[row[x]]; }));
  fs.writeFileSync(path.join(outDir, 'SCRIBE.sashes.png'), png(w * scale, h * scale, (x, y) => rgba(cells[Math.floor(y / scale) * w + Math.floor(x / scale)])));
  entries.push({ id: 'SCRIBE.sashes', group: 'Scribe (one per session)', file: 'SCRIBE.sashes.png', note: 'Department colours (theme sash), one per project', size: '16×17', w: w * scale, h: h * scale });
}
for (const r of ranks) for (const dir of ['down', 'up', 'right', 'left']) emit(`ADEPT.${r}.${dir}`, 'Adept (one per subagent)', ADEPT[dir], theme.rank[r].adept, `${RANK[r].name} adept, walking ${dir}, 3 frames. Source: \`ui/art/adept.png\``);

// What each map is in the hall (README "What it shows"), for whoever discusses it.
const ABOUT = {
  ARM: 'Scribe\'s right arm at the desk (raised with the scroll when a long turn finishes)', ARM_L: 'Scribe\'s left arm at the desk',
  SCROLL: 'Sealed petition scroll, held while queued in the Sanctum', QSCROLL: 'Question scroll: the turn ended with a question',
  DESK: 'Scribe\'s desk: screen and candle lit while busy', LECTERN: 'Compact desk once the hall is full (6 a row)',
  SHELF: 'Bookshelf on the back wall', SKULL: 'Servo-skull: perched by the Magos, courier on git push, red-eyed over a stale petition',
  COG_MECH: 'Cog Mechanicus above the throne', SEAL: 'Purity seals on the lord desk', CANDLES: 'Candle cluster',
  THRONE: 'The Magos\'s throne (Sanctum)', MAGOS: 'Seated Magos: drill arm swings, chest screen scans',
  LORD_DESK: 'The Magos\'s desk, petitions queue before it', BRAZIER: 'Brazier at the gate and in the Sanctum; compaction burns here',
  RECAFF: 'Recaff dispenser (Refectorium), first stop of an idle scribe', CONSOLE: 'Adept console, one per subagent',
  COGITATOR: 'Cogitator bank on the back wall: where shell commands run', WINDOW: 'Window: day or night glass, casts a beam by day',
  BANNER: 'Wall banner', CRATE: 'Supply crate', PAPER_STACK: 'Paper tower (decor)', SCROLL_PILE: 'Scroll pile (decor)', BOOKS: 'Book pile (decor)',
  LOOSE_A: 'Loose sheet on the floor (decor)', LOOSE_B: 'Loose sheet on the floor (decor)', GAUGE: 'Pressure gauge on the Sanctum pillars',
  CENSER: 'Censer', GATE: 'Grand gate frame: sessions enter and leave here', GATE_L: 'Grand gate, left leaf (slides open)',
  GATE_R: 'Grand gate, right leaf (slides open)', TABLE: 'Refectorium table', BENCH: 'Refectorium bench: long-idle scribes sleep here',
};
const VARIANTS = { // extra renders of maps that are drawn with overrides
  WINDOW: [['day', theme.ink.windowDay], ['night', theme.ink.windowNight]],
  DESK: [['unlit', { f: null, F: null, c: theme.ink.screenOff }]],
  LECTERN: [['unlit', { f: null, F: null, c: theme.ink.screenOff }]],
  CONSOLE: [['unlit', { c: theme.ink.screenOff }]],
  SKULL: [['alarm', { o: theme.ink.alarm, O: theme.ink.alarmGlow }]],
};
for (const [name, map] of Object.entries(MAPS)) {
  const where = usedIn(name);
  emit(name, 'Props and furniture', [map], {}, `${ABOUT[name] ?? '?'}. Source: \`ui/art/${SHEET_OF[name]}.png\`, drawn by ${where.length ? where.join(', ') : '(not referenced by name)'}`);
  for (const [v, over] of VARIANTS[name] ?? []) emit(`${name}.${v}`, 'Props and furniture', [map], over, `${name}, ${v}`);
}

// Gallery page: one row per sprite, an anchor per sprite to link from its discussion issue.
const groups = [...new Set(entries.map(e => e.group))];
const md = [`# Sprites — ${theme.name}`, '',
  `Generated by \`node tools/sprite_sheet.mjs --theme ${themeId}\` from the art files in \`ui/art/\` and the palette in \`ui/theme.js\`. Do not edit by hand.`,
  `Each image is ${scale}× the art pixels (the art is ${RES}× the logical scene pixels). Sizes are logical px.`, '',
  'To discuss a sprite, open a **Sprite** issue (New issue → Sprite) and paste the sprite id; see',
  '[the design note](../superpowers/specs/2026-10-06-sprite-themes-design.md#discussing-sprites).', ''];
for (const grp of groups) {
  md.push(`## ${grp}`, '', '| Sprite | Logical size | Notes | Image |', '|---|---|---|---|');
  for (const e of entries.filter(x => x.group === grp)) md.push(`| <a id="${e.id.toLowerCase().replace(/\./g, '-')}"></a>\`${e.id}\` | ${e.size} | ${e.note} | <img src="${themeId}/${e.file}" height="${Math.min(e.h, 160)}"> |`);
  md.push('');
}
fs.writeFileSync(path.join(outRoot, themeId === 'tier2' ? 'README.md' : `${themeId}.md`), md.join('\n'));
console.log(`${entries.length} sprites -> ${path.relative(root, outDir)}`);
