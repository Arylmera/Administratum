// The shape of a theme's art, checked: pure functions over sheets as art.js loadSheet returns them, each returning the
// problems it finds as strings (empty when sound) and never throwing, so a pack's untrusted art is refused before it is
// drawn. Imports nothing that draws (sprites.js and faces.js call it): the base art comes in as arguments.
//
// What the drawing code reads, so what is checked:
//   frames   { name: rows }, rows a non-empty list of strings of one non-zero length (sprites.js sprite, faces.js
//            crop); a theme's frame is a frame of the base, at its size (sprites.js sheetOf lays it over the base's),
//            or one of its family's optional gesture frames (gestures.js), at the size of the seated frame it replaces
//   anchors  { name: anchor }, an anchor a number, a list or an object of anchors (sprites.js anchorsOf destructures
//            [x, y], logical() recurses): a theme's has its base anchor's shape, a list of the same length, an object
//            only the base's keys (laid over the base's)
//   tiles    { name: rule } (room.js tile): fill 'repeat' | 'repeat-x' | 'repeat-y' | 'nine' | 'once', edge (a nine's
//            corner, from 1, under half the tile; a nine needs it), top (a frame at the tile's size), mix (frames at
//            its size), glow (an ink name, a text here), glowPasses (1 to 8); a theme's rule only for a tile with a
//            base rule, only its keys, of their kinds
//   faces    meta.objects { NAME: { front, d, recess, details, flatOnly } } (faces.js header): every rect four whole
//            numbers inside frame NAME, w and h at least 1; details of kind box | cyl | disc | top | bill | spire (a
//            spire's parts, the same); faces.png frames named by an object's faces (checkFaces)
import { VS39 } from './iso.js';
import { GESTURE_FRAMES, SEATED_FRAME } from './gestures.js';

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const kind = v => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
const has = (o, k) => isObj(o) && Object.hasOwn(o, k);
const say = v => { try { return JSON.stringify(v) ?? String(v); } catch { return String(v); } };
// The problem with a frame's rows, or null.
const rowsBad = f => (!Array.isArray(f) || !f.length ? 'must be a list of rows'
  : !f.every(r => typeof r === 'string') ? 'rows must be text'
  : !f[0].length || f.some(r => r.length !== f[0].length) ? 'rows must share one non-zero width' : null);
const sizeOf = f => `${f[0].length}x${f.length}`;

// An anchor against its base's: the same shape all the way down.
function shape(v, b, at, bad) {
  if (typeof b === 'number') { if (typeof v !== 'number' || !Number.isFinite(v)) bad.push(`${at} must be a number, not ${say(v)}`); return; }
  if (Array.isArray(b)) {
    const pair = b.length === 2 && b.every(n => typeof n === 'number');
    if (!Array.isArray(v) || v.length !== b.length) { bad.push(`${at} must be ${pair ? 'a pair of numbers' : `a list of ${b.length}`}, not ${say(v)}`); return; }
    v.forEach((x, i) => shape(x, b[i], `${at}[${i}]`, bad));
    return;
  }
  if (isObj(b)) {
    if (!isObj(v)) { bad.push(`${at} must be an object, not ${say(v)}`); return; }
    for (const [k, x] of Object.entries(v)) has(b, k) ? shape(x, b[k], `${at}.${k}`, bad) : bad.push(`anchor ${at}.${k} unknown`);
    return;
  }
  bad.push(`${at}: the default's anchor has no shape`);
}

// What a theme's own sheet of `family` (frames: its frame names) holds that loads but is never drawn, as warnings: a
// gesture frame (gestures.js) without the seated frame it replaces in the same sheet (sprites.js takes a gesture only
// with the body it was drawn for).
export function gestureWarnings(family, frames) {
  const fam = String(family).split('/').pop(), seat = SEATED_FRAME[fam], names = Array.isArray(frames) ? frames : [];
  const lone = (GESTURE_FRAMES[fam] ?? []).filter(n => names.includes(n));
  return lone.length && !names.includes(seat) ? [`${family}: ${lone.map(n => `'${n}'`).join(', ')} never played: this sheet has no '${seat}' of its own`] : [];
}

const FILLS = ['repeat', 'repeat-x', 'repeat-y', 'nine', 'once'];
// The problems of a theme's own sheet of `family` (its frames, anchors, fill rules) against the base sheet, each
// starting `${family}: `.
export function checkSheet(family, own, base) {
  const bad = [];
  const out = () => bad.map(m => `${family}: ${m}`);
  if (!isObj(base) || !isObj(base.frames) || !isObj(base.anchors) || !isObj(base.tiles)) return [`${family}: no default sheet of this family`];
  if (!isObj(own)) return [`${family}: not a sheet`];
  for (const k of ['frames', 'anchors', 'tiles']) if (!isObj(own[k])) bad.push(`${k} must be an object`);
  if (bad.length) return out();
  // an optional gesture frame (gestures.js) the default may not draw: at the size of the seated frame it replaces
  // (family may carry its folder, 'tower/scribe', as the tests name it)
  const fam = family.split('/').pop(), optional = n => (GESTURE_FRAMES[fam]?.includes(n) && has(base.frames, SEATED_FRAME[fam]) ? base.frames[SEATED_FRAME[fam]] : null);
  for (const [n, f] of Object.entries(own.frames)) {
    const d = has(base.frames, n) ? base.frames[n] : optional(n), r = rowsBad(f);
    if (!d) bad.push(`'${n}' is not a frame of the default art`);
    else if (r) bad.push(`'${n}': ${r}`);
    else if (f.length !== d.length || f[0].length !== d[0].length) bad.push(`'${n}' must keep the default's size (${sizeOf(d)}, not ${sizeOf(f)})`);
  }
  for (const [n, a] of Object.entries(own.anchors)) has(base.anchors, n) ? shape(a, base.anchors[n], n, bad) : bad.push(`anchor ${n} unknown`);
  // the frames as the theme sees them: a rule's frames are the default's or its own (sound ones only)
  const frames = { ...base.frames };
  for (const [n, f] of Object.entries(own.frames)) if (has(base.frames, n) && !rowsBad(f)) frames[n] = f;
  const frame = n => (typeof n === 'string' && Object.hasOwn(frames, n) && !rowsBad(frames[n]) ? frames[n] : null);
  for (const [n, t] of Object.entries(own.tiles)) {
    const b = has(base.tiles, n) ? base.tiles[n] : null, f = frame(n), at = `tile '${n}'`;
    if (!b) { bad.push(`${at}: the default has no fill rule for it`); continue; }
    if (!isObj(t)) { bad.push(`${at} must be an object, not ${say(t)}`); continue; }
    for (const [k, v] of Object.entries(t)) {
      if (!has(b, k)) { bad.push(`${at}: ${k} is not a key of the default's rule`); continue; }
      if (kind(v) !== kind(b[k])) { bad.push(`${at}: ${k} must be ${kind(b[k]) === 'array' ? 'a list' : `a ${kind(b[k])}`}, not ${say(v)}`); continue; }
      const sized = m => { const g = frame(m); return !g ? `names no frame '${m}'` : f && sizeOf(g) !== sizeOf(f) ? `'${m}' is ${sizeOf(g)}, the tile ${sizeOf(f)}` : null; };
      if (k === 'fill' && !FILLS.includes(v)) bad.push(`${at}: fill '${v}' unknown`);
      if (k === 'edge' && (!Number.isInteger(v) || v < 1 || (f && 2 * v >= Math.min(f.length, f[0].length)))) bad.push(`${at}: edge ${v} must be a whole number from 1, under half the tile`);
      if (k === 'glowPasses' && (!Number.isInteger(v) || v < 1 || v > 8)) bad.push(`${at}: glowPasses ${v} must be 1 to 8`);
      if (k === 'top') { const p = sized(v); if (p) bad.push(`${at}: top ${p}`); }
      if (k === 'mix') for (const m of v) { const p = typeof m === 'string' ? sized(m) : `holds ${say(m)}, not a frame name`; if (p) bad.push(`${at}: mix ${p}`); }
    }
    // what the rule's fill needs (its own, else the default's): a nine its corner (room.js cuts W - 2 * edge wide parts)
    if ((has(t, 'fill') ? t.fill : b.fill) === 'nine' && !has(t, 'edge')) bad.push(`${at}: a nine needs its edge`);
  }
  return out();
}

// ---- faces ---------------------------------------------------------------------------------------------------------
const KINDS = ['box', 'cyl', 'disc', 'top', 'bill', 'spire'];
const OBJECT_KEYS = ['front', 'd', 'recess', 'details', 'flatOnly'];
// The numbers the 39° builder loops on or sizes its buffer by (scene39.js bake, IsoBuf.box, faces.js disc and the
// recess loop, isohall.js depthOf): whole and capped, so a pack cannot make the drawing throw or hang. Shipped maxima
// (base and every world): d 30 (an object's and a detail's), recess depth 6, disc t 14; u 148, v 24, z 90 (at most
// 0.95 of their frame's larger side: TABLE leg 5's u, 87 of 92).
const D_MAX = 96; // an object's or a box detail's depth, from 1
const DEPTH_MAX = 16; // a recess's depth, from 1
const T_MAX = 32; // a disc's thickness, from 1
const SPAN = 2; // u, v, z: within SPAN x the frame's larger side, either way
const NUMS = ['d', 't', 'u', 'v', 'z']; // a detail's numbers, where given
const CAP = { d: D_MAX, t: T_MAX, depth: DEPTH_MAX };
const cols = d => Math.ceil(d / VS39); // faces.js cols
const DEEP = 6; // spires within spires

// The problems of a world's face objects (faces.json meta.objects) against the base's: `frames` the sprite frames
// the objects are cut from (MAPS as that world draws them), `faceFrames` its faces.png frames (optional), each named
// by one of its objects' faces. `exact`: each at its face's size (the base art's rule); else only what the drawing
// reads (the builder reads side, top, rim and recess frames with ?., so any size draws; a box detail's drawn front
// needs its rect's rows, and one the flat frame shows must not run off it). Each starts 'faces: '.
export function checkFaces(own, base, frames, faceFrames, opts) {
  const exact = isObj(opts) && opts.exact === true;
  const bad = [];
  if (!isObj(base)) return ['faces: no default objects'];
  if (!isObj(own)) return [`faces: the objects must be an object, not ${say(own)}`];
  const sizes = {}; // faces.png frame name -> [w, h], as the faces.js header names them
  const fronts = {}; // a detail's drawn front -> what its drawing needs: { rows (a box's), flat (the rows left below its y) }
  for (const [name, o] of Object.entries(own)) {
    const at = `faces: ${name}`, map = has(frames, name) ? frames[name] : null;
    if (!has(base, name)) { bad.push(`${at}: not an object of the default faces`); continue; }
    if (!map || rowsBad(map)) { bad.push(`${at}: no frame '${name}' to cut it from`); continue; }
    if (!isObj(o)) { bad.push(`${at} must be an object, not ${say(o)}`); continue; }
    const fw = map[0].length, fh = map.length, reach = SPAN * Math.max(fw, fh);
    // a number's problem, or null: d, t, depth whole from 1 to their cap; u, v, z within reach
    const num = (k, v) => (CAP[k] ? (Number.isInteger(v) && v >= 1 && v <= CAP[k] ? null : `${k} must be a whole number from 1 to ${CAP[k]}, not ${say(v)}`)
      : typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= reach ? null : `${k} must be a number within ${reach} of the frame, not ${say(v)}`);
    // a rect inside the frame (and inside `box`, a recess's: the builder reads the box's rows under it)
    const rect = (r, where, box) => {
      if (!Array.isArray(r) || r.length !== 4 || !r.every(Number.isInteger)) { bad.push(`${at}: ${where} rect must be four whole numbers, not ${say(r)}`); return false; }
      const [x, y, w, h] = r;
      if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > fw || y + h > fh) { bad.push(`${at}: ${where} rect ${say(r)} is not inside its ${fw}x${fh} frame`); return false; }
      if (box && (x < box[0] || y < box[1] || x + w > box[0] + box[2] || y + h > box[1] + box[3])) { bad.push(`${at}: ${where} rect ${say(r)} is not inside its box ${say(box)}`); return false; }
      return true;
    };
    const list = (v, where) => { if (v === undefined) return []; if (Array.isArray(v)) return v; bad.push(`${at}: ${where} must be a list, not ${say(v)}`); return []; };
    const named = (p, where) => { if (!isObj(p)) { bad.push(`${at}: ${where} must be an object, not ${say(p)}`); return false; }
      if (typeof p.name !== 'string' || !p.name) { bad.push(`${at}: ${where} needs a name`); return false; } return true; };
    const recess = (v, where, pre, box, sized = true) => list(v, `${where} recess`).forEach((r, i) => {
      if (!named(r, `${where} recess ${i}`)) return;
      const ok = rect(r.rect, `${where} recess '${r.name}'`, box);
      const dp = r.depth === undefined ? null : num('depth', r.depth);
      if (dp) bad.push(`${at}: ${where} recess '${r.name}' ${dp}`);
      if (r.wall !== undefined && typeof r.wall !== 'string') bad.push(`${at}: ${where} recess '${r.name}' wall must be a colour char`);
      if (ok && sized && !dp && r.depth > 1) { sizes[`${pre} ${r.name} wall`] = [r.depth - 1, r.rect[3]]; sizes[`${pre} ${r.name} floor`] = [r.rect[2], r.depth - 1]; }
    });
    const part = (p, where, key, deep, flat) => {
      if (!named(p, where)) return;
      const w = `${where} '${p.name}'`;
      if (!KINDS.includes(p.kind)) bad.push(`${at}: ${w} kind ${say(p.kind)} unknown (${KINDS.join(', ')})`);
      const ok = rect(p.rect, w);
      for (const k of NUMS) { const e = p[k] === undefined ? null : num(k, p[k]); if (e) bad.push(`${at}: ${w} ${e}`); }
      if (p.kind === 'box' && p.d === undefined) bad.push(`${at}: ${w} is a box without its depth d`);
      if (p.rim !== undefined && typeof p.rim !== 'string') bad.push(`${at}: ${w} rim must be a colour char`);
      recess(p.recess, w, `${name} ${key}`, ok ? p.rect : undefined);
      if (p.kind === 'spire' && (!Array.isArray(p.parts) || !p.parts.length)) bad.push(`${at}: ${w} is a spire without parts`);
      if (p.parts !== undefined) {
        if (deep >= DEEP) { bad.push(`${at}: ${w} parts nested too deep`); return; }
        list(p.parts, `${w} parts`).forEach((q, i) => part(q, `${w} part ${i}`, `${key}/${q?.name}`, deep + 1, flat));
        return; // its parts carry its faces
      }
      if (!ok) return;
      const [, , pw, ph] = p.rect;
      if (p.kind === 'box') { sizes[`${name} ${key} side`] = [cols(p.d), ph]; sizes[`${name} ${key} top`] = [pw, cols(p.d)]; }
      if (p.kind === 'cyl') sizes[`${name} ${key} top`] = [pw, cols(pw)];
      if (p.kind === 'disc') sizes[`${name} ${key} rim`] = [pw, ph];
      sizes[`${name} ${key} front`] = [pw, ph]; // a drawn front for a detail its frame shows only top-down
      fronts[`${name} ${key} front`] = { rows: p.kind === 'box' ? ph : 1, flat: flat ? fh - p.rect[1] : Infinity };
    };
    for (const k of Object.keys(o)) if (!OBJECT_KEYS.includes(k)) bad.push(`${at}: ${k} is not a key of an object`);
    const od = o.d === undefined ? null : num('d', o.d);
    if (od) bad.push(`${at}: ${od}`);
    const front = o.front !== undefined && rect(o.front, 'front');
    if (front) { sizes[`${name} side`] = [cols(o.d), o.front[3]]; sizes[`${name} top`] = [o.front[2], cols(o.d)]; }
    recess(o.recess, 'front', name, front ? o.front : undefined, front); // a main box's recess: inside it, its frames only with it
    list(o.details, 'details').forEach((p, i) => part(p, `detail ${i}`, p?.name, 0, !p?.only39));
    list(o.flatOnly, 'flatOnly').forEach((p, i) => { if (named(p, `flatOnly ${i}`)) rect(p.rect, `flatOnly '${p.name}'`); });
  }
  if (faceFrames !== undefined) {
    if (!isObj(faceFrames)) bad.push(`faces: the face frames must be an object, not ${say(faceFrames)}`);
    else for (const [k, f] of Object.entries(faceFrames)) {
      const r = rowsBad(f), s = Object.hasOwn(sizes, k) ? sizes[k] : null;
      if (!s) bad.push(`faces: frame '${k}' belongs to no box, cylinder, disc or recess`);
      else if (r) bad.push(`faces: frame '${k}': ${r}`);
      else if (exact) { if (f[0].length !== s[0] || f.length !== s[1]) bad.push(`faces: '${k}' size must be ${s[0]}x${s[1]}, not ${sizeOf(f)}`); }
      else if (fronts[k] && (f.length < fronts[k].rows || f.length > fronts[k].flat)) bad.push(`faces: '${k}' size must be ${fronts[k].rows} to ${fronts[k].flat} rows, not ${f.length}`);
    }
  }
  return bad;
}
