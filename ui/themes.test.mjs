import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { THEMES } from './theme.js';
const { loadThemes, artRootOf } = await import('./themes.js');
const { readArt } = await import('./art.js');

// The shipped themes, registered over Ordo Administratum in the order of ui/art/themes.json.
assert.deepEqual(Object.keys(THEMES), ['tier2', 'forge', 'xenos', 'night', 'contrast', 'cyber', 'orbital', 'corpo', 'rain', 'matrix', 'synth', 'tower', 'vault', 'darwin', 'breakingbad']);
// A style draws with its base's art, in its base's world.
assert.equal(THEMES.rain.artOf, 'cyber');
assert.equal(THEMES.rain.world, 'cyber');

// sprites.js alone brings every theme (its art needs them before it loads).
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const n = execFileSync(process.execPath, ['--input-type=module', '-e',
  "await import('./ui/sprites.js'); console.log(Object.keys((await import('./ui/theme.js')).THEMES).length);"], { cwd: repo, encoding: 'utf8' });
assert.equal(n.trim(), '15', 'sprites.js alone registers the 15 themes');
// An art name ends up in a file path: one that is not a known family is refused before anything is read.
const art = execFileSync(process.execPath, ['--input-type=module', '-e',
  "const { defineTheme } = await import('./ui/theme.js'); defineTheme({ id: 'x', world: 'w40k', name: 'X', art: ['constructor'] });" +
  "await import('./ui/sprites.js').then(() => console.log('loaded'), e => console.log(e.message));"], { cwd: repo, encoding: 'utf8' });
assert.equal(art.trim(), "theme x: no art family 'constructor'");

// A theme's folder: its own for a shipped theme, the art folder itself for Ordo Administratum.
assert.ok(artRootOf('tier2').endsWith('/ui/art/'), artRootOf('tier2'));
assert.ok(artRootOf('vault').endsWith('/ui/art/vault/'), artRootOf('vault'));
// Every theme folder on disk is in ui/art/themes.json, and every id listed there has its folder with a theme.json.
const artDir = path.join(repo, 'ui', 'art'), listed = JSON.parse(fs.readFileSync(path.join(artDir, 'themes.json'), 'utf8'));
const onDisk = fs.readdirSync(artDir).filter(d => fs.existsSync(path.join(artDir, d, 'theme.json')));
assert.deepEqual(onDisk.filter(d => !listed.includes(d)), [], 'theme.json folders missing from themes.json');
assert.deepEqual(listed.filter(id => !onDisk.includes(id)), [], 'listed ids without a folder and its theme.json');

// A broken theme is refused, naming the theme and what is wrong; nothing is evaluated.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-themes-test-'));
try {
  const put = (id, text) => { fs.mkdirSync(path.join(tmp, id)); if (text !== undefined) fs.writeFileSync(path.join(tmp, id, 'theme.json'), text); };
  const rootOf = id => pathToFileURL(path.join(tmp, id) + '/').href;
  put('bad', '{ not json');
  put('gone');
  put('s', JSON.stringify({ format: 1, name: 'S', base: 'rain' }));
  put('w', JSON.stringify({ format: 1, name: 'W', world: 'w40k' }));
  // readArt names the file in a JSON that does not parse
  await assert.rejects(readArt('theme.json', 'json', rootOf('bad')), e => e.message.startsWith('theme.json: '), 'readArt: the file name');
  const refused = async (id, part) => {
    await assert.rejects(loadThemes([id], rootOf), e => e.message.startsWith(`theme ${id}: `) && e.message.includes(part), `${id}: names ${part}`);
    assert.ok(!(id in THEMES), `${id}: not registered`);
  };
  await refused('bad', 'bad/theme.json (theme.json: '); // not JSON: readArt's own parse error
  await refused('gone', 'gone/theme.json (ENOENT'); // no theme.json
  await refused('s', 'rain'); // a style cannot be a base
  // a theme loaded from elsewhere reads its art from there too
  await loadThemes(['w'], rootOf);
  assert.equal(artRootOf('w'), rootOf('w'));
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

// ---- packs (loadPacks): a folder of themes from outside, read through its reader, never trusted ----------------------
{
  const { loadPacks, PACKS, dropTheme, guarded } = await import('./themes.js');
  const { resolve, WORLDS, T, setTheme } = await import('./theme.js');
  const shipped = Object.keys(THEMES), looks = Object.fromEntries(shipped.map(id => [id, resolve(THEMES[id])])), worlds = { ...WORLDS };
  // An in-memory pack reader: `${dir}/${path}` -> text; a missing file rejects as fs does (code ENOENT). `asked`: every path read.
  const asked = [];
  const reader = files => async (dir, p) => {
    asked.push(`${dir}/${p}`);
    if (!Object.hasOwn(files, `${dir}/${p}`)) throw Object.assign(new Error(`${p}: not found`), { code: 'ENOENT' });
    const v = files[`${dir}/${p}`];
    return typeof v === 'string' ? new TextEncoder().encode(v) : v;
  };
  const J = o => JSON.stringify({ format: 1, ...o });
  const problems = id => PACKS.get(id).problems;
  await loadPacks([
    { id: 'alice/p', dir: 'alice__p', themes: ['rose', 'pink', 'steam'] }, // a style listed before its world
    { id: 'bob/q', dir: 'bob__q', themes: ['steam', 'rose'] },
    { id: 'carol/b', dir: 'carol__b', themes: ['bad', 'ok', '../x', '.hidden', 'gone', 'odd', 'twice', 'twice'] },
    { id: 'dave/x', dir: 'dave__x', themes: ['leech'] },
  ], reader({
    'alice__p/pink/theme.json': J({ name: 'Pink vault', base: 'vault', bands: [{ hue: [0, 360], to: 330 }] }),
    'alice__p/steam/theme.json': J({ name: 'Steam', world: 'steampunk', worldName: 'Steampunk' }),
    'alice__p/rose/theme.json': J({ name: 'Rose', base: 'steam' }),
    'bob__q/steam/theme.json': J({ name: 'Steam', world: 'steampunk', worldName: 'Bob steam' }),
    'bob__q/rose/theme.json': J({ name: 'Rose', base: 'steam' }),
    'carol__b/bad/theme.json': '{ not json',
    'carol__b/ok/theme.json': J({ name: 'Ok', base: 'tier2' }),
    'carol__b/odd/theme.json': '"a text"',
    'carol__b/twice/theme.json': J({ name: 'Twice', world: 'w40k' }),
    'dave__x/leech/theme.json': J({ name: 'Leech', base: 'alice/p:steam' }),
  }));
  // a style of a shipped world joins it; the pack's problems are empty
  assert.equal(THEMES['alice/p:pink']?.world, 'vault');
  assert.equal(THEMES['alice/p:pink'].artOf, 'vault');
  assert.deepEqual(problems('alice/p'), []);
  // a pack's world is its own (`<pack>:<world>`), with its style, whichever order the pack lists them in
  for (const p of ['alice/p', 'bob/q']) {
    assert.equal(THEMES[`${p}:steam`]?.world, `${p}:steampunk`, p);
    assert.equal(THEMES[`${p}:rose`]?.world, `${p}:steampunk`, p);
    assert.equal(THEMES[`${p}:rose`].artOf, `${p}:steam`, p);
  }
  assert.equal(WORLDS['alice/p:steampunk'], 'Steampunk');
  assert.equal(WORLDS['bob/q:steampunk'], 'Bob steam');
  // registered world themes first, then styles, each in the pack's order; the panel's list
  assert.deepEqual(PACKS.get('alice/p').themes, [
    { id: 'alice/p:steam', name: 'Steam', world: 'alice/p:steampunk', style: false },
    { id: 'alice/p:rose', name: 'Rose', world: 'alice/p:steampunk', style: true },
    { id: 'alice/p:pink', name: 'Pink vault', world: 'vault', style: true }]);
  assert.equal(PACKS.get('alice/p').dir, 'alice__p');
  // a broken theme is left out with its reason; the rest of its pack is registered
  assert.ok(!('carol/b:bad' in THEMES));
  const bad = problems('carol/b').find(p => p.theme === 'bad');
  assert.ok(bad?.message.includes('bad/theme.json'), JSON.stringify(bad));
  assert.ok(THEMES['carol/b:ok'], 'the pack\'s other theme');
  assert.ok(THEMES['carol/b:twice'], 'a folder listed twice: the first');
  const said = Object.fromEntries(problems('carol/b').map(p => [p.theme, p.message]));
  assert.deepEqual(Object.keys(said).sort(), ['.hidden', '../x', 'bad', 'gone', 'odd', 'twice'].sort(), JSON.stringify(said));
  assert.ok(said.gone.includes('gone/theme.json'), said.gone);
  assert.ok(said.odd.includes('not an object'), said.odd);
  // a folder that is not a plain name is never read
  assert.ok(!asked.some(p => p.includes('..') || p.includes('.hidden')), asked.join(' '));
  // a base in another pack is refused, naming it
  assert.ok(!('dave/x:leech' in THEMES));
  assert.ok(problems('dave/x')[0]?.message.includes('alice/p:steam'), JSON.stringify(problems('dave/x')));
  // hostile packs and readers: never a throw
  const hostile = [
    null, 'x', { id: 'e/1' }, { id: 'e/2', dir: 'd', themes: 'pink' }, { id: 'e:3', dir: 'd', themes: [] }, { get id() { throw new Error('getter'); } },
    { id: 'e/4', dir: 'd', themes: ['a', 'b', 'c', 'd', 7] }, { id: 'alice/p', dir: 'again', themes: [] },
  ];
  await loadPacks(hostile, (dir, p) => {
    if (p === 'a/theme.json') throw new Error('sync throw');
    if (p === 'b/theme.json') return 'not bytes';
    if (p === 'c/theme.json') return Promise.reject(new Error('nope'));
    return new TextEncoder().encode(J({ name: 'D', world: 'w40k', ui: { '--bg': 'url(x)' } }));
  });
  await loadPacks(null, () => {});
  await loadPacks([{ id: 'e/5', dir: 'd', themes: ['a'] }], null);
  assert.equal(PACKS.get('alice/p').dir, 'alice__p', 'a pack id seen twice: the first stays');
  for (const f of ['a', 'b', 'c', 'd', '7']) assert.equal(PACKS.get('e/4').problems.filter(p => p.theme === f).length, 1, `e/4 ${f}`);
  assert.equal(Object.keys(THEMES).filter(id => id.startsWith('e/')).length, 0);
  // the shipped themes: the same, in the same order, looking the same; a shipped world keeps its name
  assert.deepEqual(Object.keys(THEMES).slice(0, shipped.length), shipped);
  for (const id of shipped) assert.deepEqual(resolve(THEMES[id]), looks[id], id);
  for (const [w, name] of Object.entries(worlds)) assert.equal(WORLDS[w], name, w);
  // dropTheme: a shipped theme cannot be dropped
  assert.throws(() => dropTheme('vault', 'x'));
  assert.ok(THEMES.vault);
  // dropping a pack's world takes its styles with it, and the world when nothing is left in it
  dropTheme('bob/q:steam', 'gone for the test');
  assert.ok(!('bob/q:steam' in THEMES) && !('bob/q:rose' in THEMES));
  assert.ok(!('bob/q:steampunk' in WORLDS));
  assert.deepEqual(PACKS.get('bob/q').themes, []);
  assert.deepEqual(PACKS.get('bob/q').problems.map(p => p.theme), ['steam', 'rose']);
  // guarded: a draw that throws under a pack's theme falls back to Ordo Administratum and leaves that theme out
  setTheme('alice/p:pink');
  assert.equal(T.id, 'alice/p:pink');
  const draw = guarded(x => { if (x) throw new Error('boom'); return 'drawn'; });
  assert.equal(draw(0), 'drawn');
  assert.doesNotThrow(() => draw(1));
  assert.equal(T.id, 'tier2');
  assert.ok(!('alice/p:pink' in THEMES));
  assert.ok(problems('alice/p').some(p => p.theme === 'pink' && p.message.includes('boom')), JSON.stringify(problems('alice/p')));
  // under a shipped theme it throws as before
  setTheme('vault');
  assert.throws(() => draw(1), /boom/);
  assert.equal(T.id, 'vault');
  setTheme('tier2');
}

// A pack's art, as sprites.js and faces.js load it (a child process: their top-level awaits walk THEMES once, so the
// pack is registered first): read through the pack's reader, checked; a broken sheet leaves its theme out, named.
{
  const script = `
    const fs = await import('node:fs');
    const { loadPacks, PACKS } = await import('./ui/themes.js');
    const disk = f => new Uint8Array(fs.readFileSync('ui/art/' + f));
    const faces = JSON.parse(fs.readFileSync('ui/art/faces.json', 'utf8'));
    const { deflateSync, crc32 } = await import('node:zlib');
    const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length), t = Buffer.concat([Buffer.from(type), data]); b.writeUInt32BE(data.length); t.copy(b, 4); b.writeUInt32BE(crc32(t), 8 + data.length); return b; };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6; // 1x1 RGBA, one pixel off the key palette
    const red = new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 1, 255]))), chunk('IEND', Buffer.alloc(0))]));
    const desk = d => JSON.stringify({ ...faces, meta: { ...faces.meta, objects: { ...faces.meta.objects, DESK: { ...faces.meta.objects.DESK, d } } } });
    const files = {
      'p/good/theme.json': JSON.stringify({ format: 1, name: 'Good', base: 'vault', art: ['breakout'] }),
      'p/good/breakout.json': fs.readFileSync('ui/art/vault/breakout.json', 'utf8'), 'p/good/breakout.png': disk('vault/breakout.png'),
      'p/extra/theme.json': JSON.stringify({ format: 1, name: 'Extra', base: 'vault', art: ['breakout'] }),
      'p/extra/breakout.json': JSON.stringify({ frames: { NOT_A_FRAME: { frame: { x: 0, y: 0, w: 1, h: 1 } } }, meta: {} }), 'p/extra/breakout.png': disk('breakout.png'),
      'p/pixel/theme.json': JSON.stringify({ format: 1, name: 'Pixel', base: 'vault', art: ['breakout'] }),
      'p/pixel/breakout.json': JSON.stringify({ frames: { BREAKOUT_FLOOR: { frame: { x: 0, y: 0, w: 1, h: 1 } } }, meta: {} }), 'p/pixel/breakout.png': red,
      'p/fam/theme.json': JSON.stringify({ format: 1, name: 'Fam', base: 'vault', art: ['constructor'] }),
      'p/world/theme.json': JSON.stringify({ format: 1, name: 'World', world: 'w', worldName: 'W', art: ['breakout'] }),
      'p/world/breakout.json': fs.readFileSync('ui/art/vault/breakout.json', 'utf8'), 'p/world/breakout.png': disk('vault/breakout.png'),
      'p/world/faces.json': desk(7),
      'p/world/faces.png': disk('faces.png'),
      'p/own/theme.json': JSON.stringify({ format: 1, name: 'Own', base: 'world', art: ['breakout'] }),
      'p/own/breakout.json': fs.readFileSync('ui/art/vault/breakout.json', 'utf8'), 'p/own/breakout.png': disk('vault/breakout.png'),
      'p/own/faces.json': desk(9),
      'p/own/faces.png': disk('faces.png'),
      'p/inherit/theme.json': JSON.stringify({ format: 1, name: 'Inherit', base: 'world', art: ['breakout'] }),
      'p/inherit/breakout.json': fs.readFileSync('ui/art/vault/breakout.json', 'utf8'), 'p/inherit/breakout.png': disk('vault/breakout.png'),
      'p/sphere/theme.json': JSON.stringify({ format: 1, name: 'Sphere', world: 'w', art: ['breakout'] }),
      'p/sphere/breakout.json': fs.readFileSync('ui/art/vault/breakout.json', 'utf8'), 'p/sphere/breakout.png': disk('vault/breakout.png'),
      'p/sphere/faces.json': JSON.stringify({ ...faces, meta: { ...faces.meta, objects: { ...faces.meta.objects, DESK: { ...faces.meta.objects.DESK, details: [{ name: 'ball', kind: 'sphere', rect: [0, 0, 1, 1] }] } } } }),
      'p/sphere/faces.png': disk('faces.png'),
      'p/nopng/theme.json': JSON.stringify({ format: 1, name: 'No PNG', world: 'w', art: ['breakout'] }),
      'p/nopng/breakout.json': fs.readFileSync('ui/art/vault/breakout.json', 'utf8'), 'p/nopng/breakout.png': disk('vault/breakout.png'),
      'p/nopng/faces.json': desk(7),
    };
    const read = async (dir, p) => { if (!(dir + '/' + p in files)) throw Object.assign(new Error(p + ': not found'), { code: 'ENOENT' }); const v = files[dir + '/' + p]; return typeof v === 'string' ? new TextEncoder().encode(v) : v; };
    await loadPacks([{ id: 'a/p', dir: 'p', themes: ['good', 'extra', 'pixel', 'fam', 'world', 'own', 'inherit', 'sphere', 'nopng'] }], read);
    const { ART } = await import('./ui/sprites.js');
    const { FACES, sheetOf } = await import('./ui/faces.js');
    const { THEMES } = await import('./ui/theme.js');
    const { MAPS } = await import('./ui/sprites.js');
    const d = id => sheetOf('DESK', MAPS.DESK, id)?.d;
    console.log(JSON.stringify({ themes: Object.keys(THEMES).filter(id => id.startsWith('a/p:')), problems: PACKS.get('a/p').problems,
      good: Object.keys(ART.themed['a/p:good'] ?? {}), d: { world: d('a/p:world'), own: d('a/p:own'), inherit: d('a/p:inherit'), vault: d('vault') } }));`;
  const out = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: repo, encoding: 'utf8' }));
  assert.deepEqual(out.themes.sort(), ['a/p:good', 'a/p:inherit', 'a/p:own', 'a/p:world'].sort(), JSON.stringify(out));
  const said = Object.fromEntries(out.problems.map(p => [p.theme, p.message]));
  assert.deepEqual(Object.keys(said).sort(), ['extra', 'fam', 'nopng', 'pixel', 'sphere'], JSON.stringify(said));
  assert.ok(said.nopng.startsWith('nopng/faces.png: '), said.nopng); // its faces.json is there: a missing PNG is a fault, not absence
  assert.ok(said.extra.includes('breakout') && said.extra.includes('NOT_A_FRAME'), said.extra);
  assert.ok(said.pixel.startsWith('pixel/breakout.png: pixel '), said.pixel);
  assert.ok(said.fam.includes("'constructor'"), said.fam);
  assert.ok(said.sphere.startsWith('sphere/faces') && said.sphere.includes('sphere'), said.sphere);
  assert.deepEqual(out.good, ['breakout']);
  // faces: a pack's world its own; a style with its own art its own faces.json, else its base's
  assert.equal(out.d.world, 7);
  assert.equal(out.d.own, 9);
  assert.equal(out.d.inherit, 7);
}

// Hostile art files, a few bytes each, that would claim the memory of the start: a frame rect far outside its image,
// a second IHDR after a small first one, an IDAT inflating far past what its header holds. Refused before anything
// large is allocated (a child process on a small heap, so a regression fails fast instead of hanging the suite).
{
  const script = `
    const fs = await import('node:fs');
    const { deflateSync, crc32 } = await import('node:zlib');
    const { loadPacks, PACKS } = await import('./ui/themes.js');
    const { decodePng } = await import('./ui/png.js');
    const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length), t = Buffer.concat([Buffer.from(type), data]); b.writeUInt32BE(data.length); t.copy(b, 4); b.writeUInt32BE(crc32(t), 8 + data.length); return b; };
    const ihdr = (w, h) => { const d = Buffer.alloc(13); d.writeUInt32BE(w); d.writeUInt32BE(h, 4); d[8] = 8; d[9] = 6; return chunk('IHDR', d); };
    const png = (...chunks) => new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks, chunk('IEND', Buffer.alloc(0))]));
    const pixel = deflateSync(Buffer.from([0, 0, 0, 0, 0]));
    const twice = png(ihdr(1, 1), ihdr(8000, 8000), chunk('IDAT', pixel));
    const bomb = png(ihdr(1, 1), chunk('IDAT', deflateSync(Buffer.alloc(64e6))));
    const late = png(chunk('tEXt', Buffer.from('a')), ihdr(1, 1), chunk('IDAT', pixel));
    const said = async b => decodePng(b).then(() => 'decoded', e => e.message);
    const out = { twice: await said(twice), bomb: await said(bomb), late: await said(late), one: await said(png(ihdr(1, 1), chunk('IDAT', pixel))) };
    const sheet = rect => JSON.stringify({ frames: { BREAKOUT_FLOOR: { frame: rect } }, meta: {} });
    const files = {};
    const theme = (f, json, bytes) => { files['p/' + f + '/theme.json'] = JSON.stringify({ format: 1, name: f, base: 'vault', art: ['breakout'] }); files['p/' + f + '/breakout.json'] = json; files['p/' + f + '/breakout.png'] = bytes; };
    theme('tall', sheet({ x: 0, y: 0, w: 0, h: 5e7 }), png(ihdr(1, 1), chunk('IDAT', pixel)));
    theme('wide', sheet({ x: 0, y: 0, w: 5e7, h: 1 }), png(ihdr(1, 1), chunk('IDAT', pixel)));
    theme('frac', sheet({ x: 0.5, y: 0, w: 1, h: 1 }), png(ihdr(1, 1), chunk('IDAT', pixel)));
    theme('twice', sheet({ x: 0, y: 0, w: 1, h: 1 }), twice);
    theme('bomb', sheet({ x: 0, y: 0, w: 1, h: 1 }), bomb);
    const read = async (dir, p) => { if (!(dir + '/' + p in files)) throw Object.assign(new Error(p + ': not found'), { code: 'ENOENT' }); const v = files[dir + '/' + p]; return typeof v === 'string' ? new TextEncoder().encode(v) : v; };
    await loadPacks([{ id: 'h/p', dir: 'p', themes: ['tall', 'wide', 'frac', 'twice', 'bomb'] }], read);
    await import('./ui/sprites.js');
    out.problems = Object.fromEntries(PACKS.get('h/p').problems.map(p => [p.theme, p.message]));
    console.log(JSON.stringify(out));`;
  const out = JSON.parse(execFileSync(process.execPath, ['--max-old-space-size=64', '--input-type=module', '-e', script], { cwd: repo, encoding: 'utf8', timeout: 60_000 }));
  assert.match(out.twice, /IHDR/, out.twice);
  assert.match(out.bomb, /inflates past/, out.bomb);
  assert.match(out.late, /IHDR/, out.late);
  assert.equal(out.one, 'decoded');
  assert.deepEqual(Object.keys(out.problems).sort(), ['bomb', 'frac', 'tall', 'twice', 'wide'], JSON.stringify(out.problems));
  for (const f of ['tall', 'wide', 'frac']) assert.ok(out.problems[f].startsWith(`${f}/breakout.json: frame 'BREAKOUT_FLOOR'`), out.problems[f]);
  for (const f of ['twice', 'bomb']) assert.ok(out.problems[f].startsWith(`${f}/breakout.png: `), out.problems[f]);
}

// At start, after the shipped themes: the packs the backend lists, read through its command (raw bytes), each read and
// the list itself bounded by 10 s. A child process on the fake backend (ui/testdom.mjs), so themes.js meets it at import.
{
  const run = setup => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
    const { install, replies, calls, tick, flush } = await import('./ui/testdom.mjs');
    install();
    const files = { 'p/pink/theme.json': JSON.stringify({ format: 1, name: 'Pink', base: 'vault', art: [] }) };
    replies.theme_pack_file = ({ path }) => (path in files ? new TextEncoder().encode(files[path]).buffer : new Error('not found'));
    ${setup}
    const loaded = import('./ui/themes.js');
    const settle = async () => { for (let i = 0; i < 30; i++) { await flush(); tick(1000); } };
    await settle();
    const { PACKS, readPack } = await loaded;
    const { THEMES } = await import('./ui/theme.js');
    const read = readPack('p', 'pink/faces.json').then(() => 'read', e => e.code ?? e.message);
    await settle();
    const code = await read;
    console.log(JSON.stringify({ themes: Object.keys(THEMES), packs: [...PACKS.keys()], problems: [...PACKS.values()].flatMap(p => p.problems),
      reads: calls.filter(c => c.name === 'theme_pack_file').map(c => c.args.path), code }));`], { cwd: repo, encoding: 'utf8', timeout: 60_000 }));
  const shipped = ['tier2', 'forge', 'xenos', 'night', 'contrast', 'cyber', 'orbital', 'corpo', 'rain', 'matrix', 'synth', 'tower', 'vault', 'darwin', 'breakingbad'];
  const one = [{ id: 'a/p', dir: 'p', repo: 'a/p', installed: '2026-11-16T10:00:00Z', themes: ['pink'] }];
  const ok = run(`replies.theme_packs = ${JSON.stringify(one)};`);
  assert.deepEqual(ok.themes, [...shipped, 'a/p:pink'], JSON.stringify(ok));
  assert.deepEqual(ok.problems, []);
  assert.ok(ok.reads.includes('p/pink/theme.json'), JSON.stringify(ok.reads));
  assert.equal(ok.code, 'ENOENT', 'a file the backend will not serve is a missing file');
  for (const [why, setup] of [
    ['the list call rejects', "replies.theme_packs = new Error('boom');"],
    ['the list call hangs', 'replies.theme_packs = () => new Promise(() => {});'],
    ['the list is not a list', "replies.theme_packs = 'nonsense';"],
  ]) {
    const out = run(setup);
    assert.deepEqual(out.themes, shipped, why);
    assert.deepEqual(out.packs, [], why);
  }
  // a read that never settles fails at 10 s: its theme is left out with the reason, the start goes on
  const hung = run(`replies.theme_packs = ${JSON.stringify(one)}; replies.theme_pack_file = () => new Promise(() => {});`);
  assert.deepEqual(hung.themes, shipped);
  assert.match(hung.problems[0]?.message ?? '', /timed out/, JSON.stringify(hung.problems));
  assert.equal(hung.code, 'timed out');
}
