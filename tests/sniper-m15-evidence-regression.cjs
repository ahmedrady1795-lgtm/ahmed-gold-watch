const assert=require('node:assert/strict');
const fs=require('node:fs');
const script=fs.readFileSync('lib/sniper-m15-walkforward.ts','utf8');
assert.match(script,/pairedBaselineAccuracy/);
assert.match(script,/calibrated:false/);
assert.match(script,/selected>=40/);
const chart=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
assert.match(chart,/firstM15Stats\.label/);
console.log('PASS evidence guard');
