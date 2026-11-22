import assert from 'node:assert/strict';
import { ago, hhmm, hhmmLocale, statusOf } from './format.js';
import { setTheme, T } from './theme.js';

// ago: a pinned clock; the missing time is a dash, not a huge elapsed time
const NOW = Date.UTC(2026, 10, 21, 12, 0, 0), RealNow = Date.now;
Date.now = () => NOW;
try {
  assert.equal(ago(0), '—');
  assert.equal(ago(undefined), '—');
  assert.equal(ago(null), '—');
  assert.equal(ago(NOW), '<1m');
  assert.equal(ago(NOW - 59_000), '<1m');
  assert.equal(ago(NOW - 60_000), '1m');
  assert.equal(ago(NOW - 59 * 60_000), '59m');
  assert.equal(ago(NOW - 60 * 60_000), '1h');
  assert.equal(ago(NOW - 150 * 60_000), '2h', 'whole hours, rounded down');
  assert.equal(ago(NOW + 5 * 60_000), '<1m', 'a time in the future (clock skew) is not negative');
} finally { Date.now = RealNow; }

// hhmm: the local clock, two digits each, from a number or a Date
const at = (h, m) => new Date(2026, 10, 21, h, m, 30);
assert.equal(hhmm(at(9, 5).getTime()), '09:05');
assert.equal(hhmm(at(0, 0)), '00:00');
assert.equal(hhmm(at(23, 59).getTime()), '23:59');
assert.equal(hhmm(at(14, 30)), '14:30', 'a Date as well');
// hhmmLocale: the system's own 24-hour format; the digits are the same whatever the separator
assert.equal(hhmmLocale(at(9, 5)).replace(/\D/g, ''), '0905');
assert.equal(hhmmLocale(at(18, 42)).replace(/\D/g, ''), '1842');
assert.ok(!/[ap]m/i.test(hhmmLocale(at(18, 42))), 'no am / pm');

// statusOf: the theme's word, the background shell first, an unknown status as it came
assert.equal(T.id, 'tier2');
assert.equal(statusOf({ status: 'busy' }), 'Writing');
assert.equal(statusOf({ status: 'waiting' }), 'Petition at your door');
assert.equal(statusOf({ status: 'busy', background: true }), 'Idle · background shell running');
assert.equal(statusOf({ status: 'mystery' }), 'mystery');
setTheme('tier2');
console.log('format ok');
