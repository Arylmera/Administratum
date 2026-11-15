import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { THEMES } from './theme.js';
const { loadThemes, artRootOf } = await import('./themes.js');

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

// A broken theme is refused, naming the theme and what is wrong; nothing is evaluated.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-themes-test-'));
try {
  const put = (id, text) => { fs.mkdirSync(path.join(tmp, id)); if (text !== undefined) fs.writeFileSync(path.join(tmp, id, 'theme.json'), text); };
  const rootOf = id => pathToFileURL(path.join(tmp, id) + '/').href;
  put('bad', '{ not json');
  put('gone');
  put('s', JSON.stringify({ format: 1, name: 'S', base: 'rain' }));
  const refused = async (id, part) => {
    await assert.rejects(loadThemes([id], rootOf), e => e.message.startsWith(`theme ${id}: `) && e.message.includes(part), `${id}: names ${part}`);
    assert.ok(!(id in THEMES), `${id}: not registered`);
  };
  await refused('bad', 'bad/theme.json'); // not JSON
  await refused('gone', 'gone'); // no theme.json
  await refused('s', 'rain'); // a style cannot be a base
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
