// Quiet hours (settings.js: quiet = { on, from, to }, minutes after midnight): the same rule as src-tauri/src/quiet.rs.
// A window whose end is before its start spans midnight; from == to is never quiet.
export const inWindow = (now, from, to) => (from < to ? now >= from && now < to : from > to ? now >= from || now < to : false);
export const minutesOf = hhmm => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
};
export const hhmmOf = min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export const quietAt = (q, date) => q.on && inWindow(date.getHours() * 60 + date.getMinutes(), q.from, q.to);
