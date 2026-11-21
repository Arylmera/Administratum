// The author's kit for theme packs (docs/theme-packs.md). No dependencies, no backend.
//   node tools/theme_pack.mjs check <folder>   a pack (a folder of theme folders) or one theme folder (its parent is
//                                              then the pack, and only that theme is reported)
//   node tools/theme_pack.mjs families         the art families a theme may redraw, their frames and sizes (Markdown)
// `check` loads the pack the way the app does, not through a copy of its rules: ui/themes.js (the shipped themes),
// then its loadPacks with a reader on the file system that serves what the backend serves (packs.rs read), then
// ui/sprites.js and ui/faces.js, which load and check every theme's art. One line per problem (`<theme>: <message>`),
// then `<n> themes ok, <m> with problems`; exit 0 only when there is none. What the installer would drop or refuse
// (packs.rs keepable and its limits), a scribe's gesture frame that would never play (artcheck.js gestureWarnings), a
// rank frame that never plays or a rank drawn in one view only (rankWarnings) and
// a frame this version of the app does not know, which it ignores (a pack drawn for a newer app, or a typo: themes.js
// PACKS warnings), come as `warning:` lines; a limit passed, a theme folder misnamed or no theme at
// all is a problem, since the installer or the app refuses it. The pack is parsed, never evaluated.
import fs from 'node:fs';
import path from 'node:path';
import { loadPacks, PACKS } from '../ui/themes.js'; // first: it registers the shipped themes
import { gestureWarnings, rankWarnings } from '../ui/artcheck.js';
import { RANK_FAMILIES } from '../ui/ranks.js';
import { GESTURE_FRAMES } from '../ui/gestures.js';

const [cmd, arg] = process.argv.slice(2);
const usage = () => { console.error('usage: node tools/theme_pack.mjs check <folder> | families'); process.exit(2); };

// ---- the installer's rules (src-tauri/src/packs.rs) ----------------------------------------------------------------
const MAX_FILE = 2 * 1024 * 1024, MAX_FILES = 2000, MAX_TOTAL = 50 * 1024 * 1024;
const LICENCES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'];
const plain = s => !!s && !s.startsWith('.') && /^[A-Za-z0-9._-]+$/.test(s);
const reserved = name => { const s = name.split('.')[0].toUpperCase(); return ['CON', 'PRN', 'AUX', 'NUL'].includes(s) || /^(COM|LPT)[1-9]$/.test(s); };
const art = f => f.endsWith('.json') || f.endsWith('.png');
// Why the installer drops the file at `rel` (segments under the pack), or null when it keeps it.
function dropped([d, f, ...deeper]) {
  if (f === undefined) return d === 'pack.json' || LICENCES.includes(d) ? null : 'only pack.json and a licence are kept at the top';
  if (deeper.length) return 'more than one folder deep';
  if (!plain(d) || d.endsWith('.')) return `the folder name ${JSON.stringify(d)} is not kept (letters, digits, . - _, no leading or trailing .)`;
  if (reserved(d)) return `the folder name ${JSON.stringify(d)} is not kept (a name Windows keeps for a device)`;
  if (d === 'pack-source.json' || d === 'pack.json' || LICENCES.includes(d)) return `the folder name ${JSON.stringify(d)} is not kept (the name of a file at the top of the pack)`;
  if (!plain(f) || reserved(f)) return 'not a plain file name (letters, digits, . - _, no leading .)';
  if (!art(f)) return 'only .json and .png are kept';
  return null;
}

// ---- check ---------------------------------------------------------------------------------------------------------
async function check(target) {
  const at = path.resolve(target);
  if (!fs.statSync(at, { throwIfNoEntry: false })?.isDirectory()) { console.error(`not a folder: ${target}`); process.exit(2); }
  const single = fs.existsSync(path.join(at, 'theme.json')), dir = single ? path.dirname(at) : at, only = single ? path.basename(at) : null;
  const isFile = p => fs.lstatSync(p, { throwIfNoEntry: false })?.isFile() === true;

  // What the installer keeps, drops or refuses. The repository's own files at the top (a README, .git, .github) are
  // its business: only a misnamed folder there is worth a word.
  // A theme folder whose name the app does not read is a problem, not a warning: that theme never loads. One the app
  // reads but the installer drops (a trailing ., a device name) is one too: published, it never arrives.
  const warnings = [], problems = [], misnamed = [];
  let files = 0, total = 0;
  const walk = (abs, rel) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const segs = [...rel, e.name], p = path.join(abs, e.name), shown = segs.join('/');
      if (!rel.length && e.name.startsWith('.')) continue;
      if (e.isSymbolicLink()) { warnings.push(`${shown}: the installer drops it: a link`); continue; }
      if (e.isDirectory()) {
        const why = rel.length ? 'more than one folder deep' : dropped([e.name, 'x.json']); // a folder: as a file in it
        if (why && !rel.length && isFile(path.join(p, 'theme.json'))) { misnamed.push(e.name); problems.push(`${e.name}: ${plain(e.name) ? 'the installer drops this theme' : 'the app does not read this theme'}: ${why}`); }
        else if (why) warnings.push(`${shown}/: the installer drops it: ${why}`); else walk(p, segs);
        continue;
      }
      if (!e.isFile()) continue;
      const why = dropped(segs), size = fs.statSync(p).size;
      if (why) { if (rel.length) warnings.push(`${shown}: the installer drops it: ${why}`); continue; }
      if (size > MAX_FILE) { warnings.push(`${shown}: the installer drops it: over 2 MiB`); continue; }
      files++; total += size;
    }
  };
  walk(dir, []);
  if (files > MAX_FILES) problems.push(`pack: the installer refuses it: more than ${MAX_FILES} files`);
  if (total > MAX_TOTAL) problems.push(`pack: the installer refuses it: more than ${MAX_TOTAL >> 20} MiB`);
  if (!isFile(path.join(dir, 'pack.json'))) warnings.push('pack.json: missing (a published pack has one: { "format": 1, "name": "..." })');
  if (!LICENCES.some(l => isFile(path.join(dir, l)))) warnings.push(`no licence file (${LICENCES.join(', ')}): a published pack needs one`);

  // The pack as the backend lists it (packs.rs list): its plain-named folders holding a theme.json, sorted.
  const themes = fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory() && plain(e.name) && isFile(path.join(dir, e.name, 'theme.json'))).map(e => e.name).sort();
  // One theme folder: only its own warnings and problems (the pack's limits stay: they refuse it too).
  if (only) {
    const own = w => w.startsWith(`${only}/`);
    warnings.splice(0, Infinity, ...warnings.filter(own));
    problems.splice(0, Infinity, ...problems.filter(p => p.startsWith(`${only}: `) || p.startsWith('pack: ')));
  }
  if (single && !themes.includes(only)) return report(warnings, problems, 0, 1);
  // The reader the backend is (packs.rs read): `<folder>/<name>.json|png`, plain segments, a regular file of at most
  // 2 MiB; anything else is a missing file.
  const absent = () => Object.assign(new Error('not found'), { code: 'ENOENT' });
  const read = async (d, rel) => {
    const s = rel.split('/');
    if (s.length !== 2 || !s.every(plain) || !art(s[1])) throw absent();
    const p = path.join(d, ...s), st = fs.lstatSync(p, { throwIfNoEntry: false });
    if (!st?.isFile() || st.size > MAX_FILE) throw absent();
    return new Uint8Array(fs.readFileSync(p));
  };
  const id = `local/${path.basename(dir)}`;
  await loadPacks([{ id, dir, themes }], read);
  await import('../ui/sprites.js'); // the art, checked; a theme whose art fails is dropped with its reason
  await import('../ui/faces.js');

  // a gesture frame that loads but never plays (artcheck.js gestureWarnings): the sheet's JSON, parsed, never run
  for (const t of themes.filter(t => !only || t === only)) for (const f of Object.keys(GESTURE_FRAMES)) {
    const p = path.join(dir, t, `${f}.json`);
    if (!isFile(p)) continue;
    let frames = [];
    try { frames = Object.keys(JSON.parse(fs.readFileSync(p, 'utf8')).frames ?? {}); } catch { continue; } // a broken sheet is the loader's problem
    warnings.push(...gestureWarnings(`${t}/${f}`, frames));
  }
  // a rank frame that never plays, or a rank drawn in one view only (artcheck.js rankWarnings)
  const sheetJson = (t, f) => { const p = path.join(dir, t, `${f}.json`); if (!isFile(p)) return null; try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
  const namesOf = (t, f) => { const j = sheetJson(t, f); return j ? Object.keys(j.frames ?? {}) : null; };
  for (const t of themes.filter(t => !only || t === only)) for (const f of RANK_FAMILIES) {
    const frames = namesOf(t, f);
    if (frames) warnings.push(...rankWarnings(`${t}/${f}`, frames, namesOf(t, f.endsWith('39') ? f.slice(0, -2) : `${f}39`), Object.keys(sheetJson(t, f)?.meta?.anchors ?? {})));
  }
  const entry = PACKS.get(id), mine = t => !only || t === only;
  // a reason the loader leaves empty (a truncated PNG's decoder says nothing) still says something
  const reason = m => (/:\s*$/.test(m) ? `${m.trimEnd()} ${/\.png:\s*$/.test(m) ? 'unreadable PNG' : 'unreadable'}` : m);
  for (const { theme, message } of entry.warnings) if (mine(theme)) warnings.push(`${theme}: ${message}`);
  for (const { theme, message } of entry.problems) if (theme === null ? !only : mine(theme)) problems.push(`${theme ?? 'pack'}: ${reason(message)}`);
  const ok = entry.themes.filter(t => { const f = t.id.slice(id.length + 1); return mine(f) && !misnamed.includes(f); }).length; // a misnamed one: once, with problems
  const bad = new Set(entry.problems.filter(p => p.theme !== null && mine(p.theme)).map(p => p.theme)).size;
  report(warnings, problems, ok, bad + misnamed.filter(mine).length);
}
// The lines, the count, the exit code. No theme at all fails: the installer refuses a pack without one (packs.rs).
function report(warnings, problems, ok, bad) {
  if (!ok && !bad) problems.push('no theme found: a theme is a folder holding theme.json, at the top of the pack');
  for (const w of warnings) console.log(`warning: ${w}`);
  for (const p of problems) console.log(p);
  console.log(`${ok} theme${ok === 1 ? '' : 's'} ok, ${bad} with problems`);
  process.exit(problems.length ? 1 : 0);
}

// ---- families ------------------------------------------------------------------------------------------------------
// The default art, as sprites.js loaded it: each family's frames with their sizes (a theme's frame keeps its size).
async function families() {
  const { ART, FAMILIES39 } = await import('../ui/sprites.js');
  const { GESTURE_FRAMES, SEATED_FRAME } = await import('../ui/gestures.js');
  console.log('| Family | Frames (name width x height, in art pixels) |\n|---|---|');
  for (const [f, sheet] of Object.entries(ART.base)) {
    const size = rows => `${rows[0].length}x${rows.length}`, seated = sheet.frames[SEATED_FRAME[f]];
    const { rankPart, RANK_FAMILIES } = await import('../ui/ranks.js');
    const frames = Object.entries(sheet.frames).filter(([n]) => !rankPart(n)).map(([n, rows]) => `\`${n}\` ${size(rows)}`);
    // the optional gestures (gestures.js) the default does not draw, at its seated frame's size
    const optional = seated ? (GESTURE_FRAMES[f] ?? []).filter(n => !sheet.frames[n]).map(n => `\`${n}\` ${size(seated)}`) : [];
    const ranks = RANK_FAMILIES.includes(f) ? '; ranks: `<rank> <frame>` at its frame size (see Ranks)' : '';
    console.log(`| \`${f}\`${FAMILIES39.includes(f) ? ' (2.5D)' : ''} | ${frames.join(', ') || '(none yet)'}${optional.length ? `; optional: ${optional.join(', ')}` : ''}${ranks} |`);
  }
}

if (cmd === 'check' && arg) await check(arg);
else if (cmd === 'families' && !arg) await families();
else usage();
