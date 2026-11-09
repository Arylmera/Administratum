import assert from 'node:assert/strict';
import { riskOfPetition, allowed, armStep, ARM_MS, ARM_GAP_MS } from './petition.js';

// The risk is the backend's field (registry/risk.rs reads the raw command; its tests hold every key and near-miss).
assert.equal(riskOfPetition({ risk: 'git push --force', asks: 'Bash: ls' }), 'git push --force', 'the field, never the text');
assert.equal(riskOfPetition({ asks: 'Bash: rm -rf x' }), null, 'no field: not risky here (the UI never re-reads the text)');
assert.equal(riskOfPetition(null), null);

// The gates. Card and toast: a risky petition never offers Always; a safe one keeps all three.
assert.equal(allowed('always', 'rm -r', 'card'), false, 'no Always on a risky petition');
assert.ok(allowed('yes', 'rm -r', 'card') && allowed('no', 'rm -r', 'card'));
assert.ok(['yes', 'always', 'no'].every(c => allowed(c, null, 'card')));
// The phone (and any remote client): never Always; Deny only for a risky one.
assert.equal(allowed('yes', 'rm -r', 'phone'), false, 'the phone shows Deny only for a risky prompt');
assert.ok(allowed('no', 'rm -r', 'phone'));
assert.ok(allowed('yes', null, 'phone') && allowed('no', null, 'phone') && !allowed('always', null, 'phone'));
// Two clicks: the first arms; a second within [ARM_GAP_MS, ARM_MS] sends; a double-click holds; a late one arms again.
assert.equal(armStep(undefined, 1000), 'arm');
assert.equal(armStep(null, 1000), 'arm', 'never armed: the first click arms');
assert.equal(armStep(1000, 1000 + ARM_GAP_MS), 'send');
assert.equal(armStep(1000, 1000 + ARM_MS), 'send');
assert.equal(armStep(1000, 1000 + ARM_GAP_MS - 1), 'hold', 'a double-click never sends');
assert.equal(armStep(1000, 1000 + 50), 'hold');
assert.equal(armStep(1000, 1000 + ARM_MS + 1), 'arm', 'too late: armed again');
assert.equal(armStep(1000, 999), 'arm');
assert.deepEqual([ARM_MS, ARM_GAP_MS], [5000, 400]);
console.log('petition ok');
