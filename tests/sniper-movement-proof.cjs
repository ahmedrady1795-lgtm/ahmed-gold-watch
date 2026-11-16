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
// Only a complete next M5 candle can score direction. The M1 target may
// already be settled, but no M5 score exists before the actual close.
assert.equal(withBreak[1].m5Outcome,'PENDING');
const m5Bar={time:start+5*60000,open:100.5,high:101.4,low:99.9,close:101.1};
const tooSoon=step({prior:withBreak,now:start+9*60000,asset:'GOLD',
 source:'same-provider',price:101,signal:{phase:'WATCH',side:'WAIT',
 sourceAt:null,trigger:null,invalidation:null,targets:[]},bars:[],
 m5Bars:[m5Bar]});
assert.equal(tooSoon[1].m5Outcome,'PENDING',
 'unfinished M5 never scores movement');
const afterM5=step({prior:withBreak,now:start+10*60000+1000,
 asset:'GOLD',source:'same-provider',price:101,signal:{phase:'WATCH',
 side:'WAIT',sourceAt:null,trigger:null,invalidation:null,targets:[]},
 bars:[],m5Bars:[m5Bar]});
assert.equal(afterM5[1].m5Outcome,'CORRECT');
assert.equal(afterM5[0].m5Outcome,'CORRECT');
assert.equal(score(afterM5,'GOLD').m5Scored,1,
 'score confirmed breaks separately from true early alerts');
assert.equal(score(afterM5,'GOLD').earlyM5Scored,1);
assert.equal(score(afterM5,'GOLD').m5Rate,100);
const legacy={...withBreak[1]};delete legacy.m5Outcome;
const untouchedLegacy=step({prior:[legacy],now:start+10*60000+1000,
 asset:'GOLD',source:'same-provider',price:101,
 signal:{phase:'WATCH',side:'WAIT',sourceAt:null,
 trigger:null,invalidation:null,targets:[]},bars:[],m5Bars:[m5Bar]});
assert.equal(untouchedLegacy[0].m5Outcome,undefined,
 'legacy events cannot gain hindsight M5 grades after the rollout');
const wrong=step({prior:withBreak,now:start+10*60000+1000,
 asset:'GOLD',source:'same-provider',price:98,
 signal:{phase:'WATCH',side:'WAIT',sourceAt:null,
 trigger:null,invalidation:null,targets:[]},bars:[],
 m5Bars:[{...m5Bar,close:99.0,low:98.5}]});
assert.equal(wrong[1].m5Outcome,'WRONG');
assert.equal(score(wrong,'GOLD').m5Rate,0);
console.log('PASS: forward-only movement scorecard, no goal fabrication, time-to-detection and unambiguous future M1 scoring');
