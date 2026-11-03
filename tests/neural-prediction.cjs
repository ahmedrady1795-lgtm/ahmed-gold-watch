const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');

const code=ts.transpileModule(fs.readFileSync('lib/neural-prediction.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText;
const out={};
const env={NEURAL_ENABLED:'0'};
vm.runInNewContext(code,{exports:out,process:{env},AbortController,setTimeout,clearTimeout,Date});
const valid={ok:true,ready:true,status:'READY',side:'BUY',leanSide:'BUY',
  probUp:.64,probDown:.30,probNoise:.06,confidence:64,edge:0.34,
  samples:250,snapshotAgeMs:3000,
  pricePath:{ready:true,currentPrice:100,expectedPrice:101,horizonSeconds:60}};
const check=(v)=>out.validateNeuralPrediction(v);
assert.equal(check(valid).ready,true,'valid 3-class probability prediction is retained');
assert.equal(check({...valid,probNoise:undefined,probDown:.36}).ready,true,
  'valid 2-class prediction is retained');
assert.equal(check({...valid,ready:false}).side,'WAIT','unready models cannot vote');
assert.equal(check({...valid,ok:false}).ready,false,'non-ok service cannot vote');
assert.equal(check({...valid,ready:'true'}).ready,false,'string readiness is rejected');
assert.equal(check({...valid,side:'WAIT'}).ready,false,'ready model cannot vote WAIT');
assert.equal(check({...valid,probUp:1.4}).ready,false,'out-of-range probability is rejected');
assert.equal(check({...valid,probDown:0.1,probNoise:0.1}).ready,false,'invalid probability sum is rejected');
assert.equal(check({...valid,confidence:NaN}).ready,false,'NaN confidence is rejected');
assert.equal(check({...valid,confidence:130}).ready,false,'inflated confidence is rejected');
assert.equal(check({...valid,samples:-2}).ready,false,'negative sample count is rejected');
assert.equal(check({...valid,snapshotAgeMs:301000}).ready,false,'stale snapshot is rejected');
assert.equal(check({...valid,pricePath:{ready:true,currentPrice:0,expectedPrice:101,horizonSeconds:60}}).ready,false,
  'invalid ready price path is rejected');
assert.equal(check(null).ready,false,'null payload is rejected');

out.getNeuralPrediction().then((result)=>{
  assert.equal(result.status,'DISABLED','operator kill switch overrides inference');
  assert.equal(result.ready,false);
  console.log('PASS: Neural prediction schema, probability, stale snapshot, path and kill-switch checks.');
}).catch(err=>{console.error(err);process.exitCode=1;});
