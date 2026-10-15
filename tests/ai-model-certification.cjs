const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('vm');
const ex={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/ai-model-certification.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{exports:ex});
const {certifyHoldout,certifyMlResponse,certifyNeuralResponse,wilsonLowerBound}=ex;
assert.equal(wilsonLowerBound(0,0),0);
assert.ok(wilsonLowerBound(65,100)<.60);
assert.ok(wilsonLowerBound(8,10)<.60);
const weak={n:180,selectiveN:95,selectiveAccuracy:.53,selectiveCoverage:95/180};
const strong={n:400,selectiveN:250,selectiveAccuracy:.64,selectiveCoverage:250/400};
assert.equal(certifyHoldout(weak,true).ready,false,'weak OOS advantage must not be promoted');
assert.equal(certifyHoldout(strong,true).ready,true,'genuinely supported independent OOS can qualify');
assert.equal(certifyHoldout(strong,false).ready,false,'never overrule provider veto');
assert.equal(certifyHoldout({...strong,selectiveCoverage:.02},true).ready,false);
assert.equal(certifyHoldout({...strong,selectiveN:0},true).ready,false);
assert.equal(certifyHoldout({...strong,selectiveCoverage:.12},true).ready,false,
  'reported coverage must match selected/n, not an arbitrary flattering fraction');
assert.equal(certifyHoldout({...strong,pairedBaselineAccuracy:.70},true).ready,false,
  'a model must beat its actually paired holdout baseline');
assert.equal(certifyHoldout({...strong,pairedBaselineAccuracy:.50},true).ready,true);
const response={ok:true,status:'READY',oneMinute:{ready:true,side:'BUY',metrics:{ensemble:weak}},
  fiveMinute:{ready:true,side:'SELL',metrics:{ensemble:strong}},
  consensus:{side:'BUY',aligned:true,ready:true,confidence:84}};
const ml=certifyMlResponse(response);
assert.equal(ml.oneMinute.ready,false);
assert.equal(ml.fiveMinute.ready,true);
assert.equal(ml.status,'SHADOW');
assert.equal(ml.oneMinute.side,'WAIT','blocked model cannot supply an executable side');
assert.equal(ml.consensus.side,'WAIT','rejected/conflicting horizons cannot leak a buy/sell consensus');
assert.equal(ml.consensus.ready,false);
assert.equal(response.oneMinute.ready,true,'original provider input must remain unchanged');
const neural={ok:true,ready:true,status:'READY',side:'BUY',
  snapshotAgeMs:1000,metrics:{holdout:strong}};
assert.equal(certifyNeuralResponse(neural).ready,true);
assert.equal(certifyNeuralResponse({...neural,snapshotAgeMs:90000}).ready,false);
assert.equal(certifyNeuralResponse({...neural,snapshotAgeMs:90000}).side,'WAIT');
const failedPath=certifyNeuralResponse({...neural,snapshotAgeMs:90000,pricePath:{ready:true,side:'BUY',status:'READY'}});
assert.equal(failedPath.pricePath.ready,false,'stale classifier cannot carry an independently unvetted path');
assert.equal(certifyNeuralResponse({...neural,snapshotAgeMs:undefined}).ready,false);
console.log('PASS: ML/Neural promotion needs real selective holdouts, Wilson bounds and fresh inference');
