const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Evaluate configuration only: never start an infinite polling loop or call a market API.
const source = fs.readFileSync('scripts/learning-worker.mjs', 'utf8');
const match = source.match(/^const intervalMs=(.+);$/m);
assert.ok(match, 'worker cadence must have one explicit configuration expression');
const interval = env => vm.runInNewContext(match[1], {process:{env}});

assert.equal(interval({}), 10000, 'default background analysis must run no faster than 10s');
assert.equal(interval({LEARNING_INTERVAL_MS:'3000'}), 10000, 'legacy 3s setting must be clamped');
assert.equal(interval({LEARNING_INTERVAL_MS:'20000'}), 20000, 'slower operator schedule is respected');
assert.equal(interval({LEARNING_INTERVAL_MS:'90000'}), 60000, 'configured interval must remain bounded');

const production = fs.readFileSync('learning-worker.mjs', 'utf8');
assert.match(production, /SCALP_PULSE_INTERVAL_MS\|\|5000/, 'paper scalp heartbeat stays on its independent 5s schedule');
assert.match(production, /if\(scalpEnabled\)void scalpLoop\(\)/, 'paper scalp heartbeat must run independently');
assert.match(production, /SCALP_PULSE_ENABLED/, 'paper heartbeat retains its opt-out');
console.log('PASS: 10s structural cadence regression and independent 5s paper scalp pulse');
