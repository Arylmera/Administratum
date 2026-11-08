// Writes a world's custom-room sheet (O10): node tools/enclave_art.mjs <theme id>. Its frames come from
// tools/enclave_art/<id>.mjs (default export: () => { name: rows of key.gpl chars }); tier2's is the base family
// (ui/art/enclave.*, every 40k theme), every other world's ui/art/<id>/enclave.* (its accent themes use it through
// artOf). Sizes: ui/layout.js ENCLAVE_SIZES (the break-out room's). The sash slot y is the part a rule's colour dyes.
import { sizedSheet } from './sheet_writer.mjs';
import { ENCLAVE_SIZES } from '../ui/layout.js';

const id = process.argv[2] ?? 'tier2';
const frames = (await import(`./enclave_art/${id}.mjs`)).default();
for (const n of Object.keys(ENCLAVE_SIZES)) if (!frames[n]?.some(r => r.includes('y'))) throw new Error(`${id} ${n}: no sash (y) to dye`);
sizedSheet(id === 'tier2' ? 'enclave' : `${id}/enclave`, id, frames, ENCLAVE_SIZES);
