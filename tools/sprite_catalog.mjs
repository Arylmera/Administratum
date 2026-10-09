// Every sprite of the active theme as the hall draws it, for reviewing them: tools/sprite_sheet.mjs (PNG + gallery)
// and tools/sprites.html (the live viewer) both list this. Pure: no fs, no DOM. Call setTheme() first.
// -> [{ id, group, family, src, cells: [{ rows, over }], anim, note, size }]
//    family: the art family ('walls'), as the sprite issues group them; src: its art file for this theme ('cyber/walls').
//    cells: frames, each with its palette overrides; anim: the cells are animation frames (else variants side by side).
import {
  MAPS, SCRIBE, ADEPT, MAGOS, MAGOS_AT, WATCH, RES, RANKS, rankOf, SHEET_OF, ROOM, ROOM_SHEET_OF, ART,
  SCRIBE39, ADEPT39, MAGOS39, SKULL39, WATCH39, REQ39,
} from '../ui/sprites.js';
import { T } from '../ui/theme.js';
import { sheetOf, FACES, FACE_OBJECTS } from '../ui/faces.js';

// What each map is in the hall (README "What it shows"), for whoever discusses it.
const ABOUT = {
  ARM: 'Scribe\'s right arm at the desk (raised with the scroll when a long turn finishes)', ARM_L: 'Scribe\'s left arm at the desk',
  SCROLL: 'Sealed petition scroll, held while queued in the Sanctum', SCROLL_HELD: 'The finished scroll a scribe raises when a long turn is done',
  COMMIT_SEAL: 'Purity seal hung on the desk for each commit (up to 3)', COMMIT_TAG: 'The seal\'s strips before the wax lands', COMMIT_STAMP: 'The stamp that seals a commit', QSCROLL: 'Question scroll: the turn ended with a question',
  DESK: 'Scribe\'s desk: screen and candle lit while busy', LECTERN: 'Compact desk once the hall is full (6 a row)',
  SHELF: 'Bookshelf on the back wall', SKULL: 'Servo-skull: perched by the Magos, courier on git push, red-eyed over a stale petition',
  COG_MECH: 'Cog Mechanicus above the throne', SEAL: 'Purity seals on the lord desk', CANDLES: 'Candle cluster',
  THRONE: 'The Magos\'s throne (Sanctum)',
  LORD_DESK: 'The Magos\'s desk, petitions queue before it', BRAZIER: 'Brazier at the gate and in the Sanctum; compaction burns here',
  RECAFF: 'Recaff dispenser (Refectorium), first stop of an idle scribe', CONSOLE: 'Adept console, one per subagent',
  COGITATOR: 'Cogitator bank on the back wall: where shell commands run', WINDOW: 'Window: day or night glass, casts a beam by day',
  WINDOW_TALL: 'Tall gothic window on the back walls: day or night glass, casts a beam by day', HANGING: 'Full-height hanging on the back walls',
  BANNER: 'Wall banner (the Sanctum wall; the back walls of a world without its own hangings)', CRATE: 'Supply crate', PAPER_STACK: 'Paper tower (decor)', SCROLL_PILE: 'Scroll pile (decor)', BOOKS: 'Book pile (decor)',
  LOOSE_A: 'Loose sheet on the floor (decor)', LOOSE_B: 'Loose sheet on the floor (decor)', GAUGE: 'Pressure gauge on the Sanctum pillars',
  CENSER: 'Censer', GATE: 'Grand gate frame: sessions enter and leave here', GATE_L: 'Grand gate, left leaf (slides open)',
  GATE_R: 'Grand gate, right leaf (slides open)', TABLE: 'Refectorium table', BENCH: 'Refectorium bench: long-idle scribes sleep here',
  BREAKOUT_FLOOR: 'Break-out room floor tile (temp-folder sessions)', BREAKOUT_RAIL: 'Break-out room rail, front and back edges',
  BREAKOUT_SIDE: 'Break-out room side rail, seen from above', BREAKOUT_POST: 'Break-out room post: corners and beside each gate',
  BREAKOUT_GATE: 'Break-out room gate, closed, in the side', BREAKOUT_GATE_OPEN: 'Break-out room gate leaf, swung open',
  BREAKOUT_GATE_FRONT: 'Break-out room gate facing the viewer (strip, 39° view)', BREAKOUT_GATE_FRONT_OPEN: 'Break-out room gate facing the viewer, open',
};
const FILL = { repeat: 'repeats both ways', 'repeat-x': 'repeats along x', 'repeat-y': 'repeats along y', nine: 'nine-slice (corners kept, edges and centre repeat)' };

export function catalog() {
  const out = [], theme = T;
  const dir = ART.dirOf(theme.id), srcOf = f => (ART.themed[theme.id]?.[f] ? `${theme.id}/${f}` : ART.themed[dir]?.[f] ? `${dir}/${f}` : f);
  const add = (id, group, src, cells, anim, note) => {
    const r0 = cells[0].rows;
    out.push({ id, group, family: src.split('/').pop(), src, cells, anim, note, size: `${Math.max(...r0.map(r => r.length)) / RES}×${r0.length / RES}` });
  };

  const sash = theme.sash[0];
  for (const r of RANKS) {
    const robe = { ...theme.rank[r].robe, y: sash }, model = ['opus', 'sonnet', 'haiku'].find(m => rankOf(m) === r);
    for (const dir of ['down', 'up', 'right', 'left']) add(`SCRIBE.${r}.${dir}`, 'Scribe (one per session)', srcOf('scribe'), SCRIBE[dir].map(rows => ({ rows, over: robe })), true, `${theme.text.rank[r]} (${model}), walking ${dir}, 3 frames`);
  }
  add('SCRIBE.sashes', 'Scribe (one per session)', srcOf('scribe'), theme.sash.map(y => ({ rows: SCRIBE.down[0], over: { y } })), false, 'Department colours (theme sash), one per project');
  for (const r of RANKS) for (const dir of ['down', 'up', 'right', 'left']) add(`ADEPT.${r}.${dir}`, 'Adept (one per subagent)', srcOf('adept'), ADEPT[dir].map(rows => ({ rows, over: theme.rank[r].adept })), true, `${theme.text.rank[r]} adept, walking ${dir}, 3 frames`);

  for (const dir of ['down', 'up', 'right', 'left']) add(`WATCH.${dir}`, 'Watchman (Night Vigil, while armed)', srcOf('watch'), WATCH[dir].map(rows => ({ rows, over: {} })), true, `The Watchman, walking ${dir} with his lantern, 3 frames`);
  add('WATCH.ring', 'Watchman (Night Vigil, while armed)', srcOf('watch'), [{ rows: WATCH.ring, over: {} }], false, 'The Watchman ringing his hand bell');

  // The Magos as seen (the arm over the body at its anchor), and the arm alone.
  const ax = MAGOS_AT.arm.x * RES, ay = MAGOS_AT.arm.y * RES;
  const seated = MAGOS.body.map((row, j) => [...row].map((c, i) => { const a = MAGOS.arm[j - ay]?.[i - ax]; return a && a !== '.' ? a : c; }).join(''));
  add('MAGOS', 'Magos (on the throne)', srcOf('magos'), [{ rows: seated, over: {} }], false, 'Seated Magos: the drill arm swings, the chest screen scans, the optics pulse (body and arm frames)');
  add('MAGOS.arm', 'Magos (on the throne)', srcOf('magos'), [{ rows: MAGOS.arm, over: {} }], false, 'The drill forearm, its own frame so it can swing');

  // 39° characters (wave 2): one generic section, listing every frame present for the active theme. Empty until an
  // art agent's PNG exists (sprites.js checkComplete39), so the viewer shows a world's frames the moment they land.
  // The frame names come from REQ39 (sprites.js), not repeated here: a walk frame is '<dir> <n>', everything else
  // ('arm', 'armL', 'scroll', 'body', 'skull'...) is a static extra.
  const CH39 = [
    { name: 'SCRIBE39', family: 'scribe39', obj: SCRIBE39 },
    { name: 'ADEPT39', family: 'adept39', obj: ADEPT39 },
    { name: 'MAGOS39', family: 'magos39', obj: MAGOS39 },
    { name: 'SKULL39', family: 'skull39', obj: SKULL39 },
    { name: 'WATCH39', family: 'watch39', obj: WATCH39 },
  ];
  for (const { name, family, obj } of CH39) {
    if (!Object.keys(obj).length) continue;
    const src = srcOf(family), extra = REQ39[family].frames.filter(n => !/^[EWSN] \d$/.test(n));
    for (const d of ['E', 'W', 'S', 'N']) if (obj[d]) add(`${name}.${d}`, '39° characters', src, obj[d].map(rows => ({ rows, over: {} })), true, `${name}, 39° view, walking ${d}, 3 frames`);
    for (const n of extra) add(`${name}.${n}`, '39° characters', src, [{ rows: obj[n], over: {} }], false, `${name}, ${n}`);
  }

  const VARIANTS = { // extra renders of maps that are drawn with overrides
    WINDOW: [['day', theme.ink.windowDay], ['night', theme.ink.windowNight]],
    WINDOW_TALL: [['day', theme.ink.windowDay], ['night', theme.ink.windowNight]],
    DESK: [['unlit', { f: null, F: null, c: theme.ink.screenOff }]],
    LECTERN: [['unlit', { f: null, F: null, c: theme.ink.screenOff }]],
    CONSOLE: [['unlit', { c: theme.ink.screenOff }]],
    SKULL: [['alarm', { o: theme.ink.alarm, O: theme.ink.alarmGlow }]],
  };
  for (const [name, rows] of Object.entries(MAPS)) {
    add(name, 'Props and furniture', SHEET_OF[name], [{ rows, over: {} }], false, ABOUT[name] ?? '?');
    for (const [v, over] of VARIANTS[name] ?? []) add(`${name}.${v}`, 'Props and furniture', SHEET_OF[name], [{ rows, over }], false, `${name}, ${v}`);
  }

  // Room tiles: each tile, and for tiles that repeat a 3x3 (or 6-long) sample of the fill, as it covers the floor or a wall.
  for (const [name, rows] of Object.entries(ROOM.frames)) {
    const t = ROOM.tiles[name] ?? {};
    const how = t.fill ? FILL[t.fill] + (t.top ? `, first row from \`${t.top}\`` : '') + (t.glow ? `, glows (${t.glow})` : '') : 'drawn as is';
    const n = t.fill === 'repeat' ? 3 : 1, nx = t.fill === 'repeat-x' ? 6 : n, ny = t.fill === 'repeat-y' ? 6 : n;
    const sample = Array.from({ length: rows.length * ny }, (_, j) => rows[j % rows.length].repeat(nx));
    add(`ROOM.${name.replace(/ /g, '_')}`, 'Room tiles', ROOM_SHEET_OF[name], [{ rows: sample, over: {} }], false, `\`${name}\`: ${how}${nx * ny > 1 ? ' (shown repeated)' : ''}`);
  }

  // Face sheets (ui/faces.js): the faces only the 39° view draws, side by side per object (main box side and top, its
  // screens' bezel sides and floors, then its details' sides, tops and disc rims). A world without its 39° art lists none.
  for (const name of FACE_OBJECTS) {
    const s = sheetOf(name), src = FACES.worlds[dir]?.objects[name] ? `${dir}/faces` : 'faces';
    const bezel = (pre, list = []) => list.flatMap(r => [[`${pre}${r.name} wall`, r.wallFrame], [`${pre}${r.name} floor`, r.floorFrame]]);
    const F = (FACES.worlds[dir]?.objects[name] ? FACES.worlds[dir] : FACES.base).frames; // a detail's drawn front, if any
    const faces = [['side', s.side], ['top', s.top], ...bezel('', s.recess), ...s.details.flatMap(d => (d.parts ?? [d]).flatMap(p =>
      [[`${p.name} front`, F[`${name} ${p.name} front`]], [`${p.name} side`, p.side], [`${p.name} top`, p.top], [`${p.name} rim`, p.rimFrame], ...bezel(`${p.name} `, p.recess)]))].filter(([, f]) => f);
    if (faces.length) add(`FACES.${name}`, 'Face sheets (39° side and top faces)', src, faces.map(([, rows]) => ({ rows, over: {} })), false, `${name}, 39° view only: ${faces.map(([k]) => k).join(', ')}`);
  }
  return out;
}
