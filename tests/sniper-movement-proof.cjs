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
assert.match(svg,/ended&&<text/,
 'invalidated historical watches keep an inline X next to the original price');
assert.doesNotMatch(svg,/<rect\b/,
 'no drawn BUY/SELL, test, early, or M5 text badges may use large filled rectangles');
assert.match(svg,/s\.quality==='SETUP'\?\(buy\?'شراء':'بيع'\)/,
 'only a qualified confirmed setup can have an unqualified BUY/SELL label');
// Verify actual SVG output across a price update and chart rollover.
const markerModule={exports:{}};
vm.runInNewContext(ts.transpileModule(svg,{fileName:'Markers.tsx',compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX
}}).outputText,{exports:markerModule.exports,module:markerModule,require(name){
 if(name==='../lib/sniper-movement-proof')return mod.exports;
 if(name==='./SniperOpportunityHistory')return {outcomeLabel:{}};
 return require(name);
}});
const renderMarker=require('react-dom/server').renderToStaticMarkup;
const markerProps={asset:'GOLD',source:'same-provider',from:start,now:start+90000,
 left:0,split:180,end:260,top:0,bottom:250,py:p=>p,timeX:t=>(t-start)/1000,
 records:[{...issued[0],kind:'FOLLOW'}],signal:{...pre,phase:'BREAK_CONFIRMED',
 quality:'SETUP',sourceAt:start+75000},confirmedPrice:101.25};
for(const split of [180,200]){
 const markup=renderMarker(markerModule.exports.default({...markerProps,split}));
 assert.match(markup,/<circle cx="75" cy="101.25"/,'confirmation stays at issued coordinates');
 const dot=markup.match(/<g[^>]*data-kind="FOLLOW"[^>]*>(.*?)<\/g>/s)?.[1];
 assert.ok(dot,'keep the original M5 history');
 assert.match(dot,/fill="#64e8b2"/,'recent BUY observation gets a distinct direction color');
 assert.match(dot,/رصد شراء/,'recent M5 observation needs a visible directional caption');
 assert.match(dot,/data-role="m5-observation-label"/,'M5 watch is not a qualified entry');
}
// The latest M5 observation is legible on the chart without using a plain
// BUY/SELL trade directive; historical dots remain independently anchored.
const mirrored=renderMarker(markerModule.exports.default({...markerProps,
  signal:{phase:'WATCH',side:'WAIT',sourceAt:null,trigger:null,invalidation:null,targets:[]},
  confirmedPrice:null,
  records:[
    {...issued[0],id:'sell-follow',kind:'FOLLOW',side:'SELL',issuedAt:start+70000,priceAt:105},
    {...issued[0],id:'buy-open',kind:'OPEN',side:'BUY',issuedAt:start+80000,priceAt:95},
    {...issued[0],id:'old-sell',kind:'FOLLOW',side:'SELL',issuedAt:start+6000,priceAt:111}
  ]
}));
assert.match(mirrored,/رصد شراء/,'recent M5 buy watch readable');
assert.match(mirrored,/رصد بيع/,'recent M5 sell watch readable');
assert.match(mirrored,/data-kind="FOLLOW"/,'older M5 dot stays pinned');
assert.doesNotMatch(mirrored,/>شراء<|>بيع</,
  'passive direction is never a confirmed trade entry');
const panelCaption=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
assert.match(panelCaption,/py\(markerPrice\)>=plotTop/,
 'suppress the duplicate corner label only for a visible price marker');
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
const onsetPre={...pre,sourceAt:start+15*60000,setupKind:'STRUCTURE'};
const observed=step({prior:[],now:issuedAt,asset:'GOLD',source:'same-provider',
 price:100,signal:onsetPre,bars:auditBars});
assert.equal(observed.length,1);
assert.equal(observed[0].onsetOutcome,'PENDING');
assert.equal(observed[0].setupKind,'STRUCTURE',
 'new prospectively issued alerts freeze their detector identity');
assert.equal(issued[0].setupKind,undefined,
 'old untagged alerts must not be assigned a model retrospectively');
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
const structureStats=score(wave,'GOLD').byPattern;
assert.equal(structureStats.length,1);
assert.equal(structureStats[0].pattern,'STRUCTURE');
assert.equal(structureStats[0].alerts,1);
assert.equal(structureStats[0].resolved,1);
assert.equal(structureStats[0].favorable,1);
assert.equal(structureStats[0].onsetRate,100);
assert.equal(structureStats[0].adverse,0);
assert.equal(structureStats[0].noMove,0);
assert.equal(structureStats[0].observedInterval,null,
 'one observation is never an evidence-backed success-rate estimate');
const sample30=Array.from({length:30},(_,i)=>({
 ...wave[0],id:'forward-pattern-'+i,
 onsetOutcome:i<22?'MOVE_FIRST':'ADVERSE_FIRST'
}));
const sufficientlyScored=score(sample30,'GOLD').byPattern[0];
assert.equal(sufficientlyScored.resolved,30);
assert.equal(sufficientlyScored.favorable,22);
assert.equal(sufficientlyScored.adverse,8);
assert.equal(sufficientlyScored.noMove,0);
assert.ok(sufficientlyScored.observedInterval!=null&&
 sufficientlyScored.observedInterval.low<73&&
 sufficientlyScored.observedInterval.high>73&&
 sufficientlyScored.observedInterval.high<=100,
 'Wilson interval must honestly reflect finite-sample first-wave uncertainty');
const uncertain=score([{...wave[0],id:'ambiguous',onsetOutcome:'AMBIGUOUS'}],
 'GOLD').byPattern[0];
assert.equal(uncertain.unknown,1);
assert.equal(uncertain.resolved,0);
assert.equal(uncertain.onsetRate,null,
 'unknown intra-minute path can never be graded as a win or loss');
assert.equal(safe(wave)[0].setupKind,'STRUCTURE');
assert.equal(score(issued,'GOLD').byPattern.length,0,
 'legacy unclassified rows never acquire a made-up historical model');
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
const expiresAt=start+180000;
const expiring=step({prior:[],now:start+68000,asset:'GOLD',source:'same-provider',
 price:100,signal:pre,bars:[],setupState:{...terminalState,phase:'ARMED',
 lastAt:start+68000,lastPrice:100,expiresAt}});
assert.equal(expiring[0].setupExpiresAt,expiresAt);
const reloaded=safe(JSON.parse(JSON.stringify(expiring)));
const afterExpiry=step({prior:reloaded,now:expiresAt,asset:'GOLD',source:'same-provider',
 price:100,signal:{phase:'WATCH',side:'WAIT'},bars:[],setupState:null});
assert.equal(afterExpiry[0].setupLifecycle,'EXPIRED','expiry survives browser reload or replacement');
assert.equal(afterExpiry[0].setupResolvedAt,expiresAt);
assert.equal(afterExpiry[0].issuedAt,expiring[0].issuedAt);
assert.equal(afterExpiry[0].priceAt,expiring[0].priceAt);
assert.equal(afterExpiry[0].status,'PENDING','watch expiry must not invent a trade loss');
const stillActivated=step({prior:[{...reloaded[0],setupLifecycle:'ACTIVATED'}],
 now:expiresAt,asset:'GOLD',source:'same-provider',price:100,
 signal:{phase:'WATCH',side:'WAIT'},bars:[]});
assert.equal(stillActivated[0].setupLifecycle,'ACTIVATED','activation remains historical fact');
const unmatched=step({prior:[],now:start+68000,asset:'GOLD',source:'same-provider',
 price:100,signal:pre,bars:[],setupState:{...terminalState,phase:'ARMED',
 sourceAt:pre.sourceAt+1,expiresAt}});
assert.equal(unmatched[0].setupExpiresAt,undefined,'another plan cannot donate its expiry');
const panel=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
assert.match(panel,/movementStats\.byPattern\.map\(p=>/,
 'per-pattern forward results appear only in the optional performance drawer');
console.log('PASS: immutable watch expiry persists without fabricated trade outcomes');

const evidenceInput={reason:'closed minute rejection',flowStatus:'PRICE_PROXY',
 flowSource:'M1 closed OHLC',flowSide:'WAIT',liquidityReady:true,
 m1Side:'SELL',m15Side:'BUY',proxySide:'UNAVAILABLE'};
const captured=step({prior:[],now:start+68000,asset:'GOLD',source:'same-provider',
 price:100,signal:pre,bars:[],evidence:evidenceInput});
evidenceInput.reason='changed after issuance';
assert.equal(captured[0].evidence.reason,'closed minute rejection');
const reread=step({prior:captured,now:start+69000,asset:'GOLD',source:'same-provider',
 price:101,signal:pre,bars:[],evidence:evidenceInput});
assert.equal(reread[0].evidence.reason,'closed minute rejection');
assert.equal(safe(JSON.parse(JSON.stringify(reread)))[0].evidence.flowStatus,'PRICE_PROXY');
assert.equal(safe([{...reread[0],evidence:{reason:42}}])[0].evidence,undefined);
assert.equal(safe([{...issued[0],evidence:undefined}])[0].evidence,undefined);
const watchRow={...issued[0],setupLifecycle:'PENDING',setupExpiresAt:start+240000};
const renderEarly=(row,signal=pre)=>renderMarker(markerModule.exports.default({
 ...markerProps,signal,records:[row]}));
const getEarly=markup=>markup.match(/<g[^>]*data-kind="EARLY"[^>]*>(.*?)<\/g>/s)[1];
assert.match(getEarly(renderEarly(watchRow)),/<path /,'current pending watch keeps its triangle');
for(const row of [{...watchRow,setupLifecycle:'ACTIVATED'},
 {...watchRow,setupExpiresAt:start+80000},{...watchRow,setupLifecycle:undefined}]){
 const output=getEarly(renderEarly(row));
 assert.doesNotMatch(output,/<path /,'historical early markers must be neutral');
 assert.doesNotMatch(output,/<text[^>]*>ترقب/,'historical alert must not read as a new watch');
 assert.match(output,/<circle /,'retain the original observation');
}
assert.doesNotMatch(getEarly(renderEarly(watchRow,{...pre,side:'SELL'})),/<path /,
 'an opposite active setup retires the old directional triangle');
console.log('PASS immutable signal evidence, legacy recovery and active-only early captions');
