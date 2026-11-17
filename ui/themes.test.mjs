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
