const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const ex={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/scalp-m1-paired-proof.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{exports:ex,require,Math,Number,Date});
const audit=ex.auditPairedM1Direction;
const start=Date.parse('2026-11-07T00:00:00Z');
const row=(n,model,baseline,actual)=>({
 issuedAt:start+n*60000,directionEvaluatedAt:start+(n+1)*60000,
 side:model,baselineSide:baseline,directionObserved:actual});
const waiting=Array.from({length:40},(_,i)=>row(i,'BUY','SELL','BUY'));
assert.equal(audit(waiting).status,'COLLECTING','small sample never certifies edge');
const qualified=Array.from({length:100},(_,i)=>
 i<40?row(i,'BUY','SELL','BUY'):row(i,'BUY','BUY','BUY'));
const win=audit(qualified);
assert.equal(win.n,100);
assert.equal(win.modelHits,100);
assert.equal(win.baselineHits,60);
assert.equal(win.modelOnly,40);
assert.equal(win.baselineOnly,0);
assert.equal(win.liftPctPoints,40);
assert.equal(win.status,'FORWARD_EDGE_CANDIDATE','only meaningful paired directional advantage qualifies a RESEARCH candidate');
const tied=Array.from({length:100},(_,i)=>
 i<20?row(i,'BUY','SELL','BUY'):
 i<40?row(i,'SELL','BUY','BUY'):
 row(i,'BUY','BUY','BUY'));
assert.equal(audit(tied).status,'NO_DEMONSTRATED_EDGE','equally accurate models never claim an edge');
const allUnknown=[...qualified.slice(0,40),...qualified.slice(40).map((x,i)=>({...x,directionObserved:i%2?'FLAT':'UNKNOWN'}))];
assert.equal(audit(allUnknown).status,'COLLECTING','flat/unknown outcomes are not wins');
const retro=qualified.map((t,i)=>i<30?{...t,baselineSide:undefined}:t);
assert.equal(audit(retro).n,70,'legacy attempts without frozen baselines cannot be backfilled');
assert.equal(audit(qualified.map(t=>({...t,directionEvaluatedAt:t.issuedAt+59000}))).n,0,
  'grades before the candle has closed cannot be evidence');
console.log('PASS: frozen paired M1 directional benchmark, 100 forward grades, no fake historical, stale or flat success');
