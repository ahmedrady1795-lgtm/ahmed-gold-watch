const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const src=fs.readFileSync('lib/sniper-m5-early-cue.ts','utf8');
const exp={};
vm.runInNewContext(ts.transpileModule(src,{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS
}}).outputText,{exports:exp});
const {chartM5EarlyCue:cue}=exp;
const now=Date.parse('2026-11-21T12:00:30Z');
const pressure=(side)=>({ok:true,stage:'ARMED',status:'CONDITIONAL_WATCH',
 side,sourceAt:now-15000,trigger:side==='BUY'?101:99,
 invalidation:side==='BUY'?98:102,readiness:63});
const base={now,price:100,marketOpen:true,priceFresh:true,
 providerTransition:false,preMove:null,opportunity:null,
 lean:null,m5Follow:null};
for(const side of ['BUY','SELL']){
 const a={...base,preMove:pressure(side)},r=cue(a);
 assert.equal(r.stage,'PREBREAK',side+' must appear before its frozen trigger');
 assert.equal(r.side,side);
 assert.equal(r.trigger,side==='BUY'?101:99);
 assert.equal(r.invalidation,side==='BUY'?98:102);
 assert.equal(r.futureTradeAuthorized,false);
 assert.equal(r.flowVerified,false,'OHLC pressure is never true exchange order flow');
 assert.match(r.headline,side==='BUY'?/شراء/:/بيع/);
 assert.equal(cue({...a,price:side==='BUY'?101.02:98.98}).stage,'NONE',
  'a pre-break BUY/SELL cue must disappear once price already crossed');
 assert.equal(cue({...a,preMove:{...a.preMove,sourceAt:now-120000}}).stage,'NONE');
 assert.equal(cue({...a,price:side==='BUY'?97.9:102.1}).stage,'NONE',
  'no prebreak if invalidation already passed');
 assert.equal(cue({...a,price:side==='BUY'?50:150}).stage,'NONE',
  'no distant or phantom prebreak beyond observed risk band');
 assert.equal(cue({...a,priceFresh:false}).stage,'OFFLINE');
 assert.equal(cue({...a,providerTransition:true}).stage,'OFFLINE');
 assert.equal(cue({...a,marketOpen:false}).stage,'OFFLINE');
 const o={phase:'PREPARE',side,sourceAt:now-10000,
  trigger:a.preMove.trigger,invalidation:a.preMove.invalidation};
 assert.equal(cue({...a,opportunity:o}).stage,'PREBREAK',
  'already armed exact observation comes first');
 assert.equal(cue({...a,opportunity:{...o,phase:'TESTING'},
  price:side==='BUY'?101.05:98.95}).stage,'TESTING',
  'postcross test is NOT a pre-move');
 assert.equal(cue({...a,opportunity:{...o,phase:'BREAK_CONFIRMED'},
  price:side==='BUY'?101.2:98.8}).stage,'BREAK_OBSERVED');
 assert.equal(cue({...a,opportunity:{...o,phase:'BREAK_CONFIRMED'},
  price:side==='BUY'?104:96}).stage,'LATE',
  'confirmed but too late must not chase');
}
// A past crossing cannot hide a new, still-ahead independent M1/M5 cue.
for(const side of ['BUY','SELL']){
 const oldTrigger=side==='BUY'?99.8:100.2;
 const oldStop=side==='BUY'?98:102;
 const reclaim={side,asOf:now-5000,trigger:side==='BUY'?101:99,
  invalidation:side==='BUY'?98:102};
 for(const phase of ['PREPARE','TESTING','BREAK_CONFIRMED']){
  const opportunity={phase,side,sourceAt:now-30000,trigger:oldTrigger,invalidation:oldStop};
  const fresh=cue({...base,opportunity,reclaim});
  assert.equal(fresh.stage,'PREBREAK',side+' fresh reclaim must outlive old '+phase);
  assert.equal(fresh.trigger,reclaim.trigger);
  assert.equal(fresh.futureTradeAuthorized,false);
  assert.equal(fresh.flowVerified,false);
  assert.equal(cue({...base,opportunity,preMove:pressure(side)}).stage,'PREBREAK');
  assert.notEqual(cue({...base,opportunity,reclaim:{...reclaim,asOf:now-120000}}).stage,'PREBREAK');
 }
}
const momentum={phase:'OPEN',side:'BUY',issuedFor:Math.floor(now/60000)*60000,
 observedAfterMs:30000,tradeEligible:false};
assert.equal(cue({...base,lean:momentum}).stage,'M1_DIRECTION_WATCH');
assert.equal(cue({...base,lean:{...momentum,phase:'FOLLOW'}}).stage,'NONE');
assert.equal(cue({...base,lean:{...momentum,issuedFor:now-120000}}).stage,'NONE');
assert.equal(cue({...base,m5Follow:{ready:true,side:'SELL',
 reason:'observed falling closed M5'}}).stage,'M5_FOLLOWING');
const panel=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const overlay=fs.readFileSync('components/SniperM15HuntOverlay.tsx','utf8');
assert.match(panel,/const m5Cue=useMemo\(\(\)=>chartM5EarlyCue/);
assert.match(panel,/const drawingSide=mainSetup\?trackedSetup\?\.side/);
assert.match(panel,/cuePrebreak\?m5Cue.side/);
assert.match(panel,/const passiveWatch=!mainSetup/);
assert.match(panel,/sniper-m5-prebreak-cue/);
assert.match(panel,/m5Cue\.trigger>=lo&&m5Cue\.trigger<=hi/);
assert.match(panel,/ترقب شراء قبل الكسر/);
assert.doesNotMatch(panel,/const drawingBadge=passiveWatch\?'مراقبة · لا توجد إشارة دخول'/,
 'real lower-frame direction should not be hidden behind generic WAIT');
assert.match(overlay,/p\.proof\?\.status==='NO_DEMONSTRATED_EDGE'\?'M15 · CONTEXT'/);
assert.match(overlay,/M15 بلا أفضلية مثبتة · راقب M1\/M5/);
assert.doesNotMatch(src,/OrderSend|placeOrder|ExnessOrder|liveExecution/);
console.log('PASS: independent M5 BUY/SELL prebreak on closed pressure despite unproven M15, explicit trigger, no late chase, no phantom order or stale data');

assert.match(panel,/const distinctPrebreak=cuePrebreak&&\(!mainSetup\|\|/);
assert.match(panel,/\{distinctPrebreak&&m5Cue.trigger!=null/,'old setup cannot mask a distinct prebreak line');

const shortTape={side:'SELL',trigger:99,invalidation:102,asOf:now-2000,source:'Kraken XBT/USD',deltaPct:-60};
assert.equal(cue({...base,shortTape}).stage,'PREBREAK');
assert.equal(cue({...base,shortTape}).side,'SELL');
assert.equal(cue({...base,shortTape,price:98}).stage,'NONE');
assert.equal(cue({...base,shortTape:{...shortTape,asOf:now-20000}}).stage,'NONE');
assert.match(panel,/shortTape:tapeWatch/);

assert.match(panel,/shortTape:tapeWatch,liquidity:liquidityMagnets/,
 'same-venue short tape must enter the live entry decision, not just appear as a dot');
assert.match(panel,/<SniperOpportunityMarkers signal=\{movementSignal\}/,
 'the same forward-only early candidate the audit sees must be drawn on the chart');
assert.match(panel,/if\(earlyOpportunity.phase==='PREPARE'\|\|earlyOpportunity.phase==='BREAK_CONFIRMED'\|\|/,
 'an established tracked setup must beat a fresh weak independent reading');
assert.match(panel,/data-sniper-decision-provenance/,
 'existing collapsed scorecard must explain selected source/why no entry');


// The visible prebreak was historically absent from performance records
// unless an unrelated tracked setup or M1-reclaim branch won. Verify that
// its ORIGINAL first-seen time/price are frozen, never reconstructed later.
const {cueForwardObservation:freezeCue}=exp;
const initialCue=cue({...base,preMove:{...pressure('SELL'),sweep:'NONE'}});
const forward=freezeCue(initialCue,now,100);
assert.ok(forward,'visible price-only prebreak must have an auditable observation');
assert.equal(forward.phase,'PREPARE');
assert.equal(forward.setupKind,'COMPRESSION');
assert.equal(forward.quality,'OBSERVATION');
assert.equal(forward.tradeEligible,false);
assert.equal(forward.sourceAt,now-15000);
assert.equal(forward.targets.length,0);
assert.equal(freezeCue(initialCue,now,99),null,'a crossed SELL cannot be backdated');
assert.equal(freezeCue(initialCue,now+100000,100),null,'an expired cue cannot be revived');
assert.equal(freezeCue({...initialCue,stage:'BREAK_OBSERVED'},now,100),null);
assert.equal(freezeCue({...initialCue,flowVerified:true},now,100),null,
 'the price-only observer cannot claim verified order flow');

const proofExp={};
vm.runInNewContext(ts.transpileModule(
 fs.readFileSync('lib/sniper-movement-proof.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
 }).outputText,{exports:proofExp});
const {advanceMovementProof:advance,movementProofScore:score}=proofExp;
const closeMinute=Math.floor(now/60000)*60000;
const frozenBars=Array.from({length:20},(_,i)=>({
 time:closeMinute-(20-i)*60000,
 open:100,high:100.3,low:99.7,close:100
}));
const common={now,asset:'GOLD',source:'Biquote · MT5 XAUUSD candles',
 price:100,signal:forward,bars:frozenBars,m5Bars:[],
 frameTrend:'WAIT',evidence:{reason:forward.reason,
 flowStatus:'UNAVAILABLE',flowSource:'NONE',flowSide:'WAIT',
 liquidityReady:false,m1Side:'WAIT',m15Side:'WAIT',proxySide:'UNAVAILABLE'}};
const once=advance({...common,prior:[]});
assert.equal(once.length,1);
assert.equal(once[0].kind,'EARLY');
assert.equal(once[0].setupKind,'COMPRESSION');
assert.equal(once[0].issuedAt,now,'audit must freeze real first display time');
assert.equal(once[0].priceAt,100);
assert.equal(once[0].m5Outcome,'PENDING');
assert.equal(once[0].onsetOutcome,'PENDING');
assert.equal(score(once,'GOLD').byPattern[0].alerts,1);
const twice=advance({...common,now:now+1000,price:100.05,prior:once});
assert.equal(twice.length,1,'rerenders must not inflate the early-hit denominator');
assert.equal(twice[0].issuedAt,now);
assert.equal(twice[0].priceAt,100,'realtime price movement cannot repaint original alert');
const future={time:closeMinute+60000,open:100,high:100.1,low:99.40,close:99.6};
const settled=advance({...common,now:closeMinute+120000,price:99.6,
 prior:twice,signal:{phase:'WATCH',side:'WAIT',sourceAt:null,trigger:null,
 invalidation:null,targets:[]},bars:[...frozenBars,future]});
assert.equal(settled.length,1);
assert.equal(settled[0].onsetOutcome,'MOVE_FIRST',
 'only future completed bars may credit a favorable early move');
assert.equal(settled[0].priceAt,100);
assert.match(panel,/const cueAuditCandidate=useMemo\(\(\)=>cueForwardObservation/);
assert.match(panel,/prior:first,now,asset,source,price,signal:cueAuditCandidate/,
 'audit must record a distinct visible prebreak even if an older tracked setup exists');
console.log('PASS: displayed M5 prebreak first-seen cohort, true bar timing, setup provenance, no late alert or phantom order');
