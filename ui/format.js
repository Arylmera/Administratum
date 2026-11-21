// Text formats shared by the card, the phone page, the Chronicon and the hall: each was written two or three times
// (card.js and mobile.js: ago, statusOf; app.js, chronicon.js and mobile.js: the clock). Those files move onto this one with
// their lanes (decision D3 of the parallel-waves spec).
import { T, t } from './theme.js';
import { pad2 } from './quiet.js';

// How long ago `ms` (epoch ms) was: '<1m', '5m', '2h'; '—' for a missing time (a session with no statusUpdatedAt), never a huge
// elapsed time.
export const ago = ms => {
  if (!ms) return '—';
  const m = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  return m < 1 ? '<1m' : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`;
};

// Local clock time as HH:MM of an epoch ms or a Date (the Chronicon's rows, the phone's vigil deadline).
export const hhmm = ms => { const d = new Date(ms); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

// Local clock time of a Date in the system's own 24-hour format, two-digit hours (the hall's sunrise and sunset line:
// app.js reads the locale, so a locale that groups the digits differently keeps its own separator).
export const hhmmLocale = d => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

// What a session's status reads as in the active theme: a background shell first, then the theme's word for the status, else
// the status as it came.
export const statusOf = s => (s.background ? t('status.background') : T.text.status[s.status] ? t(`status.${s.status}`) : s.status);
