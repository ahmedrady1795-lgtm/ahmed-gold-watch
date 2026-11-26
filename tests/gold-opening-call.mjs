import assert from 'node:assert/strict';
import {nextGoldOpeningCall,validOpeningCall} from '../lib/gold-opening-call.ts';
const open=Date.parse('2026-11-25T07:00:00Z'), issued=open-12000;
const m=60000;
const bars=Array.from({length:20},(_,i)=>{
 const price=3500+i*.18;
 return {time:open-(21-i)*m,open:price,high:price+.29,low:price-.1,close:price+.18};
});
const flip=b=>({...b,open:7000-b.open,high:7000-b.low,low:7000-b.high,close:7000-b.close});
for(const buy of [true,false]){
 const rows=buy?bars:bars.map(flip);
 const chart={fresh:true,candleSource:'Biquote · MT5 XAUUSD candles',chartCandles:rows};
 const q={ok:true,fetchedAt:issued,sourceTime:issued-300,source:'Biquote · MT5 XAUUSD',status:'live',price:rows.at(-1).close};
 const prior={...q,price:q.price+(buy?-.02:.02),sourceTime:issued-5000,fetchedAt:issued-5000};
 const call=nextGoldOpeningCall(null,issued,chart,q,[prior]);
 assert.equal(nextGoldOpeningCall(null,issued,chart,q),null,'no momentum forecast on a single quote');
 const adverse={...prior,price:q.price+(buy?.10:-.10)};
 assert.equal(nextGoldOpeningCall(null,issued,chart,q,[adverse]),null,'live reversal vetoes closed momentum');
 assert.equal(nextGoldOpeningCall(null,issued,chart,q,[{...prior,source:'foreign'}]),null);
 assert.equal(nextGoldOpeningCall(null,issued,chart,q,[{...prior,sourceTime:issued-20000,fetchedAt:issued-20000}]),null);
 const tooEarly=open-25000;
 assert.equal(nextGoldOpeningCall(null,tooEarly,chart,{...q,sourceTime:tooEarly-300,fetchedAt:tooEarly}),null,'reserve early window for a genuine setup');
 assert.equal(call?.side,buy?'BUY':'SELL');
 const opposite=buy?'SELL':'BUY';
 const flow={asOf:issued-2000,sources:['Bybit XAUUSDT perpetual','Binance PAXG/USDT proxy'],
   state:opposite,strongSide:opposite};
 assert.equal(nextGoldOpeningCall(null,issued,chart,q,[prior],flow),null,'fresh two-source disagreement vetoes');
 assert.equal(nextGoldOpeningCall(null,issued,chart,q,[prior],{...flow,state:'CONFLICT',strongSide:'WAIT'}),null);
 assert.equal(nextGoldOpeningCall(null,issued,chart,q,[prior],{...flow,asOf:issued-20000})?.side,call.side,'stale flow does not veto');
 assert.equal(nextGoldOpeningCall(null,issued,chart,q,[prior],{...flow,sources:[flow.sources[0]]})?.side,call.side,'one proxy cannot veto');
 assert.equal(nextGoldOpeningCall(call,issued+1,chart,q,[prior],flow),call,'already issued forecast remains immutable');
 assert.equal(nextGoldOpeningCall(null,issued,chart,q,[prior],null,true),null,'live momentum requires independently supported flow');
 assert.equal(nextGoldOpeningCall(null,issued,chart,q,[prior],{...flow,state:call.side,strongSide:call.side},true)?.side,call.side);
 assert.equal(nextGoldOpeningCall(null,issued,chart,q,[prior],{...flow,state:call.side,strongSide:call.side,sources:[flow.sources[0]]},true),null);
 assert.equal(nextGoldOpeningCall(null,issued,chart,q,[prior],{...flow,state:call.side,strongSide:call.side,asOf:issued-20000},true),null);
 assert.equal(nextGoldOpeningCall(call,issued+1,chart,q,[prior],flow,true),call,'live guard never rewrites earlier forecasts');
 assert.equal(call.target,open);
 assert.equal(call.issued,issued);
 assert.ok(validOpeningCall(call,open));
 assert.equal(nextGoldOpeningCall(call,issued+1,chart,{...q,price:3500}),call);
 assert.equal(nextGoldOpeningCall(null,open+200,chart,q),null);
 assert.equal(nextGoldOpeningCall(null,issued,chart,{...q,source:'unrelated'}),null);
 assert.equal(nextGoldOpeningCall(null,issued,chart,{...q,sourceTime:issued-20000}),null);
 assert.equal(nextGoldOpeningCall(null,issued,chart,{...q,sourceTime:issued+1}),null);
 const future={time:open,open:3500,high:4000,low:3000,close:buy?3001:3999};
 assert.deepEqual(nextGoldOpeningCall(null,issued,{...chart,chartCandles:[...rows,future]},q,[prior]),call);
 assert.equal(validOpeningCall({...call,issued:open},open+1),false);
 assert.equal(validOpeningCall(call,open+300000),false);
}
console.log('PASS: pre-open BUY/SELL, frozen side and issue time, no late/backfilled or future-data forecast');

 // A pre-existing swing target and compressed range, before the next M5 opens.
 const at=open-25000,start=open-60000;
 const coil=Array.from({length:80},(_,i)=>{
   const level=4200+Math.sin(i*.6)*.4;
   return {time:start-(80-i)*m,open:level,high:level+.4,low:level-.4,close:level+.05};
 });
 coil[15]={...coil[15],open:4202,high:4204,low:4201,close:4202};
 for(let i=72;i<80;i++){
   const j=i-72,low=4199.8+j*.06,close=4200.1+j*.085;
   coil[i]={time:coil[i].time,open:close-.05,low,high:4200.85,close};
 }
 const mirror=b=>({...b,open:8400-b.open,close:8400-b.close,high:8400-b.low,low:8400-b.high});
 for(const buy of [true,false]){
   const price=buy?4200.7:4199.3;
   const chart={fresh:true,candleSource:'Biquote · MT5 XAUUSD candles',chartCandles:buy?coil:coil.map(mirror)};
   const q={ok:true,status:'live',source:'Biquote · MT5 XAUUSD',price,bid:price-.05,ask:price+.05,sourceTime:at-1000,fetchedAt:at};
   const previousPrice=price+(buy?-.14:.14);
   const prior={...q,price:previousPrice,bid:previousPrice-.05,ask:previousPrice+.05,
     sourceTime:at-5000,fetchedAt:at-5000};
   assert.equal(nextGoldOpeningCall(null,at,chart,q),null,'a coil alone stays conditional');
   assert.equal(nextGoldOpeningCall(null,at,chart,q,[{...q,sourceTime:at-5000}]),null,'flat quotes cannot confirm pressure');
   assert.equal(nextGoldOpeningCall(null,at,chart,q,[{...prior,source:'other'}]),null);
   const call=nextGoldOpeningCall(null,at,chart,q,[prior]);
   assert.equal(call?.side,buy?'BUY':'SELL');
   assert.match(call.reason,/تحضير قبل الكسر/);
   const weakOpposite={asOf:at-1000,sources:['Bybit XAUUSDT perpetual','OKX XAUUSDT perpetual'],
     state:buy?'SELL':'BUY',strongSide:'WAIT'};
   assert.equal(nextGoldOpeningCall(null,at,chart,q,[prior],weakOpposite,true),null,
     'opposing two-source flow must not publish a compression forecast');
   assert.equal(nextGoldOpeningCall(null,at,chart,q,[prior],weakOpposite)?.side,call.side,
     'research forecast remains available for unbiased comparison');

   assert.equal(call.issued,at);
   assert.equal(call.target,open);
   assert.equal(nextGoldOpeningCall(call,at+1000,chart,{...q,price:price+(buy?-2:2)}),call);
   const crossed=price+(buy?.6:-.6);
   const later=nextGoldOpeningCall(null,at,chart,{...q,price:crossed,bid:crossed-.05,ask:crossed+.05});
   assert.ok(!later||!later.reason.startsWith('تحضير قبل الكسر'),'already crossed must not be called pre-break');
 }
 console.log('PASS: pre-break preparation is preferred for both frozen M5 directions');

// Frozen 18:49:46 UTC observation, replayed with a favorable prior tick
// to isolate the late-chase guard. No target-candle data enters the test.
const sampleAt=1795632586533;
const sample=[[3534.02, 3540.38, 3533.05, 3540.38], [3540.3, 3541.32, 3536.44, 3536.52], [3536.15, 3538.58, 3535.53, 3536.39], [3536.52, 3536.68, 3531.69, 3531.78], [3532.02, 3532.19, 3529.8, 3531.57], [3531.26, 3534.66, 3530.06, 3530.06], [3529.84, 3530.76, 3528.55, 3530.05], [3529.77, 3532.53, 3527.91, 3532.11], [3532.82, 3534.35, 3530.42, 3531.75], [3531.89, 3533.4, 3531.23, 3531.75], [3531.75, 3532.68, 3526.9, 3528.04], [3527.85, 3530.09, 3526.57, 3529.08], [3529.2, 3532.27, 3527.92, 3530.72], [3530.81, 3534.02, 3530.81, 3533.28], [3533.32, 3536.48, 3533.23, 3536.28], [3536.4, 3541, 3536.14, 3539.67], [3539.68, 3545.73, 3539.68, 3545.25], [3545.3, 3546.42, 3543.46, 3545.1], [3545.02, 3547.99, 3543.8, 3547.56], [3547.21, 3549.86, 3546.17, 3549.86]].map(([open,high,low,close],i)=>({
  time:1795631340000+i*60000,open,high,low,close
}));
for(const buy of [true,false]){
 const chart={fresh:true,candleSource:'Deriv · XAUUSD',chartCandles:buy?sample:sample.map(flip)};
 const price=buy?3549.63:7000-3549.63;
 const quote={ok:true,source:'Deriv · XAUUSD',status:'live',price,bid:price-.3,ask:price+.3,
   sourceTime:sampleAt-533,fetchedAt:sampleAt};
 const priorPrice=price+(buy?-1:1);
 const prior={...quote,price:priorPrice,bid:priorPrice-.3,ask:priorPrice+.3,sourceTime:sampleAt-5000,fetchedAt:sampleAt-5000};
 assert.equal(nextGoldOpeningCall(null,sampleAt,chart,quote,[prior]),null,'extended move without a reset');
}

const {mergeOpeningAudit,openingScore}=await import('../lib/gold-opening-audit.ts');
const oldCall={target:open,issued,side:'SELL',reason:'تحضير قبل الكسر',priceAt:3500,
 source:'Deriv · XAUUSD',quoteSource:'Deriv · XAUUSD',quoteAt:issued};
const pending={call:oldCall,outcome:'PENDING'};
const end=open+300001,hit={...pending,outcome:'HIT',open:3500,close:3499,settledAt:end};
const restored=mergeOpeningAudit(end,[pending],[hit],[pending]);
assert.deepEqual(restored,[hit]);
assert.equal(openingScore(restored).hits,1);
assert.deepEqual(mergeOpeningAudit(end,[pending],[{...hit,close:3501}]),[pending]);
assert.deepEqual(mergeOpeningAudit(end,[pending],[{...hit,call:{...oldCall,issued:issued+1}}]),[pending]);
assert.equal(mergeOpeningAudit(end-1,[hit]).length,0);


// Unified liquidity: a tiny token sample must not outweigh a populated
// perpetual tape; a richer duplicate must retain its 60-second history.
const {combineGoldLiquidity}=await import('../lib/gold-liquidity-meter.ts');
const atFlow=issued-1000;
const perpSource='Bybit XAUUSDT perpetual',tokenSource='Binance PAXG/USDT proxy';
const packet=(source,count,delta)=>({source,count,tradeDeltaPct:delta,side:delta>0?'BUY':'SELL',
  observedAt:issued,tradeAt:atFlow});
const robust=packet(perpSource,30,-60),thin=packet(tokenSource,3,100);
const weighted=combineGoldLiquidity(robust,thin,issued,true);
assert.equal(weighted.buyPct,26);
assert.equal(weighted.sellPct,74);
assert.equal(weighted.state,'SELL','three prints cannot establish cross-venue conflict');
assert.equal(weighted.strongSide,'WAIT','a thin source is not independent strong confirmation');
const stable={...robust,executionHistory:{source:perpSource,asOf:atFlow,count:40,spanSeconds:45,buy60s:50,sell60s:50}};
const dedup=combineGoldLiquidity({...stable,venueSamples:[robust]},null,issued,true);
assert.equal(dedup.sources.length,1);
assert.equal(dedup.stableSources,1);
assert.equal(dedup.buyPct,44);
assert.equal(combineGoldLiquidity(robust,thin,issued+20000,true).buyPct,null);
assert.equal(combineGoldLiquidity(robust,packet(tokenSource,30,100),issued,true).state,'CONFLICT');
console.log('PASS: normalized live liquidity weights, thin-tape guard, richer duplicate and stale exclusion');


// A slow independent exchange cannot block the first available fresh tape.
const {independentFlowSlot,collectIndependentFlow}=await import('../lib/gold-flow-history.ts');
let resolveSlow;
const slowPromise=new Promise(resolve=>{resolveSlow=resolve;});
let fastCalls=0,slowCalls=0;
const freshSlot=(v,now)=>v.at<=now&&now-v.at<=10000;
const fastSlot=independentFlowSlot(async()=>{fastCalls++;return {name:'fast',at:Date.now()};},freshSlot,60000);
const slowSlot=independentFlowSlot(async()=>{slowCalls++;return slowPromise;},freshSlot,60000);
const pendingSlots=[fastSlot,slowSlot];
const result=await Promise.race([collectIndependentFlow(pendingSlots),
 new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('slow exchange blocked fast tape')),500);t.unref();})]);
assert.equal(result[0]?.name,'fast');
assert.equal(result[1],null);
assert.equal(fastCalls,1);
assert.equal(slowCalls,1);
assert.equal((await collectIndependentFlow(pendingSlots))[0]?.name,'fast');
assert.equal(fastCalls,1,'polls share bounded requests');
const waiting=slowSlot.refresh(Date.now());
resolveSlow({name:'slow',at:Date.now()});
await waiting;
assert.equal((await collectIndependentFlow(pendingSlots))[1]?.name,'slow');
assert.equal(fastSlot.read(Date.now()+11000),null,'no stale source is presented as live');
assert.equal(slowSlot.read(Date.now()+11000),null);
console.log('PASS: independent venue refresh latency, deduplication, recovery and strict expiry');


// Exact opening cutoff: a rejected second test of a mature extreme must
// produce the opposite next-M5 forecast only with independent fresh flow.
const {GOLD_OPENING_VERSION}=await import('../lib/gold-opening-call.ts');
const reversalAt=open-25000;
const reversalBars=Array.from({length:10},(_,i)=>{
 const price=3500+i*.3;
 return {time:open-(11-i)*m,open:price,high:price+.4,low:price-.2,close:price+.2};
});
reversalBars[9]={...reversalBars[9],open:3502.5,high:3502.73,low:3501.9,close:3502.05};
for(const up of [true,false]){
 const rows=up?reversalBars:reversalBars.map(flip);
 const side=up?'SELL':'BUY';
 const price=rows[9].close;
 const priorPrice=price+(up?.10:-.10);
 const chart={fresh:true,candleSource:'Biquote · MT5 XAUUSD candles',chartCandles:rows};
 const q={ok:true,status:'live',source:'Biquote · MT5 XAUUSD',price,bid:price-.02,ask:price+.02,sourceTime:reversalAt-300,fetchedAt:reversalAt};
 const prior={...q,price:priorPrice,bid:priorPrice-.02,ask:priorPrice+.02,sourceTime:reversalAt-5000,fetchedAt:reversalAt-5000};
 const flow={asOf:reversalAt-500,sources:['Bybit XAUUSDT perpetual','OKX XAUUSDT perpetual'],state:side,strongSide:side};
 const call=nextGoldOpeningCall(null,reversalAt,chart,q,[prior],flow,true);
 assert.equal(call?.side,side);
 assert.equal(call.version,GOLD_OPENING_VERSION);
 assert.equal(call.target,open);
 assert.equal(call.issued,reversalAt);
 assert.match(call.reason,/انعكاس عند نهاية الموجة/);
 assert.equal(nextGoldOpeningCall(null,reversalAt,chart,q,[prior],null,true),null);
 assert.equal(nextGoldOpeningCall(null,reversalAt,chart,q,[prior],{...flow,asOf:reversalAt-20000},true),null);
 assert.equal(nextGoldOpeningCall(null,reversalAt,chart,q,[prior],{...flow,sources:[flow.sources[0]]},true),null);
 assert.equal(nextGoldOpeningCall(null,reversalAt,chart,q,[prior],{...flow,state:'CONFLICT',strongSide:'WAIT'},true),null);
 assert.equal(nextGoldOpeningCall(call,reversalAt+500,chart,q,[],null,true),call);
 assert.deepEqual(nextGoldOpeningCall(null,reversalAt,{...chart,chartCandles:[...rows,{time:open,open:3500,high:4000,low:3000,close:3999}]},q,[prior],flow,true),call);
}
console.log('PASS: V2 opening reversal at failed extreme with two fresh agreeing proxy venues, no future bars or late change');

const {settleOpeningAudit}=await import('../lib/gold-opening-audit.ts');
const futureBars=Array.from({length:5},(_,i)=>({time:open+i*m,open:3500-i*.1,close:3499.9-i*.1,high:3500.2-i*.1,low:3499.7-i*.1}));
assert.equal(settleOpeningAudit([pending],open+3000,oldCall.source,futureBars)[0].outcome,'PENDING');
assert.equal(settleOpeningAudit([pending],open+303000,oldCall.source,futureBars)[0].outcome,'HIT');
assert.equal(settleOpeningAudit([pending],open+303000,'foreign',futureBars)[0].outcome,'PENDING');
assert.equal(settleOpeningAudit([pending],open+900000,oldCall.source,futureBars.slice(1))[0].outcome,'UNKNOWN');
console.log('PASS: withheld research uses identical future-only settlement; stale or missing data is not a win');


// V4: trend versus pullback, no future candle leakage or gap inference.
const {goldOpeningRegime}=await import('../lib/gold-opening-call.ts');
const regimeAt=open-25000;
const trending=Array.from({length:16},(_,i)=>{
 const p=i<12?3500+i*.4:3504.4-(i-11)*.2;
 return {time:open-(17-i)*m,open:p,high:p+.24,low:p-.24,close:p+(i<12?.12:-.12)};
});
assert.equal(goldOpeningRegime(trending,regimeAt).regime,'PULLBACK_UP');
assert.equal(goldOpeningRegime(trending.map(flip),regimeAt).regime,'PULLBACK_DOWN');
assert.deepEqual(goldOpeningRegime([...trending,{time:open,open:3500,high:4000,low:3000,close:3900}],regimeAt),goldOpeningRegime(trending,regimeAt));
assert.equal(goldOpeningRegime(trending.filter((_,i)=>i!==8),regimeAt).regime,'UNKNOWN');
const {openingAdaptiveChoice,openingRegimeReport}=await import('../lib/gold-opening-audit.ts');
const priorRows=Array.from({length:45},(_,i)=>{
 const target=open-(46-i)*300000;
 return {call:{...oldCall,target,issued:target-10000,quoteAt:target-11000,evidence:{
   regime:'PULLBACK_UP',baseline:'BUY',ml:'BUY',neural:'WAIT',flow:'WAIT',
   flowSources:0,flowState:'UNAVAILABLE',quoteAgeMs:1000,recordedAt:target-9000,adaptive:'WAIT',adaptiveModel:'COLLECTING'
 }},outcome:'MISS',open:3500,close:3501,settledAt:target+303000};
});
const currentEvidence={baseline:'BUY',ml:'BUY',neural:'WAIT',flow:'WAIT'};
assert.equal(openingAdaptiveChoice(priorRows.slice(0,10),oldCall.source,'PULLBACK_UP',issued,currentEvidence).adaptive,'WAIT');
assert.equal(openingAdaptiveChoice(priorRows,oldCall.source,'PULLBACK_UP',issued,currentEvidence).adaptive,'BUY');
assert.equal(openingAdaptiveChoice(priorRows,oldCall.source,'TREND_UP',issued,currentEvidence).adaptive,'WAIT');
assert.equal(openingAdaptiveChoice(priorRows.map(r=>({...r,settledAt:open+300000})),oldCall.source,'PULLBACK_UP',issued,currentEvidence).adaptive,'WAIT');
const report=openingRegimeReport(priorRows)[0];
assert.equal(report.paired.find(p=>p.model==='baseline').modelHits,45);
assert.equal(report.paired.find(p=>p.model==='baseline').originalHits,0);
assert.equal(report.lossContext.noStrongFlow,45);
console.log('PASS: V4 causal market regime, paired adaptive research, source/regime segregation and past-only selection');
