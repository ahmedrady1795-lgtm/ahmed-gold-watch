const assert=require('node:assert/strict'),fs=require('node:fs'),
 vm=require('node:vm'),ts=require('typescript');
const e={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/scalp-selection.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{exports:e,require:name=>name==='./scalp-risk-policy'?
 {requiredScalpNetR:()=>1.25}:require(name),Math,Number});
const target=e.nearestFeasibleScalpTarget;
const buy={side:'BUY',entry:4000,requiredMove:.504,reachCap:1.50,
 atr:1.2,pivots:[4001.35,4001.10,4000.66]};
const x=target(buy);
assert.ok(x&&x.price>=4000.51&&x.price<=4000.67);
assert.equal(x.price,4000.66,'only a near feasible pivot can be used');
assert.equal(x.kind,'STRUCTURE');
const far=target({...buy,pivots:[4001.35,4001.10]});
assert.equal(far.price,4000.51,'far pivot must not stretch target even inside cap');
assert.equal(far.kind,'PROJECTION');
const sell=target({side:'SELL',entry:4000,requiredMove:.504,reachCap:1.5,
 atr:1.2,pivots:[3998.65,3998.9,3999.34]});
assert.equal(sell.price,3999.34);
assert.equal(sell.kind,'STRUCTURE');
assert.equal(target({side:'SELL',entry:4000,requiredMove:.504,
 reachCap:1.5,atr:1.2,pivots:[3998.5]}).price,3999.49);
for(const side of ['BUY','SELL']){
 const v=target({side,entry:100,requiredMove:.605,reachCap:.60,atr:.9,pivots:[101,99]});
 assert.equal(v,null,'minimum required net move exceeding actual reach has no trade');
 assert.equal(target({side,entry:100,requiredMove:.595,reachCap:.6,
   atr:.9,pivots:[]})?.distance,.6,'outward tick rounding must not erode R');
}
assert.equal(target({...buy,requiredMove:1.8}),null);
assert.equal(target({...buy,reachCap:NaN}),null);
assert.equal(target({...buy,entry:-5}),null);
const opportunities=fs.readFileSync('lib/scalp-opportunities.ts','utf8');
assert.match(opportunities,/nearestFeasibleScalpTarget\(/);
assert.match(opportunities,/requiredMove:minReward,reachCap:targetCap/);
assert.match(opportunities,/const forwardReach=observedForwardReach\(a,chosen\.side,horizon\)/);
assert.match(opportunities,/if\(minReward>targetCap\|\|risk>maxRisk\)/);
console.log('PASS: cost-covered nearest BUY/SELL TP1, no far pivots, no forced beyond-reach entries and outward tick rounding');
