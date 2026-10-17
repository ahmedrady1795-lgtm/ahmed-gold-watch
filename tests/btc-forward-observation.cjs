const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const exports_={};vm.runInNewContext(ts.transpileModule(
  fs.readFileSync('lib/btc-forward-observation.ts','utf8'),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
  }).outputText,{exports:exports_});
const observe=exports_.assessBtcForwardObservation;
const now=Date.parse('2026-10-17T10:02:00Z');
const h=(side,confidence=67,gateReason='PASSED')=>({
 side,confidence,gateReason,independentFamilies:4,
 learning:{recentKill:false,quality:'COLLECTING'}
});
const base={now,modelAt:now-7000,priceFresh:true,historyFresh:true,
 observationFresh:true,horizons:{oneMinute:h('BUY'),fiveMinute:h('BUY',73)},
 zone:{path:{side:'SELL'}}};
let x=observe(base);
assert.equal(x.status,'ALIGNED_WATCH','technicals should not disappear behind WAIT trade gate');
assert.equal(x.side,'BUY');
assert.equal(x.m1,'BUY');assert.equal(x.m5,'BUY');
assert.equal(x.legacySide,'SELL');
assert.equal(x.conflict,true,'bearish legacy target conflicts with bullish two-horizon outlook');
assert.match(x.reason,/مسار الأهداف القديم/);
assert.equal(x.modelQualified,false,'learning not certified by a technical agreement');
assert.equal(x.entryQualified,false,'no broker trade ever qualifies here');
assert.doesNotMatch(x.reason,/\d+%.*احتمال/,'avoid uncalibrated win probabilities');
x=observe({...base,horizons:{oneMinute:h('SELL'),fiveMinute:h('BUY',73)}});
assert.equal(x.status,'CONFLICT');assert.equal(x.side,'WAIT');
x=observe({...base,horizons:{oneMinute:h('WAIT'),fiveMinute:h('SELL',73)}});
assert.equal(x.status,'M5_WATCH');assert.equal(x.side,'SELL');
x=observe({...base,horizons:{oneMinute:{...h('BUY'),learning:{recentKill:true}},
 fiveMinute:h('BUY')}});
assert.equal(x.status,'M5_WATCH','M1 recent losing streak is not bypassed');
assert.equal(x.m1,'WAIT','performance kill must not be recast as active buy');
x=observe({...base,horizons:{oneMinute:h('BUY',67,'FLOW_CONFLICT'),
 fiveMinute:h('BUY',73)}});
assert.equal(x.m1,'WAIT','flow-opposed horizon cannot support alignment');
x=observe({...base,horizons:{oneMinute:{...h('BUY'),independentFamilies:1},
 fiveMinute:h('BUY',73)}});
assert.equal(x.status,'M5_WATCH','insufficient independent evidence cannot vote');
for(const patch of [{priceFresh:false},{historyFresh:false},{observationFresh:false},
 {modelAt:now-100000},{modelAt:now+10000},{modelAt:0}]){
 x=observe({...base,...patch});
 assert.equal(x.status,'STALE');
 assert.equal(x.side,'WAIT');
}
x=observe({...base,horizons:{},zone:{}});
assert.equal(x.status,'SCANNING');
assert.equal(x.side,'WAIT','missing model output must not hallucinate analysis');
const chart=fs.readFileSync('components/ForecastIllustration.tsx','utf8'),
 server=fs.readFileSync('app/api/ai-analysis/route.ts','utf8');
assert.match(server,/horizonBrains:movement\?\.horizons/,'model publishes technical frames to client');
assert.match(server,/forecastConflictPath:hunt\?\.zoneForecast/,'model exposes opposing route');
assert.match(chart,/assessBtcForwardObservation\(/,'market chart consumes independent analysis');
assert.match(chart,/btcOutlook\.horizonSummary/,'technical M1 and M5 visibility');
assert.match(chart,/stateLabel=feedProblem\?\?\(btcOutlook/,'technical analysis precedes generic WAIT');
assert.match(chart,/\bstatusReady=m\.ready&&auditHealthy/,'qualified signal gate untouched');
console.log('PASS: visible BTC M1/M5 technical outlook, old path conflict, OOS veto, stale safeguards, no trades');
