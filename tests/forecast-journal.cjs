const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const e={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/forecast-journal.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{exports:e});
const {updateForecastJournal:step}=e;
const now=Date.parse('2026-10-11T10:00:00Z');
const active=(price=100)=>({
  view:{side:'BUY',quality:'READY',price,priceFresh:true,forecastFresh:true,
    invalidation:99,confidence:71},
  targets:[{stage:1,price:102,low:101.8,high:102.2,quality:74,kind:'LIQUIDITY'},
    {stage:2,price:103,low:102.8,high:103.2,quality:68,kind:'STRUCTURE'}],
  activation:{min:2,max:10}
});
let j=step(null,active(),now,now-1000);
assert.equal(j.state,'ACTIVE');
assert.equal(j.targets[0].price,102);
const waiting={...active(),view:{...active().view,side:'WAIT',quality:'MONITOR'}};
j=step(j,waiting,now+22000,now+21000);
assert.equal(j.state,'MONITORING');
assert.equal(j.targets[0].price,102,'short model WAIT must not delete target');
let changed=active();changed.targets=[{...active().targets[0],price:101.8},active().targets[1]];
j=step(j,changed,now+28000,now+27000);
assert.equal(j.state,'ACTIVE');
assert.equal(j.targets[0].price,102,'tiny forecast revisions must not rewrite original targets');
j=step(j,{...active(102.1),view:{...active(102.1).view,side:'WAIT',quality:'MONITOR'}},
  now+35000,now+34000);
assert.equal(j.state,'TP_REACHED');
assert.equal(j.targets[0].reached,true);
assert.equal(j.targets[1].reached,false);
j=step(j,{...waiting,view:{...waiting.view,price:98.8}},now+39000,now+38000);
assert.equal(j.state,'INVALIDATED');
assert.equal(j.targets[0].price,102,'invalidated scenarios remain as non-active history');
j=step(j,active(),now+40000,now+39000);
assert.equal(j.state,'INVALIDATED','an old stopped scenario must not reactivate');
let fresh=step(null,active(),now,now-1000);
fresh=step(fresh,{...waiting,view:{...waiting.view,priceFresh:false}},
  now+31000,now-91000);
assert.equal(fresh.state,'STALE');
assert.equal(fresh.targets[0].price,102);
fresh=step(fresh,waiting,now+2800000,now+2799000);
assert.equal(fresh.state,'EXPIRED');
assert.equal(fresh.targets.length,2);
let other={...active(),view:{...active().view,side:'SELL',invalidation:101.2},
  targets:[{stage:1,price:98,low:97.9,high:98.1,quality:80,kind:'STRUCTURE'}]};
fresh=step(fresh,other,now+2805000,now+2804000);
assert.equal(fresh.side,'SELL','fresh qualified opposite prediction can replace expired plan');
assert.equal(fresh.state,'ACTIVE');
assert.equal(step(null,waiting,now,now-1000),null,'a WAIT has no new targets');
console.log('PASS: keep levels stable, pause not cancel, TP reached, stop hit, staleness, expiry, qualified reversal');
