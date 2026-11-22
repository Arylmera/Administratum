// Arcane Tower: a scrying glass. An astrolabe disc with a violet heart on top, a crystal at each end, navy stone sides
// cut with runes, the screen an arched mirror in a gold frame (a crescent and stars on it while it works), a gold ledge
// studded with violet, a stone plinth.
import { sym, frames } from './kit.mjs';

const off = sym([
  '.............kkk',
  '............kgGg',
  '..k.........kGxx',
  '.kOk........kgGg',
  '.kck.........kkk',
  'kcck..........kg',
  '.kkkkkkkkkkkkkkk',
  '.kMMMMMMMMMkkkkk',
  '.kMmmmmmMMkhhhhh',
  '.kMmMMMmMkhgCCCC',
  '.kMmMxMmMhgCCCCC',
  '.kMmMMMmMhgCCCCC',
  '.kMmmmmmMhgCCCCC',
  '.kMmMcMmMhgCCCCC',
  '.kMmMMMmMhgCCCCC',
  '.kMmmmmmMhgCCCCC',
  '.kMmmmmmMhhhhhhh',
  '.kMMMMMMMggggggg',
  '.kMmmmmmmMMxMMMM',
  '.kMmmmmmmMMMMMMM',
  '.kMMMMMMMMMMMMMM',
  '.kkkkkkkkkkkkkkk',
  'klllllllllllllll',
  'kkkkkkkkkkkkkkkk',
]);

export default () => frames(off, [
  [10, 8, [
    '............',
    '...c.....O..',
    '.......c....',
    '..OO........',
    '.O..c...c...',
    '.O..........',
    '..OO.....c..',
    '......c.....',
  ]],
  [5, 10, ['O']], [26, 10, ['O']], [5, 13, ['O']], [26, 13, ['O']], // the runes kindle
]);
