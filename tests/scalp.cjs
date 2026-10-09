const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const modules={};
function load(file){
  file=path.resolve(file);if(modules[file])return modules[file];
  const exports={};modules[file]=exports;
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,{exports,require:name=>name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):require(name),globalThis:{},console});
  return exports;
}
const {buildScalpPlans}=load('lib/scalp-opportunities.ts');
const {selectGoldM5Breakout,observedForwardReach,frozenTrendIsValid}=load('lib/scalp-selection.ts');
const trendBars=Array.from({length:210},(_,i)=>({
  time:Date.parse('2026-10-07T00:00:00Z')+i*60000,
  open:100+i*.10,close:100+(i+1)*.10,
  high:100+(i+1)*.10+.05,low:100+i*.10-.05
}));
const fwdBuy=observedForwardReach(trendBars,'BUY',5);
assert.ok(fwdBuy.samples>=30,'5-minute sample must have at least 30 non-overlapping completed windows');
assert.ok(Math.abs(fwdBuy.favorableP75-.55)<.001,
  'M5 target reach must measure NEXT five M1 highs after previous close');
assert.ok(Math.abs(fwdBuy.adverseP50-.05)<.001,
  'Historical adverse excursion must start from the same reference entry');
const fwdSell=observedForwardReach(trendBars.map(c=>({
  ...c,open:200-c.open,close:200-c.close,
  high:200-c.low,low:200-c.high
})),'SELL',5);
assert.ok(Math.abs(fwdSell.favorableP75-fwdBuy.favorableP75)<.000001,
  'BUY and SELL forward-window geometry must be symmetric');
const brokenBars=trendBars.map(c=>({...c}));
brokenBars[brokenBars.length-9].time+=60000;
assert.ok(observedForwardReach(brokenBars,'BUY',5).samples<fwdBuy.samples,
  'Gapped closed M1 bars may not be treated as uninterrupted forward windows');
assert.equal(frozenTrendIsValid('BUY','BREAKOUT','BUY','SELL'),false,
  'A BUY frozen candidate cannot survive an opposing CURRENT M5 trend');
assert.equal(frozenTrendIsValid('SELL','CONTINUATION','BUY','SELL'),false,
  'An M1 reversal cancels a frozen M5 continuation');
assert.equal(frozenTrendIsValid('SELL','BREAKOUT','SELL','SELL'),true,
  'A genuinely aligned, still-valid sell may remain frozen for confirmation');
console.log('PASS: causal BUY/SELL forward reach, price gaps, and M1/M5 frozen-trend invalidation');
// Breakout selection tests are synthetic, not a profitable backtest.
// Gold M5 BUY/SELL now plan an ENTRY near the old boundary (limit retest),
// place the SL beyond the real completed breakout candle, and reject wick traps.
const strongBuy=selectGoldM5Breakout({
  side:'BUY',boundary:100,open:99.9,high:100.9,low:99.3,close:100.8,
  atr1:1,roundTripCost:.2
});
assert.equal(strongBuy.blockers.length,0);
assert.ok(strongBuy.entry>100&&strongBuy.entry<100.8,
  'BUY breakout must use boundary retest, never chase impulse close');
assert.ok(strongBuy.stop<99.3,
  'BUY stop must be beyond confirmed breakout candle LOW');
const strongSell=selectGoldM5Breakout({
  side:'SELL',boundary:100,open:100.1,high:100.7,low:99.2,close:99.25,
  atr1:1,roundTripCost:.2
});
assert.equal(strongSell.blockers.length,0);
assert.ok(strongSell.entry<100&&strongSell.entry>99.25,
  'SELL retest price must be between breakout boundary and close');
assert.ok(strongSell.stop>100.7,'SELL stop beyond completed breakout HIGH');
const wickTrap=selectGoldM5Breakout({
  side:'BUY',boundary:100,open:99.95,high:101.5,low:99.6,close:100.4,
  atr1:1,roundTripCost:.2
});
assert.ok(wickTrap.blockers.some(x=>x.includes('ذيل رفض')),
  'Large rejection wick must invalidate the high momentum score');
const weakClose=selectGoldM5Breakout({
  side:'BUY',boundary:100,open:99.8,high:100.1,low:99.4,close:100.01,
  atr1:1,roundTripCost:.2
});
assert.ok(weakClose.blockers.some(x=>x.includes('غير حاسم')));
const overextended=selectGoldM5Breakout({
  side:'SELL',boundary:100,open:99.9,high:100,low:98.5,close:98.7,
  atr1:1,roundTripCost:.2
});
assert.ok(overextended.blockers.some(x=>x.includes('ممتدة')),
  'Overextended sell impulse must not authorize an immediate chase');
assert.ok(selectGoldM5Breakout({
  side:'BUY',boundary:100,open:100,high:NaN,low:99,close:100.2,
  atr1:1,roundTripCost:.2
}).blockers.length>0,'Missing candle data fails closed');
console.log('PASS: BUY/SELL breakout limit retest, structural stops, wick rejection, fake breakout and exhaustion filters');
const {advancePaperTrade,updateScalpLedger,evaluatePaperProof,SCALP_PROOF_FROM}=load('lib/scalp-paper-ledger.ts');
const {mergeBtcCandles}=load('lib/btc-market.ts');
const {ingestLiveCandle,completedLiveCandles}=load('lib/live-candles.ts');
const now=Date.parse('2026-10-08T01:30:00Z');
const refreshed=mergeBtcCandles([{time:2,close:100},{time:1,close:90},{time:2,close:105}]);
assert.equal(refreshed.length,2);assert.equal(refreshed[0].time,1);assert.equal(refreshed[1].close,105,'Latest provider OHLC must override a cached unfinished candle');
const live={lastAt:0,bars:[]};
for(let t=now+50000;t<=now+180000;t+=5000)ingestLiveCandle(live,t,100+(t-now)/60000);
const observed=completedLiveCandles(live,now+180000);
assert.equal(observed.length,2);assert.equal(observed[0].time,now+60000,'Initial partial minute cannot be treated as a complete candle');
const disconnected={lastAt:0,bars:[]};
ingestLiveCandle(disconnected,now+55000,100);ingestLiveCandle(disconnected,now+60000,101);ingestLiveCandle(disconnected,now+115000,103);
assert.equal(completedLiveCandles(disconnected,now+120000).length,0,'A stream gap invalidates the minute');
const series=(ms)=>Array.from({length:240},(_,i)=>({time:now-(240-i)*ms,open:4000,high:4000.4,low:3999.6,close:4000}));
function input(){return {asset:'GOLD',c1:series(60000),c5:series(300000),quote:{price:4000.45,at:now,bid:4000.44,ask:4000.455,source:'Biquote'},candleSource:'Biquote XAUUSD',now,events:[],newsReady:true,marketOpen:true,feeBps:0,slippageBps:0};}
function breakout(){const x=input();x.c1[x.c1.length-1]={time:now-60000,open:4000,high:4000.55,low:3999.9,close:4000.45};return x;}
const {readScalpLiquidity,observeScalpPlanHold}=load('lib/scalp-liquidity.ts');
const liquidityInput=input();
const liquid=readScalpLiquidity(liquidityInput.c1,{...liquidityInput.quote,price:4000},now);
for(const frame of liquid.scenarios){for(const path of frame.paths){
 const dir=path.side==='BUY'?1:-1;
 assert.equal(path.targets.length,3);
 assert.ok(dir*(path.targets[0].price-4000)>0);
 assert.ok(dir*(path.targets[1].price-path.targets[0].price)>0);
 assert.ok(dir*(path.targets[2].price-path.targets[1].price)>0);
 assert.ok(dir*(path.trigger-path.invalidation)>0);
}}
assert.equal(liquid.scenarios.length,2,'Both M1 and M5 need conditional movement targets');
assert.equal(liquid.available,true);assert.ok(liquid.levels.some(l=>l.side==='ABOVE'));assert.ok(liquid.levels.some(l=>l.side==='BELOW'));
assert.equal(readScalpLiquidity(liquidityInput.c1,{...liquidityInput.quote,at:now-16000},now).available,false);
const sweepRows=series(60000);sweepRows[sweepRows.length-1]={time:now-60000,open:4000,high:4001,low:3999.8,close:4000.1};
assert.equal(readScalpLiquidity(sweepRows,liquidityInput.quote,now).sweeps.at(-1).side,'SELL');
const withPartial=[...liquidityInput.c1,{time:now,open:4000,high:5000,low:3000,close:4000}];
assert.equal(readScalpLiquidity(withPartial,liquidityInput.quote,now).rangeHigh,4000.4);
const gapRows=series(60000);gapRows.splice(-4,1);assert.equal(readScalpLiquidity(gapRows,liquidityInput.quote,now).available,false);
console.log('PASS: liquidity map, confirmed sweep, stale price, incomplete candles and data gaps');
// Regression: An honestly confirmed breakout may wait for a near-entry retest
// rather than attempting to market-chase a target with only ~0.05R fee headroom.
// No plan is authorized by scenario-only watches or an unconfirmed candle.
const fixedHoldId='CONFIRMED_RETEST_TEST';
const sourceBars=series(60000);
const hold=(bars,price,at,id=fixedHoldId,nowAt=at)=>
  observeScalpPlanHold('GOLD',5,'BUY',id,4000.7,3999.0,now+180000,
    bars,{price,at,source:'fresh-fixture'},nowAt,30);
assert.equal(hold(sourceBars,4000.9,now).state,'WATCH');
const confirmedBars=[...sourceBars,{time:now,open:4000.86,high:4001.2,low:4000.8,close:4001.07}];
assert.equal(hold(confirmedBars,4001.08,now+61000).state,'CONFIRMED',
  'An entire closed minute beyond the immutable plan trigger is real evidence');
assert.equal(hold(confirmedBars,4000.65,now+65000).state,'RETEST_READY',
  'Post-confirmation near-entry limit retest should remain valid for paper review');
assert.equal(hold(confirmedBars,3998.9,now+66000).state,'WATCH',
  'Breaking the exact stop invalidates a confirmed retest');
assert.equal(hold(sourceBars,4000.9,now,'STALE_RETEST_TEST').state,'WATCH');
assert.equal(hold(confirmedBars,4001.08,now+61000,'STALE_RETEST_TEST').state,'CONFIRMED');
assert.equal(hold(confirmedBars,4000.65,now+65000,'STALE_RETEST_TEST',now+90000).state,'WATCH',
  'A stale quote must never release a previously confirmed retest');
console.log('PASS: real M1 confirmation unlocks a 45-second retest; stale quotes and stop breaks revoke it.');

const plans=buildScalpPlans(breakout());
const m5BreakoutPlan=plans.find(p=>p.horizon===5);
assert.equal(m5BreakoutPlan.setup,'BREAKOUT',
  'Fixture must exercise real GOLD M5 selection, not just the pure helper');
assert.ok(m5BreakoutPlan.entry>4000.4&&m5BreakoutPlan.entry<4000.55,
  'M5 trading level should be close to the prior range HIGH, not above breakout wick');
assert.ok(m5BreakoutPlan.stop<3999.9,
  'Integrated GOLD M5 stop must be beyond the last CLOSED M1 breakout candle low');
assert.ok(m5BreakoutPlan.evidence.some(e=>e.label==='وقف خلف شمعة الاختراق'),
  'UI evidence must explain structural stop rather than high setup score');
const buy=plans[0];assert.equal(buy.side,'BUY');assert.ok(['ARMED','WATCH'].includes(buy.status),'Conservative eligibility guards can block an otherwise valid directional setup');
assert.ok(buy.entry>4000.45);assert.ok(buy.stop<buy.entry);assert.ok(buy.targets[0].price>buy.entry);assert.ok(buy.targets[1].price>buy.targets[0].price);assert.ok(buy.targets[2].price>buy.targets[1].price);assert.ok(buy.netRR>=1.25);
const reflected=breakout();reflected.c1=reflected.c1.map(c=>({...c,open:8000-c.open,close:8000-c.close,high:8000-c.low,low:8000-c.high}));reflected.quote={...reflected.quote,price:3999.55,bid:3999.54,ask:3999.555};
const sell=buildScalpPlans(reflected)[0];assert.equal(sell.side,'SELL');assert.ok(sell.stop>sell.entry);assert.ok(sell.targets[2].price<sell.targets[1].price&&sell.targets[1].price<sell.targets[0].price);
assert.equal(buildScalpPlans(input())[0].side,'WAIT','Flat market must not invent an opportunity');
for(const change of [x=>x.quote.at=now-16000,x=>x.quote.price=null,x=>x.marketOpen=false,x=>x.candleSource='COMEX GC=F proxy',x=>x.c1.splice(-5,1),x=>x.c1.push({...x.c1.at(-1),time:now+60000}),x=>x.c1.at(-1).high=NaN,x=>x.events=[{importance:3,exactTime:true,time:now+60000,name:'CPI'}]]){
 const x=breakout();change(x);assert.equal(buildScalpPlans(x)[0].status,'BLOCKED');
}
const forming=breakout();forming.c1.push({time:now,open:4000.45,high:4010,low:3990,close:4009});assert.equal(buildScalpPlans(forming)[0].id,buy.id,'Unclosed candles cannot alter the setup');
const fees=breakout();fees.feeBps=100;assert.equal(buildScalpPlans(fees)[0].status,'WATCH','Large costs must block entry');
const unknownNews=breakout();unknownNews.newsReady=false;assert.equal(buildScalpPlans(unknownNews)[0].status,'WATCH');
function trade(){return {plan:{...buy,entry:100,stop:99,targets:[{price:102,kind:'STRUCTURE'}],cost:.1,expiresAt:now+45000},state:'ARMED',activatedAt:null,closedAt:null,exit:null,netR:null,lastAt:now,lastPrice:99.9,note:''};}
const quote=(price,at)=>({price,at,source:'fixture'});
const activated=advancePaperTrade(trade(),quote(100.1,now+1000),now+1000,[]);assert.equal(activated.state,'ACTIVE');assert.equal(activated.plan.targets[0].price,102);
const winner=advancePaperTrade(activated,quote(102.1,now+2000),now+2000,[]);assert.equal(winner.state,'TP1');assert.equal(winner.netR,1.727);
const loser=advancePaperTrade(activated,quote(98.8,now+2000),now+2000,[]);assert.equal(loser.state,'STOP');assert.ok(loser.netR<-1,'Stop slippage must worsen the result');
assert.equal(advancePaperTrade(trade(),quote(100.1,now+46000),now+46000,[]).state,'EXPIRED','Cannot activate after the deadline');
assert.equal(advancePaperTrade(trade(),quote(98.9,now+1000),now+1000,[]).state,'CANCELED');
assert.equal(advancePaperTrade(trade(),quote(100.7,now+1000),now+1000,[]).state,'CANCELED','Do not assume a fill after a gap past the trigger');
assert.equal(advancePaperTrade(activated,quote(102.1,now+40000),now+40000,[]).state,'UNKNOWN','Missed monitoring must not manufacture wins');
assert.equal(advancePaperTrade(activated,quote(102.1,now+2000),now+30000,[]).state,'ACTIVE','Stale quotes cannot settle');
const ambiguous={...activated,activatedAt:now,lastAt:now,lastPrice:100};const bar={time:now,open:100,close:101,high:103,low:98};
assert.equal(advancePaperTrade(ambiguous,quote(101,now+61000),now+61000,[bar]).state,'STOP','If target and stop share a bar, use stop first');
const testArmedPlan={...buy,status:'ARMED'};
const frozen=updateScalpLedger('GOLD',[testArmedPlan],breakout().quote,now,breakout().c1);const changed={...testArmedPlan,entry:buy.entry+10,targets:[{price:9999,kind:'PROJECTION'}]};
const repeated=updateScalpLedger('GOLD',[changed],quote(4000.45,now+1000),now+1000,breakout().c1);assert.equal(repeated.lanes[0].current.plan.entry,frozen.lanes[0].current.plan.entry);assert.equal(repeated.lanes[0].stats.samples,0,'Unactivated setups do not count as trades');
console.log('PASS: 27 scalp checks: buy/sell geometry, closed bars, bad data, costs, news, expiry, activation, frozen levels, stop slippage and conservative outcomes. Profitability is not established.');

// Production incident replay (2026-10-09 05:03:39Z): confirmed GOLD M5
// BREAKOUT with score 94 was a BUY and stopped 47s later. These are recorded
// PAPER reference prices, not Exness fills or fresh backtest samples.
// This test validates direction/stop geometry, loss arithmetic, slippage, and
// ensures neither a strong score nor gross 2.2R counts as a real profitable trade.
const auditedRecords=[
  {side:'BUY',entry:4186.702,stop:4185.16,target:4190.09,cost:.59,exit:4185.038,expectedR:-1.057,result:'STOP'},
  {side:'SELL',entry:4121.524,stop:4124.04,target:4116.71,cost:.58,exit:4121.271,expectedR:-.106,result:'TIME_EXIT'},
  {side:'SELL',entry:4118.517,stop:4119.94,target:4115.31,cost:.58,exit:4115.31,expectedR:1.312,result:'TP1'},
  {side:'BUY',entry:4141.64,stop:4140.42,target:4144.83,cost:.58,exit:4140.212,expectedR:-1.116,result:'STOP'}
];
for(const t of auditedRecords){
  const direction=t.side==='BUY'?1:-1;
  assert.ok(direction*(t.entry-t.stop)>0,t.side+' stop must be on losing side');
  assert.ok(direction*(t.target-t.entry)>0,t.side+' target must be on winning side');
  const risk=Math.abs(t.entry-t.stop),reward=direction*(t.target-t.entry);
  const expectedNetRR=(reward-t.cost)/(risk+t.cost);
  assert.ok(expectedNetRR>=1.25,'Only plans passing cost-inclusive reward/R are eligible');
  const calculated=(direction*(t.exit-t.entry)-t.cost)/(risk+t.cost);
  assert.ok(Math.abs(calculated-t.expectedR)<.002,
    'Recorded net R must include round-trip cost and stop slippage');
  if(t.result==='STOP'){
    assert.ok(calculated<=-1,'Stop fill beyond boundary must include slippage loss');
  }
}
const refDate=Date.parse('2026-10-09T05:03:39Z');
const incident={
  plan:{...buy,id:'GOLD-5-breakout-20261009',side:'BUY',horizon:5,setup:'BREAKOUT',
    status:'ARMED',score:94,entry:4186.702,stop:4185.16,
    targets:[{price:4190.09,kind:'STRUCTURE'}],cost:.59,
    expiresAt:refDate+210000},state:'ACTIVE',activatedAt:refDate,
  closedAt:null,exit:null,netR:null,lastAt:refDate,lastPrice:4186.702,note:''
};
let paperIncident=incident;
for(let k=5;k<=40;k+=5)paperIncident=advancePaperTrade(
  paperIncident,quote(4186.5,refDate+k*1000),refDate+k*1000,[]);
paperIncident=advancePaperTrade(paperIncident,quote(4185.038,refDate+47000),
  refDate+47000,[]);
assert.equal(paperIncident.state,'STOP');
assert.equal(paperIncident.netR,-1.057,
  'Replay of the actual reference stop must settle at -1.057R net, not a win');
assert.equal(paperIncident.closedAt,refDate+47000);
console.log('PASS: audited GOLD M5 breakout geometry; 4 recorded outcomes match cost-inclusive R and the 47-second loss replay.');

const paperRow=(netR,at=SCALP_PROOF_FROM+60000,state='TP1')=>({
  plan:buy,state,activatedAt:at,closedAt:at+60000,
  exit:buy.entry,netR,lastAt:at+60000,lastPrice:buy.entry,note:'fixture'
});
assert.equal(evaluatePaperProof([paperRow(5,SCALP_PROOF_FROM-60000)]).samples,0,
  'Old wins must not leak into proof of a new deployment');
assert.equal(evaluatePaperProof([paperRow(8,SCALP_PROOF_FROM+60000,'UNKNOWN')]).samples,0,
  'Unknown or canceled trades are never counted as realized wins');
assert.equal(evaluatePaperProof([paperRow(3)]).status,'COLLECTING',
  'A single lucky winner is not evidence of profitability');
const paperWins=Array.from({length:50},(_,i)=>paperRow(i%5===0?-.9:1.2,SCALP_PROOF_FROM+(i+1)*60000,i%5===0?'STOP':'TP1'));
assert.equal(evaluatePaperProof(paperWins).status,'POSITIVE_PAPER_SAMPLE',
  'Positive confidence-bound paper sample can qualify only after enough closed outcomes');
const paperLosses=Array.from({length:50},(_,i)=>paperRow(i%5===0?1:-.8,SCALP_PROOF_FROM+(i+1)*60000,i%5===0?'TP1':'STOP'));
assert.equal(evaluatePaperProof(paperLosses).status,'NOT_VALIDATED',
  'At least 50 outcomes do not guarantee a positive verdict');
assert.equal(evaluatePaperProof(paperWins).eligibleForLiveTrading,false,
  'Paper performance must never authorize live broker execution');
console.log('PASS: post-release proof excludes old/unknown fills and rejects negative samples.');


// Optional chronological replay of real OHLC; same parameters for all bars, no tuning.
// Only next-bar opens can enter. Full next-bar ranges settle with stop-first priority.
if(process.argv[2]){
 const dataset=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 for(const d of dataset){
  for(const horizon of [1,5]){
   const trades=[];let cooldown=0,signals=0;
   for(let k=60;k<d.c1.length-horizon-1;k++){
    const closed=d.c1[k],at=closed.time+60000;if(at<cooldown)continue;
    const available5=d.c5.filter(c=>c.time+300000<=at);if(available5.length<60)continue;
    const plan=buildScalpPlans({asset:d.asset,c1:d.c1.slice(0,k+1),c5:available5,quote:{price:closed.close,at,bid:closed.close-d.spread/2,ask:closed.close+d.spread/2,source:'historical'},candleSource:d.source,now:at,events:[],newsReady:true,marketOpen:true,feeBps:d.feeBps,slippageBps:d.slippageBps}).find(p=>p.horizon===horizon);
    if(plan.status!=='ARMED')continue;signals++;
    const next=d.c1[k+1],dir=plan.side==='BUY'?1:-1;
    if(dir*(next.open-plan.entry)>Math.abs(plan.entry-plan.stop)*.3)continue;
    // Entry and stop/target within the trigger bar have unknown order; conservative skip.
    if(!(dir===1?next.high>=plan.entry:next.low<=plan.entry))continue;
    const touchedStop=dir===1?next.low<=plan.stop:next.high>=plan.stop;
    const touchedTarget=dir===1?next.high>=plan.targets[0].price:next.low<=plan.targets[0].price;
    let exit=null,exitAt=next.time+60000;
    if(touchedStop)exit=plan.stop;
    else if(touchedTarget)continue; // A TP in the trigger bar could precede entry; never claim it.
    for(let j=1;exit==null&&j<=horizon;j++){
     const c=d.c1[k+1+j];if(!c)break;
     const stop=dir===1?c.low<=plan.stop:c.high>=plan.stop,hit=dir===1?c.high>=plan.targets[0].price:c.low<=plan.targets[0].price;
     if(stop||hit||j===horizon){exit=stop?plan.stop:hit?plan.targets[0].price:c.close;exitAt=c.time+60000;}
    }
    if(exit!=null){trades.push((dir*(exit-plan.entry)-plan.cost)/(Math.abs(plan.entry-plan.stop)+plan.cost));cooldown=exitAt;}
   }
   console.log(JSON.stringify({asset:d.asset,horizon,bars:d.c1.length,armedSetups:signals,trades:trades.length,winRate:trades.length?round(trades.filter(r=>r>0).length/trades.length*100):null,netR:round(trades.reduce((s,r)=>s+r,0)),expectancyR:trades.length?round(trades.reduce((s,r)=>s+r,0)/trades.length):null,note:'Small OHLC replay, assumed costs, unknown intrabar order; not proof of future profit.'}));
  }
 }
}
function round(n){return Math.round(n*1000)/1000;}
