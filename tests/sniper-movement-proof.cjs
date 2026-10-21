const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(
 fs.readFileSync('lib/sniper-movement-proof.ts','utf8'),{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,
 {module:mod,exports:mod.exports});
const {advanceMovementProof:step,movementProofScore:score,safeMovementProof:safe}=mod.exports;
const start=Date.parse('2026-10-21T11:00:00Z'),c=(i,h,l)=>({
 time:start+i*60000,open:100,high:h,low:l,close:100
});
const empty=[];
const pre={phase:'PREPARE',side:'BUY',sourceAt:start+60000,
 trigger:100.4,invalidation:99,targets:[101]};
const issued=step({prior:empty,now:start+68000,asset:'GOLD',
 source:'same-provider',price:100,signal:pre,bars:[c(0,100.2,99.8)]});
assert.equal(issued.length,1);
assert.equal(issued[0].status,'PENDING');
assert.equal(issued[0].kind,'EARLY');
assert.equal(issued[0].target,101);
const dup=step({prior:issued,now:start+70000,asset:'GOLD',source:'same-provider',
 price:100,signal:pre,bars:[]});
assert.equal(dup,issued,'no duplicate on every client quote');
const breakout={...pre,phase:'BREAK_CONFIRMED',sourceAt:start+120000};
const withBreak=step({prior:issued,now:start+123000,asset:'GOLD',
 source:'same-provider',price:100.5,signal:breakout,bars:[c(0,100.4,99.8)]});
assert.equal(withBreak.length,2);
assert.equal(withBreak[1].kind,'BREAK');
assert.equal(withBreak[1].leadSeconds,52);
assert.equal(withBreak[1].detectedAfterMs,3000);
const after=step({prior:withBreak,now:start+240500,asset:'GOLD',
 source:'same-provider',price:100.5,signal:{phase:'WATCH',side:'WAIT',sourceAt:null,
 trigger:null,invalidation:null,targets:[]},
 bars:[c(2,100.8,99.9),c(3,101.2,99.5)]});
assert.equal(after[0].status,'TARGET');
assert.equal(after[1].status,'TARGET');
assert.equal(score(after,'GOLD').targetRate,100);
assert.equal(score(after,'GOLD').hits,1,'confirmed breakout counted once');
assert.equal(score(after,'GOLD').averageLagSeconds,3);
const ambiguous=step({prior:issued,now:start+240000,asset:'GOLD',source:'same-provider',
 price:100,signal:{phase:'WATCH',side:'WAIT',sourceAt:null,trigger:null,invalidation:null,targets:[]},
 bars:[c(2,101.1,98.5)]});
assert.equal(ambiguous[0].status,'AMBIGUOUS','same-minute order unknown');
const noTarget=step({prior:[],now:start+68000,asset:'GOLD',source:'same-provider',price:100.5,
 signal:{...pre,targets:[100,99.8]},bars:[]});
assert.equal(noTarget[0].status,'NO_TARGET','do not invent TP');
assert.equal(score(noTarget,'GOLD').targetRate,null,'no target cannot count as hit');
assert.equal(step({prior:issued,now:start+240000,asset:'BTC',source:'different',price:100,
 signal:{phase:'WATCH',side:'WAIT',sourceAt:null,targets:[],trigger:null,invalidation:null},
 bars:[c(2,130,20)]})[0].status,'PENDING','different asset cannot settle gold');
assert.equal(safe([{bogus:true},...issued]).length,1);
console.log('PASS: forward-only movement scorecard, no goal fabrication, time-to-detection and unambiguous future M1 scoring');
