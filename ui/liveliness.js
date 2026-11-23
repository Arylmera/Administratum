// The hall's small life at a desk (Settings > Appearance > Liveliness; spec 2026-11-23-liveliness): a busy scribe's
// typing arms and its desk screen. Pure, time-based, the same answer at any frame rate: both views draw it.
import { hash01 } from './gestures.js';

// hash01 mixed further (murmur3's finaliser): alone it hardly moves between two texts that differ in their last digit.
export function rnd(text) {
  let n = hash01(text) * 2 ** 32 | 0;
  n = Math.imul(n ^ (n >>> 16), 0x85ebca6b); n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  return ((n ^ (n >>> 16)) >>> 0) / 2 ** 32;
}

// Typing: bursts of TYPE_S s in every BURST_S s, one arm or the other up an art px, TAPS a second. The body never moves.
const BURST_S = 6, TYPE_S = 4, TAPS = 5;
export function typing(id, t) {
  const u = t + BURST_S * rnd(`${id}:type`);
  const up = u % BURST_S < TYPE_S ? Math.floor(3 * rnd(`${id}:${Math.floor(u * TAPS)}`)) : 2; // 0 left, 1 right, 2 neither
  return { l: up === 0 ? 0.5 : 0, r: up === 1 ? 0.5 : 0 };
}

// A desk screen's text at t: rows of words every second art px, the last one being written, the page moving up a row
// every LINE_S. { x, y, w } in art px from the screen's top-left, inside w x h.
const LINE_S = 1.6;
export function screenRows(id, t, w, h) {
  const n = Math.floor(h / 2), u = t / LINE_S + 100 * rnd(`${id}:screen`), first = Math.floor(u), out = [];
  for (let i = 0; i < n; i++) {
    const row = first + i, end = i === n - 1 ? 1 + Math.floor((u - first) * (w - 1)) : w - Math.floor(3 * rnd(`${id}:${row}`));
    for (let x = 1, k = 0; x < end; k++) {
      const word = Math.min(end - x, 1 + Math.floor(4 * rnd(`${id}:${row}:${k}`)));
      out.push({ x, y: 1 + 2 * i, w: word });
      x += word + 1;
    }
  }
  return out;
}

// Whether the anchor rect ([x, y, w, h], logical px = 2 art px) of a prop's art covers a screen: mostly its phosphor
// slots. A world whose desk has a parchment or an instrument there has no text to run.
export function isGlass(map, rect) {
  if (!map || !rect) return false;
  const [x, y, w, h] = rect.map(v => v * 2);
  let lit = 0;
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (map[j]?.[i] === 'C' || map[j]?.[i] === 'c') lit++;
  return lit >= 0.75 * w * h;
}
