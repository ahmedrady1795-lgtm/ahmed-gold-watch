const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const ex={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/sniper-m1-conflict-arbiter.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{exports:ex,Math,Number,Date});
const decide=ex.assessM1Conflict;
const correct={pressure:'SELL',follow:'BUY',actual:'BUY'};
const failure={pressure:'SELL',follow:'BUY',actual:'SELL'};
const n=(a,b)=>[...Array.from({length:a},()=>correct),...Array.from({length:b},()=>failure)];
let good=decide(n(11,2),n(5,1));
assert.equal(good.useFollow,true,'both disjoint windows show strong opposite model edge');
assert.equal(good.trainN,13);
assert.equal(good.checkN,6);
assert.equal(decide(n(11,2),n(3,1)).useFollow,false,'too few later independent checks');
assert.equal(decide(n(7,4),n(5,1)).useFollow,false,'older data must also support switch');
assert.equal(decide(n(11,2),n(3,3)).useFollow,false,'failing later check cancels the switch');
assert.equal(decide(n(6,2),n(5,1)).useFollow,false,'too few older disagreements');
const same={pressure:'BUY',follow:'BUY',actual:'BUY'};
assert.equal(decide([...n(6,2),same,same],n(5,1)).useFollow,false,
 'agreement samples cannot inflate evidence for a true conflict');
const latest=fs.readFileSync('lib/sniper-m1-every-direction.ts','utf8');
assert.match(latest,/pressureBodyConflict\(rows\)/);
assert.match(latest,/const alternative=adaptive\.improved\?rawCandidate/);
assert.match(latest,/const weak=flatCluster\|\|applyEarly\|\|applyRelative\|\|applyRecovery\|\|applyConflict\?true/,
 'new research challenger cannot be promoted into entry-ready direction');
assert.match(latest,/const pressureNow=rawCandidate\(rows,'PRESSURE_SWEEP'\)/);
const ledger=fs.readFileSync('lib/scalp-every-candle.ts','utf8');
assert.match(ledger,/signal\.conflictOverride\?\.applied\?'BODY_FOLLOW'/,
 'frozen online prediction must record its actual model');
console.log('PASS: train/check M1 pressure-body disagreement, no small-window promotion, correct frozen model and weak risk gate');
