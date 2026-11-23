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

// What a session is doing, by the tool its task line names (tail.rs task_line: "Edit · app.js"), or null: a prompt
// (quoted), a tool of no kind.
const KINDS = { write: ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'], read: ['Read', 'NotebookRead'], search: ['Grep', 'Glob', 'LS', 'ToolSearch'], web: ['WebFetch', 'WebSearch'] };
const KIND_OF = new Map(Object.entries(KINDS).flatMap(([k, tools]) => tools.map(n => [n, k])));
export const workKind = task => KIND_OF.get(String(task ?? '').split(' · ')[0]) ?? null;

// A desk screen at t, by kind of work: runs of lit art px, { x, y, w } from the screen's top-left, inside w x h.
//   null    rows of words every second art px, the last one being written, the page up a row every LINE_S
//   write   the same, faster, with a caret
//   read    full rows scrolling past
//   search  a still page, a bar sweeping down it
//   web     square rings spreading from the middle
const LINE_S = 1.6, WRITE_S = 0.8, READ_S = 0.4, SWEEP = 6, RING_PX = 4; // SWEEP: rows a second; RING_PX: px a second
export function screenRows(id, t, w, h, kind = null) {
  const n = Math.floor(h / 2), out = [];
  if (kind === 'web') {
    const m = [(w - 1) / 2, (h - 1) / 2];
    for (let i = 0; i < 2; i++) {
      const r = Math.floor((t * RING_PX + i * 4 + 8 * rnd(`${id}:screen`)) % 8);
      const x0 = Math.ceil(m[0] - r), x1 = Math.floor(m[0] + r), y0 = Math.ceil(m[1] - r), y1 = Math.floor(m[1] + r);
      for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++) {
        if (y === y0 || y === y1) { const a = Math.max(0, x0), b = Math.min(w - 1, x1); if (b >= a) out.push({ x: a, y, w: b - a + 1 }); }
        else for (const x of new Set([x0, x1])) if (x >= 0 && x < w) out.push({ x, y, w: 1 });
      }
    }
    return out;
  }
  const line = { write: WRITE_S, read: READ_S }[kind] ?? LINE_S;
  const u = (kind === 'search' ? 0 : t / line) + 100 * rnd(`${id}:screen`), first = Math.floor(u);
  for (let i = 0; i < n; i++) {
    const row = first + i, writing = i === n - 1 && kind !== 'read' && kind !== 'search';
    const end = writing ? 1 + Math.floor((u - first) * (w - 1)) : w - Math.floor(3 * rnd(`${id}:${row}`));
    for (let x = 1, k = 0; x < end; k++) {
      const word = Math.min(end - x, 1 + Math.floor(4 * rnd(`${id}:${row}:${k}`)));
      out.push({ x, y: 1 + 2 * i, w: word });
      x += word + 1;
    }
    if (writing && kind === 'write' && Math.floor(t * 3) % 2) out.push({ x: end, y: 2 * i, w: 1 }, { x: end, y: 1 + 2 * i, w: 1 }); // end <= w - 1
  }
  if (kind === 'search' && w > 0 && h > 0) out.push({ x: 0, y: Math.floor(t * SWEEP + h * rnd(`${id}:screen`)) % h, w });
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
