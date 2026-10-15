const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const ex={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/predator-fusion-v2.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{exports:ex,Date,Map});
const {buildPredatorFusionV2:build,validateFusionFrame,validFusionTick}=ex;
const now=Date.parse('2026-10-15T08:00:15Z');
const make=(count,period,base)=>Array.from({length:count},(_,i)=>({
  time:base-(count-i)*period,open:4145,close:4145,high:4145.3,low:4144.7
}));
const c1=make(100,60000,Math.floor(now/60000)*60000);
const c5=make(45,300000,Math.floor(now/300000)*300000);
const input={now,c1,c5,price:4145};
let o=build(input);
assert.equal(o.ok,true,'closed, fresh frames should feed a shadow model');
assert.equal(o.status,'SHADOW','unverified heuristics cannot become executable model');
assert.equal(o.side,'WAIT','flat candles without real microstructure cannot generate a direction');
for(const p of Object.values(o.horizons)){
  assert.equal(p.price,4145,'neutral market must not fabricate an upward center');
  assert.equal(p.buyProbability,50);
  assert.equal(p.sellProbability,50);
  assert.equal(p.probabilityBasis,'UNCALIBRATED_HEURISTIC');
}
assert.equal(o.inputs.tick,false);
assert.equal(validFusionTick({ok:true,at:now-7200},now),false);
assert.equal(validFusionTick({ok:true,at:now-1000},now),true);
const injected={ok:true,at:now-9000,side:'BUY',confidence:95,score:99,
  velocity05s:999,velocity1s:999,velocity3s:999,velocity4s:999,
  velocity15s:999,bookImbalance:500,acceleration:900,persistence:100};
o=build({...input,tick:injected});
assert.equal(o.inputs.tick,false,'stale impulse must not enter the microstructure predictor');
assert.equal(o.side,'WAIT','stale BUY pulse cannot turn flat candles into a BUY forecast');
o=build({...input,tick:{...injected,at:now-1000}});
assert.equal(o.inputs.tick,true,'a genuinely fresh tick may contribute to shadow evidence');
o=build({...input,c1:[...c1,{
  time:Math.floor(now/60000)*60000,
  open:4145,high:4500,low:4100,close:4480
}]});
assert.equal(o.side,'WAIT','a forming M1 candle cannot leak into a forecast');
o=build({...input,c5:[...c5,{
  time:Math.floor(now/300000)*300000,
  open:4145,high:4500,low:4100,close:4480
}]});
assert.equal(o.side,'WAIT','a forming M5 candle cannot leak into a forecast');
o=build({...input,c1:c1.filter((_,i)=>i!==95)});
assert.equal(o.ok,false,'M1 history gaps must block the fusion');
o=build({...input,c5:c5.filter((_,i)=>i!==42)});
assert.equal(o.ok,false,'M5 history gaps must block the fusion');
o=build({...input,now:now+4*60000});
assert.equal(o.ok,false,'stale market frame must not draw future targets');
o=build({...input,price:4450});
assert.equal(o.ok,false,'a mismatched live quote cannot feed synthetic paths');
assert.equal(validateFusionFrame(c1,60000,now,40,120000).ok,true);
console.log('PASS: causal closed M1/M5 Predator Fusion, real tick freshness, neutral motion and noncalibrated probability labeling');
