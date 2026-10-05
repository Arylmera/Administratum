import assert from 'node:assert/strict';
import { sunTimes, sunPhase } from './sun.js';

// References: NOAA solar calculator spreadsheet (Julian-century formulas), UTC; the dates sit at noon UTC
// so the local calendar day is the same on any machine timezone.
const near = (d, iso, min = 2) => assert.ok(Math.abs(d - new Date(iso)) <= min * 6e4, `${d?.toISOString()} vs ${iso}`);
const BXL = [50.8503, 4.3517];
let s = sunTimes(new Date('2026-06-21T12:00Z'), ...BXL);
near(s.sunrise, '2026-06-21T03:28:47Z'); // 05:29 CEST
near(s.sunset, '2026-06-21T20:00:03Z'); // 22:00 CEST
near(s.civilDawn, '2026-06-21T02:42Z'); near(s.civilDusk, '2026-06-21T20:46Z');
assert.equal(s.polar, null);
assert.equal(sunPhase(new Date('2026-06-21T02:00Z'), s), 'night');
assert.equal(sunPhase(new Date('2026-06-21T03:45Z'), s), 'dusk'); // first half hour of sun
assert.equal(sunPhase(new Date('2026-06-21T12:00Z'), s), 'day');
assert.equal(sunPhase(new Date('2026-06-21T19:45Z'), s), 'dusk');
assert.equal(sunPhase(new Date('2026-06-21T21:00Z'), s), 'night');
s = sunTimes(new Date('2026-12-21T12:00Z'), ...BXL);
near(s.sunrise, '2026-12-21T07:42:32Z'); // 08:43 CET
near(s.sunset, '2026-12-21T15:38:47Z'); // 16:39 CET

// Tromsø: midnight sun, then polar night with a few hours of civil twilight around noon
const TOS = [69.65, 18.96];
s = sunTimes(new Date('2026-06-21T12:00Z'), ...TOS);
assert.equal(s.polar, 'day'); assert.equal(s.sunrise, null);
assert.equal(sunPhase(new Date('2026-06-21T23:00Z'), s), 'day');
s = sunTimes(new Date('2026-12-21T12:00Z'), ...TOS);
assert.equal(s.polar, 'night'); assert.equal(s.sunset, null);
assert.equal(sunPhase(new Date('2026-12-21T10:40Z'), s), 'dusk');
assert.equal(sunPhase(new Date('2026-12-21T18:00Z'), s), 'night');
console.log('sun ok');
