// Custom rooms (Settings > Rooms): user rules mapping a folder pattern to a named room, in rule order. Saved as one
// JSON string, adm.rooms (settings.js keeps it, the backend matches it: src-tauri/src/rooms.rs, which fills each
// session's `room`). Each rule: { id ('r' + base-36 ms, set once), name (≤ 32), pattern (≤ 200), color (#rrggbb) }.
export const MAX_ROOMS = 6;
const MAX_NAME = 32, MAX_PATTERN = 200;

const shaped = (e, seen) => e && typeof e === 'object' && typeof e.id === 'string' && e.id !== '' && !seen.has(e.id)
  && typeof e.name === 'string' && [...e.name].length <= MAX_NAME
  && typeof e.pattern === 'string' && e.pattern.trim() !== '' && [...e.pattern].length <= MAX_PATTERN
  && typeof e.color === 'string' && /^#[0-9a-f]{6}$/i.test(e.color) && seen.add(e.id);
// The rules in a saved adm.rooms text, as rooms.rs rules_from reads it: corrupt JSON or anything but a list is none,
// bad entries are dropped, the first MAX_ROOMS kept. (A pattern only the backend can reject still shows, as an empty room.)
export function roomsOf(text) {
  let list;
  try { list = JSON.parse(text); } catch { return []; }
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.filter(e => shaped(e, seen)).slice(0, MAX_ROOMS).map(({ id, name, pattern, color }) => ({ id, name, pattern, color }));
}

// The rules in force, read by app.js (the layout), overlay.js (the plaques) and the scene (the tint).
export const rooms = { list: [] };
// Puts `list` in force (cleaned as roomsOf does) and returns the text to save under adm.rooms.
export function setRooms(list) {
  rooms.list = roomsOf(JSON.stringify(list));
  return JSON.stringify(rooms.list);
}

// A room's colour as a palette override: the sash slot y (ui/art/key.gpl) is the dyed part of every ENCLAVE_ frame.
// One object per colour, so the sprite cache finds it by identity (sprites.js sprite).
const tints = new Map();
export const tintOf = color => tints.get(color) ?? tints.set(color, { y: color }).get(color);
