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
assert.equal(issued[0].setupLifecycle,'PENDING',
 'new genuine alerts are lifecycle-audited only from their live issue time');
const terminalState={side:'BUY',phase:'CANCELLED',sourceAt:pre.sourceAt,
 trigger:pre.trigger,invalidation:pre.invalidation,lastAt:start+71000,
 lastPrice:98.8,reason:'كسر مستوى الإبطال'};
const invalidated=step({prior:issued,now:start+72000,asset:'GOLD',
 source:'same-provider',price:98.8,signal:{phase:'WATCH',side:'WAIT',
 sourceAt:null,trigger:null,invalidation:null,targets:[]},
 setupState:terminalState,bars:[]});
assert.equal(invalidated[0].setupLifecycle,'INVALIDATED',
 'a historical BUY watch must show a later observed invalidation');
assert.equal(invalidated[0].issuedAt,issued[0].issuedAt);
assert.equal(invalidated[0].priceAt,issued[0].priceAt);
assert.equal(invalidated[0].setupResolvedAt,terminalState.lastAt);
const activated=step({prior:issued,now:start+72000,asset:'GOLD',
 source:'same-provider',price:100.5,signal:{phase:'WATCH',side:'WAIT',
 sourceAt:null,trigger:null,invalidation:null,targets:[]},
 setupState:{...terminalState,phase:'TRIGGERED',lastPrice:100.5},bars:[]});
assert.equal(activated[0].setupLifecycle,'ACTIVATED');
const notSamePlan=step({prior:issued,now:start+72000,asset:'GOLD',
 source:'same-provider',price:98.8,signal:{phase:'WATCH',side:'WAIT',
 sourceAt:null,trigger:null,invalidation:null,targets:[]},
 setupState:{...terminalState,sourceAt:pre.sourceAt+60000},bars:[]});
assert.equal(notSamePlan[0].setupLifecycle,'PENDING',
 'another setup cannot invalidate a differently timestamped previous alert');
const oldSetup={...issued[0]};delete oldSetup.setupLifecycle;
const legacySetup=step({prior:[oldSetup],now:start+72000,asset:'GOLD',
 source:'same-provider',price:98.8,signal:{phase:'WATCH',side:'WAIT',
 sourceAt:null,trigger:null,invalidation:null,targets:[]},
 setupState:terminalState,bars:[]});
assert.equal(legacySetup[0].setupLifecycle,undefined,
 'old events cannot be retroactively marked invalid without a real live lifecycle');
assert.equal(safe(invalidated)[0].setupLifecycle,'INVALIDATED');
const svg=fs.readFileSync('components/SniperOpportunityMarkers.tsx','utf8');
assert.match(svg,/data-lifecycle=/,
 'the chart should show historical early alert lifecycle status without moving price');
assert.match(svg,/ended\?' ×':''/,
 'invalidated chart watches are visually distinct from pending BUY watches');
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
// One bearish observation per wave, not a signal on every candle or a
// fictitious historical sell marker. New direction can be recorded at its
// FIRST real observation with the original timestamp.
const noEntry={phase:'WATCH',side:'WAIT',sourceAt:null,trigger:null,
 invalidation:null,targets:[]};
const fall=step({prior:[],now:start+2*60000+7000,asset:'GOLD',
 source:'same-provider',price:99,signal:noEntry,bars:[],
 candleLean:{phase:'FOLLOW',side:'SELL',issuedFor:start+2*60000,
 reason:'استمرار محتمل من زخم مغلق'},frameTrend:'SELL'});
assert.equal(fall.length,1);
assert.equal(fall[0].side,'SELL');
assert.equal(fall[0].setupType,'CONTINUATION');
assert.equal(fall[0].frameTrend,'SELL','higher-frame side is frozen at observation');
assert.equal(mod.exports.movementObservationLabel(fall[0]),'متابعة هبوط',
 'a decline is continuously visible without claiming an entry');
assert.equal(fall[0].issuedAt,start+2*60000+7000);
const sameFall=step({prior:fall,now:start+7*60000+7000,asset:'GOLD',
 source:'same-provider',price:97,signal:noEntry,bars:[],
 candleLean:{phase:'FOLLOW',side:'SELL',issuedFor:start+7*60000,
 reason:'استمرار محتمل من زخم مغلق'}});
assert.equal(sameFall.length,1,'repeated lower candles cannot spam sell captions');
const flipped=step({prior:sameFall,now:start+8*60000+7000,asset:'GOLD',
 source:'same-provider',price:98,signal:noEntry,bars:[],
 candleLean:{phase:'FOLLOW',side:'BUY',issuedFor:start+8*60000,
 reason:'استمرار محتمل من زخم مغلق'},frameTrend:'SELL'});
assert.equal(flipped.length,2,'a newly observed opposite wave should be visible');
assert.equal(flipped[1].side,'BUY');
assert.equal(mod.exports.movementObservationLabel(flipped[1]),'ارتداد صاعد',
 'opposite M1 bounce inside bearish M15 is NOT a BUY entry');
assert.equal(mod.exports.movementObservationLabel({
 side:'SELL',setupType:'REVERSAL',frameTrend:'BUY'}),'انعكاس هابط؟',
 'unconfirmed reversal is never marketed as confirmed SELL');
assert.equal(mod.exports.movementObservationLabel({
 side:'BUY',setupType:'CONTINUATION'}),'متابعة صعود',
 'old history without frozen M15 cannot be relabeled retroactively');
assert.equal(flipped[0].issuedAt,fall[0].issuedAt,
 'old sell timestamp and entry price remain immutable');
// PROSPECTIVE audit of the first wave after a true PREPARE observation:
// frozen fourteen-bar ATR, three later completed M1, never historical fill.
const auditBars=Array.from({length:15},(_,i)=>c(i,100.4,99.6));
const issuedAt=start+15*60000+1000;
const onsetPre={...pre,sourceAt:start+15*60000};
const observed=step({prior:[],now:issuedAt,asset:'GOLD',source:'same-provider',
 price:100,signal:onsetPre,bars:auditBars});
assert.equal(observed.length,1);
assert.equal(observed[0].onsetOutcome,'PENDING');
assert.ok(observed[0].onsetDistance>.4&&observed[0].onsetDistance<.5,
 'directional displacement threshold frozen from fourteen closed true ranges');
const cleanSignal={phase:'WATCH',side:'WAIT',sourceAt:null,
 trigger:null,invalidation:null,targets:[]};
const firstFuture=c(16,100.7,99.8);
const unfinished=step({prior:observed,now:start+16*60000+30000,
 asset:'GOLD',source:'same-provider',price:100,signal:cleanSignal,
 bars:[...auditBars,firstFuture]});
assert.equal(unfinished[0].onsetOutcome,'PENDING',
 'unfinished future minute is never graded');
const wave=step({prior:observed,now:start+17*60000,
 asset:'GOLD',source:'same-provider',price:100.6,signal:cleanSignal,
 bars:[...auditBars,firstFuture]});
assert.equal(wave[0].onsetOutcome,'MOVE_FIRST',
 'real favorable wave reached frozen ATR threshold after the alert');
assert.ok(wave[0].onsetDelaySeconds>60);
assert.equal(score(wave,'GOLD').onsetFirst,1);
const oppositeFirst=step({prior:observed,now:start+17*60000,
 asset:'GOLD',source:'same-provider',price:99.7,signal:cleanSignal,
 bars:[...auditBars,c(16,100.2,99.6)]});
assert.equal(oppositeFirst[0].onsetOutcome,'ADVERSE_FIRST');
const bothSameMinute=step({prior:observed,now:start+17*60000,
 asset:'GOLD',source:'same-provider',price:100,signal:cleanSignal,
 bars:[...auditBars,c(16,100.7,99.6)]});
assert.equal(bothSameMinute[0].onsetOutcome,'AMBIGUOUS',
 'both M1 wick barriers cannot establish which direction moved first');
const flatThree=[16,17,18].map(i=>c(i,100.2,99.8));
const flat=step({prior:observed,now:start+19*60000+1000,
 asset:'GOLD',source:'same-provider',price:100,signal:cleanSignal,
 bars:[...auditBars,...flatThree]});
assert.equal(flat[0].onsetOutcome,'NO_MOVE',
 'do not reward a forecast unless a later threshold was reached');
const missing=step({prior:observed,now:start+19*60000+1000,
 asset:'GOLD',source:'same-provider',price:100,signal:cleanSignal,
 bars:[...auditBars,flatThree[0],flatThree[2]]});
assert.equal(missing[0].onsetOutcome,'UNKNOWN',
 'data gap is not automatically a loss or a win');
const oldEarly={...observed[0]};
delete oldEarly.onsetOutcome;
delete oldEarly.onsetDistance;
const legacyAudit=step({prior:[oldEarly],now:start+19*60000+1000,
 asset:'GOLD',source:'same-provider',price:100,signal:cleanSignal,
 bars:[...auditBars,...flatThree]});
assert.equal(legacyAudit[0].onsetOutcome,undefined,
 'historical alerts cannot receive a threshold discovered after issuance');
const anotherVenue=step({prior:observed,now:start+19*60000+1000,
 asset:'GOLD',source:'another-venue',price:100,signal:cleanSignal,
 bars:[...auditBars,...flatThree]});
assert.equal(anotherVenue[0].onsetOutcome,'PENDING','cross-venue M1 cannot settle a gold alert');
assert.equal(safe(wave)[0].onsetOutcome,'MOVE_FIRST');
console.log('PASS: forward-only movement scorecard, no goal fabrication, time-to-detection and unambiguous future M1 scoring');
