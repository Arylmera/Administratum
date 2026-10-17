// The art gate (CI: .github/workflows/check.yml): reruns every art generator and every gallery, then fails if
// ui/art or docs/sprites changed, i.e. a committed sheet or gallery is stale. Run from a clean tree:
//   node tools/art_gate.mjs
// Generators: one per module under tools/<gen>/ (kit.mjs is shared). Galleries: the default, plus --theme for every
// theme folder under ui/art/.
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const run = (...args) => { console.log(`> node ${args.join(' ')}`); execFileSync(process.execPath, args, { stdio: 'inherit' }); };
const ids = dir => readdirSync(dir).filter(f => f.endsWith('.mjs') && f !== 'kit.mjs').map(f => f.slice(0, -4)).sort();
for (const gen of ['watch_art', 'breakout_art', 'suzerain_art']) for (const id of ids(`tools/${gen}`)) run(`tools/${gen}.mjs`, id);
run('tools/sprite_sheet.mjs');
for (const d of readdirSync('ui/art', { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()) run('tools/sprite_sheet.mjs', '--theme', d);

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' });
const dirty = git('status', '--porcelain', '--', 'ui/art', 'docs/sprites');
if (dirty) {
  console.error(`\nStale art: regenerate and commit these.\n${dirty}\n${git('diff', '--stat', '--', 'ui/art', 'docs/sprites')}`);
  process.exit(1);
}
console.log('art gate ok: every sheet and gallery matches its generator');
