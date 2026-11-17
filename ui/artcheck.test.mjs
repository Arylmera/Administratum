// The shape of a theme's sheets (artcheck.js): small hand-built sheets, one problem each, then every shipped theme's
// sheets and faces. Run: node ui/artcheck.test.mjs
import assert from 'node:assert/strict';
import { checkSheet, checkFaces } from './artcheck.js';
import { ART, MAPS } from './sprites.js';
import { FACES } from './faces.js';
import { THEMES, setTheme } from './theme.js';

const rows = (w, h, c = 'k') => Array.from({ length: h }, () => c.repeat(w));
const base = {
  frames: { a: rows(4, 3), b: rows(2, 2), floor: rows(4, 4), 'floor vent': rows(4, 4), 'floor top': rows(4, 4), pad: rows(6, 6) },
  anchors: { feet: [2, 3], a: { screen: [0, 0, 2, 2], seals: [[0, 1], [1, 1]] }, door: { door: [1, 1] } },
  tiles: { floor: { fill: 'repeat', top: 'floor top', mix: ['floor vent'] }, pad: { fill: 'nine', edge: 1 } },
  meta: {},
};
const clean = { frames: { a: rows(4, 3, 'r') }, anchors: { feet: [1, 3], a: { screen: [1, 1, 2, 2] } }, tiles: { floor: { fill: 'repeat', mix: [] } }, meta: {} };
assert.deepEqual(checkSheet('fam', clean, base), []);
assert.deepEqual(checkSheet('fam', { frames: {}, anchors: {}, tiles: {} }, base), [], 'an empty sheet');
const one = (patch, word) => {
  const p = checkSheet('fam', { ...clean, ...patch }, base);
  assert.equal(p.length, 1, `${word}: ${JSON.stringify(p)}`);
  assert.ok(p[0].startsWith('fam: ') && p[0].includes(word), `${word} in ${p[0]}`);
};
one({ frames: { zz: rows(4, 3) } }, 'zz');
one({ frames: { a: rows(5, 3) } }, 'size');
one({ frames: { a: [...rows(4, 2), 'kkkkk'] } }, 'a');
one({ anchors: { feet: [1, 3], a: { lamp: [1, 1] } } }, 'a.lamp');
one({ anchors: { feet: 'left' } }, 'feet');
one({ anchors: { feet: [1, 3, 4] } }, 'feet');
one({ anchors: { nose: [1, 1] } }, 'nose');
one({ anchors: { a: { seals: [[0, 1]] } } }, 'a.seals');
one({ anchors: { a: { screen: [1, 1, 'x', 2] } } }, 'a.screen');
one({ anchors: { a: null } }, 'a');
one({ tiles: { floor: { fill: 'repeat', top: 'roof' } } }, 'roof');
one({ tiles: { floor: { fill: 'repeat', mix: ['floor vent', 'gone'] } } }, 'gone');
one({ tiles: { floor: { fill: 'tile' } } }, 'fill');
one({ tiles: { floor: { fill: 'repeat', mix: 'floor vent' } } }, 'mix');
one({ tiles: { floor: { fill: 'repeat', glow: 'x' } } }, 'glow');
one({ tiles: { pad: { fill: 'nine', edge: 3 } } }, 'edge');
// a nine without a usable edge: a theme's rule replaces the default's whole, so room.js would cut a zero-wide part
one({ tiles: { pad: { fill: 'nine' } } }, 'edge');
one({ tiles: { pad: { fill: 'nine', edge: 0 } } }, 'edge');
one({ tiles: { pad: {} } }, 'edge'); // its fill the default's nine
assert.deepEqual(checkSheet('fam', { ...clean, tiles: { pad: { fill: 'nine', edge: 2 } } }, base), [], 'a nine with its edge');
one({ tiles: { a: { fill: 'repeat' } } }, 'a');
// a mix or top frame at another size than its tile
one({ frames: { 'floor vent': rows(4, 4), b: rows(2, 2) }, tiles: { floor: { fill: 'repeat', mix: ['b'] } } }, 'b');
// untrusted input never throws: every malformed part is a problem
for (const bad of [null, 'sheet', 3, [], { frames: 'x' }, { frames: { a: 'kkkk' }, anchors: {}, tiles: {} }, { frames: { a: [1, 2, 3] }, anchors: {}, tiles: {} },
  { frames: { a: [] }, anchors: {}, tiles: {} }, { frames: {}, anchors: null, tiles: {} }, { frames: {}, anchors: {}, tiles: { floor: 'repeat' } },
  JSON.parse('{"frames":{"__proto__":["kk"]},"anchors":{"constructor":[1,1]},"tiles":{"toString":{}}}')]) {
  const p = checkSheet('fam', bad, base);
  assert.ok(p.length && p.every(m => typeof m === 'string' && m.startsWith('fam: ')), `${JSON.stringify(bad)}: ${JSON.stringify(p)}`);
}
assert.ok(checkSheet('fam', clean, null).length, 'no base sheet');

// checkFaces: own and base are meta.objects, frames the sprite frames the objects are cut from, faceFrames faces.png's
const sprite = { BOX: rows(10, 8) };
const bObjs = { BOX: { front: [0, 2, 8, 6], d: 4, details: [{ name: 'cup', rect: [1, 0, 2, 2], kind: 'cyl' }] } };
const objs = { BOX: { front: [0, 2, 8, 6], d: 4, recess: [{ name: 'screen', rect: [1, 3, 4, 2], depth: 2 }],
  details: [{ name: 'cup', rect: [1, 0, 2, 2], kind: 'cyl', v: 2 }, { name: 'spire', rect: [6, 0, 2, 2], kind: 'spire', parts: [{ name: 'cog', rect: [6, 0, 2, 2], kind: 'disc', t: 2 }] }],
  flatOnly: [{ name: 'shadow', rect: [0, 7, 10, 1] }] } };
assert.deepEqual(checkFaces(objs, bObjs, sprite), []);
const face = (o, word, faceFrames, opt) => {
  const p = checkFaces({ BOX: { ...objs.BOX, ...o } }, bObjs, sprite, faceFrames, opt);
  assert.equal(p.length, 1, `${word}: ${JSON.stringify(p)}`);
  assert.ok(p[0].startsWith('faces: ') && p[0].includes(word), `${word} in ${p[0]}`);
};
face({ details: [{ name: 'ball', rect: [1, 0, 2, 2], kind: 'sphere' }] }, 'sphere');
face({ front: [0, 2, 8] }, 'front');
face({ front: [0, 2, 8, 7] }, 'front');
face({ details: [{ name: 'cup', rect: [9, 0, 2, 2], kind: 'cyl' }] }, 'cup');
face({ details: [{ name: 'cup', rect: [1, 0, 0, 2], kind: 'cyl' }] }, 'cup');
face({ details: [{ name: 'spire', rect: [6, 0, 2, 2], kind: 'spire' }] }, 'spire');
face({ details: [{ name: 'spire', rect: [6, 0, 2, 2], kind: 'spire', parts: [{ name: 'cog', rect: [6, 0, 2, 2], kind: 'ring' }] }] }, 'ring');
face({ recess: [{ name: 'screen', rect: [1, 3, 4, 2], depth: '2' }] }, 'depth');
face({ flatOnly: 'shadow' }, 'flatOnly');
face({ d: 'deep' }, 'd');
face({ lid: true }, 'lid');
// numbers the drawing loops on or sizes a buffer by: whole and bounded, so a pack cannot make it throw or hang
face({ d: 1e9 }, 'd');
face({ d: -5 }, 'd');
face({ d: 2.5 }, 'd');
face({ details: [{ name: 'cog', rect: [6, 0, 2, 2], kind: 'disc', t: 1e9 }] }, 't');
face({ details: [{ name: 'cog', rect: [6, 0, 2, 2], kind: 'disc', t: 0 }] }, 't');
face({ recess: [{ name: 'screen', rect: [1, 3, 4, 2], depth: 1e9 }] }, 'depth');
face({ details: [{ name: 'slate', rect: [1, 0, 2, 2], kind: 'box', d: 1e9 }] }, 'd');
face({ details: [{ name: 'slate', rect: [1, 0, 2, 2], kind: 'box' }] }, 'd'); // a box needs its depth (isohall.js depthOf)
face({ details: [{ name: 'cup', rect: [1, 0, 2, 2], kind: 'cyl', u: 1e9 }] }, 'u');
face({ details: [{ name: 'cup', rect: [1, 0, 2, 2], kind: 'cyl', v: -1e9 }] }, 'v');
face({ details: [{ name: 'cup', rect: [1, 0, 2, 2], kind: 'cyl', z: 1e9 }] }, 'z');
assert.ok(Array.isArray(checkFaces(objs, bObjs, sprite, undefined, null)), 'null options');
assert.equal(checkFaces({ CRATE: objs.BOX }, bObjs, { ...sprite, CRATE: rows(10, 8) }).length, 1, 'an object the base lacks');
assert.equal(checkFaces({ BOX: objs.BOX }, { BOX: objs.BOX }, {}).length, 1, 'an object without its frame');
face({ recess: [{ name: 'screen', rect: [1, 1, 4, 2], depth: 2 }] }, 'screen'); // a recess outside its box
// faces.png frames: each named by an object part; exact (the base art): at that face's size; else what the drawing
// reads: a box detail's drawn front its rect's rows, a flat one not past its frame's bottom
face({}, 'BOX top', { 'BOX top': rows(8, 1) }, { exact: true });
assert.deepEqual(checkFaces(objs, bObjs, sprite, { 'BOX top': rows(8, 1), 'BOX side': rows(9, 9), 'BOX cup front': rows(2, 8) }), [], 'any size the builder reads with ?.');
face({}, 'BOX lid', { 'BOX lid': rows(8, 2) });
face({}, 'BOX cup front', { 'BOX cup front': rows(2, 9) });
face({ details: [{ name: 'slate', rect: [1, 0, 2, 2], kind: 'box', d: 2 }] }, 'BOX slate front', { 'BOX slate front': rows(2, 1) });
face({ details: [{ name: 'leg', rect: [1, 6, 2, 2], kind: 'box', d: 2, only39: true }] }, 'BOX leg front', { 'BOX leg front': rows(2, 1) });
assert.deepEqual(checkFaces({ BOX: { ...objs.BOX, details: [{ name: 'leg', rect: [1, 6, 2, 2], kind: 'box', d: 2, only39: true }] } }, bObjs, sprite, { 'BOX leg front': rows(2, 9) }), [], 'an only39 front: no flat frame to run off');
assert.deepEqual(checkFaces(objs, bObjs, sprite, { 'BOX side': rows(2, 6), 'BOX top': rows(8, 2), 'BOX cup top': rows(2, 1), 'BOX spire/cog rim': rows(2, 2), 'BOX screen wall': rows(1, 2), 'BOX screen floor': rows(4, 1), 'BOX cup front': rows(2, 2) }, { exact: true }), []);
for (const bad of [null, 'x', [], { BOX: null }, { BOX: 'front' }, { BOX: { details: [null, 'cup', { name: 'cup', kind: 'cyl', rect: null }] } }, JSON.parse('{"__proto__":{}}')]) {
  const p = checkFaces(bad, bObjs, sprite, { 'BOX side': 'x' });
  assert.ok(p.length && p.every(m => typeof m === 'string' && m.startsWith('faces: ')), `${JSON.stringify(bad)}: ${JSON.stringify(p)}`);
}
assert.ok(checkFaces(objs, null, null, null).length, 'no base objects');

// every shipped theme's sheets and faces pass
let sheets = 0;
for (const [id, fams] of Object.entries(ART.themed)) for (const [fam, sh] of Object.entries(fams)) { assert.deepEqual(checkSheet(`${id}/${fam}`, sh, ART.base[fam]), []); sheets++; }
assert.ok(sheets > 100, 'found the themes\' sheets');
assert.deepEqual(checkFaces(FACES.base.objects, FACES.base.objects, MAPS, FACES.base.frames, { exact: true }), []);
for (const [id, w] of Object.entries(FACES.worlds)) if (w) {
  setTheme(id);
  assert.deepEqual(checkFaces(w.objects, FACES.base.objects, MAPS, w.frames), [], id);
}
setTheme('tier2');
assert.ok(Object.values(FACES.worlds).filter(Boolean).length >= 5 && THEMES.cyber, 'found the worlds\' faces');
console.log('artcheck ok');
