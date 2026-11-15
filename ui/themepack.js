// A theme from its JSON (themes/<id>/theme.json): checked, never evaluated, then turned into what defineTheme takes.
// A world theme is its JSON as it stands; a style (it names a `base`) is its base's colours moved hue range by hue
// range ("bands"), with its own parts laid over.
import { resolve, TEXT } from './theme.js';

export const FONTS = ["'VT323', monospace", "'Pirata One', serif"];

// Rehue one colour: [r,g,b] in a band's hue range goes to hue `to`, saturation x `sat`, lightness + `light`.
// A range with from > to wraps past 360 (345 to 15). Greys and colours out of every range are kept.
function rehue(rgb, bands) {
  const [r, g, b] = rgb.map(c => c / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  if (!d) return rgb;
  const h = 60 * (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4);
  const band = bands.find(({ hue: [lo, hi] }) => lo <= hi ? h >= lo && h < hi : h >= lo || h < hi);
  if (!band) return rgb;
  const { to: H, sat = 1, light = 0 } = band, L = Math.min(1, Math.max(0, l + light)), S = Math.min(1, d / (1 - Math.abs(2 * l - 1)) * sat);
  const a = S * Math.min(L, 1 - L), k = n => (n + H / 30) % 12;
  return [0, 8, 4].map(n => Math.round(255 * (L - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))));
}
// Every '#rrggbb', 'rgba(r,g,b,a)' and 'r,g,b' in a theme part, rehued; the shape (string, array, object) is kept.
export const recolour = (v, bands) => typeof v === 'string'
  ? v.replace(/#([0-9a-f]{6})/gi, (m, x) => '#' + rehue([0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16)), bands).map(n => n.toString(16).padStart(2, '0')).join(''))
    .replace(/(\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})/g, (m, ...c) => rehue(c.slice(0, 3).map(Number), bands).join(','))
  : v && typeof v === 'object' ? (Array.isArray(v) ? v.map(x => recolour(x, bands)) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, recolour(x, bands)])))
  : v;

const KEYS = ['format', 'name', 'world', 'worldName', 'base', 'bands', 'art', 'px', 'sash', 'rank', 'ink', 'light', 'ui', 'text', 'notes'];
const COLOUR = /^(#[0-9a-f]{6}|#[0-9a-f]{3}|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)|\d{1,3},\s*\d{1,3},\s*\d{1,3})$/i;
const isColour = v => typeof v === 'string' && COLOUR.test(v);
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const kind = v => Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;

// The problems of a parsed theme.json (empty when valid). `bases`: the ids a style may name.
export function checkTheme(json, { bases = new Set() } = {}) {
  const bad = [];
  if (!isObj(json)) return ['theme: not an object'];
  for (const k of Object.keys(json)) if (!KEYS.includes(k)) bad.push(`${k}: unknown key`);
  if (json.format !== 1) bad.push(`format: must be 1, not ${JSON.stringify(json.format)}`);
  if (typeof json.name !== 'string' || !json.name) bad.push('name: required');
  if (json.world && json.base) bad.push('world, base: a theme has one, not both');
  else if (!json.world && !json.base) bad.push('world, base: a theme needs one');
  if (json.base !== undefined && !bases.has(json.base)) bad.push(`base: unknown base ${JSON.stringify(json.base)}`);
  if (json.bands !== undefined) {
    if (!json.base) bad.push('bands: only a style (with a base) has bands');
    else if (!Array.isArray(json.bands)) bad.push('bands: must be an array');
    else json.bands.forEach((b, i) => {
      const n = (v, lo, hi) => typeof v === 'number' && v >= lo && v <= hi;
      if (!isObj(b) || !Array.isArray(b.hue) || b.hue.length !== 2 || !b.hue.every(h => n(h, 0, 360))) bad.push(`bands[${i}].hue: must be [from, to], degrees`);
      if (!isObj(b) || !n(b.to, 0, 360)) bad.push(`bands[${i}].to: must be a hue in degrees`);
      if (isObj(b) && b.sat !== undefined && !n(b.sat, 0, 10)) bad.push(`bands[${i}].sat: must be a number`);
      if (isObj(b) && b.light !== undefined && !n(b.light, -1, 1)) bad.push(`bands[${i}].light: must be a number from -1 to 1`);
    });
  }
  const colours = (where, o, keyOk) => {
    if (!isObj(o)) return bad.push(`${where}: must be an object`);
    for (const [k, v] of Object.entries(o)) {
      if (!keyOk(k)) bad.push(`${where}.${k}: bad key`);
      else if (!isColour(v)) bad.push(`${where}.${k}: not a colour`);
    }
  };
  const one = k => k.length === 1;
  if (json.px !== undefined) colours('px', json.px, one);
  if (json.ink !== undefined) { // a colour, or a set of them by slot or position (windowDay, lamp)
    const shade = v => isColour(v) || (v && typeof v === 'object' && Object.values(v).every(shade));
    if (!isObj(json.ink)) bad.push('ink: must be an object');
    else for (const [k, v] of Object.entries(json.ink)) if (!k) bad.push('ink.: bad key'); else if (!shade(v)) bad.push(`ink.${k}: not a colour`);
  }
  if (json.light !== undefined) colours('light', json.light, k => k.length > 0);
  if (json.sash !== undefined && !(Array.isArray(json.sash) && json.sash.every(isColour))) bad.push('sash: must be an array of colours');
  if (json.art !== undefined && !(Array.isArray(json.art) && json.art.every(a => typeof a === 'string'))) bad.push('art: must be an array of names');
  if (json.ui !== undefined) {
    if (!isObj(json.ui)) bad.push('ui: must be an object');
    else for (const [k, v] of Object.entries(json.ui)) {
      if (!k.startsWith('--')) bad.push(`ui.${k}: a custom property starts with --`);
      else if (k === '--display' ? !FONTS.includes(v) : !isColour(v)) bad.push(`ui.${k}: ${k === '--display' ? 'not an allowed font' : 'not a colour'}`);
    }
  }
  if (json.rank !== undefined) {
    if (!isObj(json.rank)) bad.push('rank: must be an object');
    else for (const [c, parts] of Object.entries(json.rank)) {
      if (!['high', 'standard', 'novice'].includes(c)) { bad.push(`rank.${c}: unknown rank`); continue; }
      if (!isObj(parts)) { bad.push(`rank.${c}: must be an object`); continue; }
      for (const [p, o] of Object.entries(parts)) {
        if (p === 'robe' || p === 'adept') colours(`rank.${c}.${p}`, o, one);
        else bad.push(`rank.${c}.${p}: must be robe or adept`);
      }
    }
  }
  if (json.text !== undefined) {
    const walk = (where, v, ref) => {
      if (kind(v) !== kind(ref)) return bad.push(`${where}: must be a ${kind(ref)}`);
      if (isObj(v)) for (const [k, x] of Object.entries(v)) k in ref ? walk(`${where}.${k}`, x, ref[k]) : bad.push(`${where}.${k}: not a wording key`);
    };
    if (!isObj(json.text)) bad.push('text: must be an object'); else walk('text', json.text, TEXT);
  }
  return bad;
}

// What defineTheme takes. A world theme is its JSON less the file's own keys; a style recolours `base` (the registered
// base theme object) by its bands and lays its own parts over, key by key. Skin (':' and ';') is never turned.
export function themeOf(id, json, base) {
  if (!json.base) { const { format, notes, worldName, ...t } = json; return { id, ...t }; }
  const r = resolve(base), { ':': skin, ';': shade, ...px } = r.px;
  const c = recolour({ px, rank: r.rank, ink: r.ink, light: r.light, ui: { ...r.ui, '--display': undefined } }, json.bands ?? []);
  if (r.ui['--display'] !== undefined) c.ui['--display'] = r.ui['--display']; else delete c.ui['--display'];
  const over = (a, b) => ({ ...a, ...b });
  const rank = {};
  for (const k of Object.keys(c.rank)) rank[k] = { robe: over(c.rank[k].robe, json.rank?.[k]?.robe), adept: over(c.rank[k].adept, json.rank?.[k]?.adept) };
  return { id, name: json.name, world: base.world, artOf: base.artOf ?? base.id, sash: json.sash ?? base.sash, art: json.art,
    px: { ...c.px, ':': skin, ';': shade, ...json.px }, rank, ink: over(c.ink, json.ink), light: over(c.light, json.light),
    ui: over(c.ui, json.ui), text: { ...base.text, ...json.text } };
}
