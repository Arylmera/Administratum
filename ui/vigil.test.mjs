import assert from 'node:assert/strict';
import { vigil, onVigil, secondsLeft, bellDue } from './vigil.js';

onVigil({ armed: true, deadline: null, countdownEnd: 10_000, forced: false });
assert.equal(vigil.armed, true);
assert.equal(secondsLeft(0), 10);
assert.equal(secondsLeft(9_001), 1);
assert.equal(secondsLeft(20_000), 0);
onVigil({ armed: true, deadline: null, countdownEnd: null, forced: false });
assert.equal(secondsLeft(0), null);
assert.equal(bellDue(91, 90), true);
assert.equal(bellDue(90, 89), false);
assert.equal(bellDue(1, 0), true);
assert.equal(bellDue(null, 120), false);
console.log('vigil ok');
