import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planBtcDemoMarket,formatBtcDemoMarketWire}
  from '../lib/mt5-btc-demo-market-plan.ts';
import {recordBtcDemoMarketDecision,btcDemoMarketStats}
  from '../lib/mt5-btc-demo-market-diagnostics.ts';

const minute=60000;
const now=Date.UTC(2026,10,8,15,34,13);
function bars(period,count=240,inc=2,base=75000,width=10){
  const end=Math.floor(now/period)*period-period;
  return Array.from({length:count},(_,i)=>{
    const close=base+i*inc;
    return {time:end-(count-i-1)*period,open:close-inc,
      close,high:close+width,low:close-width,tickVolume:150};
  });
}
const c1=bars(minute);
const price=c1.at(-1).close;
const c5=bars(minute*5,240,5,price-239*5,20);
const valid={
  symbol:'BTCUSDm',bid:price+.5,ask:price+3,
  tickTimeMs:now-200,observedAt:now-300,ticks:[],
  candles:{c1,c5,c15:bars(minute*15),c60:bars(minute*60)}
};
const buy=planBtcDemoMarket(valid,now);
assert.equal(buy.ready,true,JSON.stringify(buy));
if(buy.ready){
  assert.equal(buy.side,'BUY_MARKET');
  assert.equal(buy.candleAt,c1.at(-1).time);
  assert.ok(buy.stopDistance>0);
  assert.ok(buy.targetDistance>=1.4*buy.stopDistance);
  assert.ok(buy.targetDistance>=2.4*(valid.ask-valid.bid));
  assert.ok(buy.expiresAt-now<=8000);
  assert.equal(formatBtcDemoMarketWire(buy).trim().split('|').length,11);
  assert.match(formatBtcDemoMarketWire(buy),/^QBTCM1\|BUY_MARKET\|BTCUSDm\|/);
}
// Live Exness screenshot: ~6.40 USD spread against ~9.5 USD M1 ATR.
// That borderline 1.49 ratio may qualify only if a properly priced TP still
// exceeds 2.4 spreads; it is never a mandate to send an order.
const narrowC1=c1.map(x=>({...x,high:x.close+4.75,low:x.close-4.75}));
const borderline={...valid,ask:valid.bid+6.4,
  candles:{...valid.candles,c1:narrowC1}};
const costCovered=planBtcDemoMarket(borderline,now);
assert.equal(costCovered.ready,true,JSON.stringify(costCovered));
if(costCovered.ready){
  assert.ok(costCovered.targetDistance>=2.4*6.4);
  assert.ok(costCovered.targetDistance>=1.4*costCovered.stopDistance);
}

const shortC1=c1.map(x=>({...x,open:150000-x.open,
  close:150000-x.close,high:150000-x.low,low:150000-x.high}));
const shortC5=c5.map(x=>({...x,open:150000-x.open,
  close:150000-x.close,high:150000-x.low,low:150000-x.high}));
const short=shortC1.at(-1).close;
const sell=planBtcDemoMarket({...valid,bid:short-3,ask:short-.5,
  candles:{...valid.candles,c1:shortC1,c5:shortC5}},now);
assert.equal(sell.ready,true,JSON.stringify(sell));
if(sell.ready)assert.equal(sell.side,'SELL_MARKET');

const nextNow=now+minute;
const newer=[...c1.slice(1),{time:c1.at(-1).time+minute,
  open:price,close:price+2,high:price+12,low:price-8,tickVolume:120}];
const next=planBtcDemoMarket({...valid,bid:price+2.5,ask:price+5,
  tickTimeMs:nextNow-200,observedAt:nextNow-300,
  candles:{...valid.candles,c1:newer}},nextNow);
assert.equal(next.ready,true,JSON.stringify(next));
if(next.ready&&buy.ready)assert.equal(next.candleAt-buy.candleAt,minute);

for(const [name,input,expected] of [
  ['missing',null,'BROKER_NOT_FRESH'],
  ['wrong symbol',{...valid,symbol:'XAUUSDm'},'SYMBOL_MISMATCH'],
  ['stale tick',{...valid,tickTimeMs:now-12000},'STALE_BROKER_QUOTE'],
  ['stale bridge',{...valid,observedAt:now-15000},'STALE_BROKER_QUOTE'],
  ['missing candles',{...valid,candles:{...valid.candles,c1:[]}},'HISTORY_GAP'],
  ['bar gap',{...valid,candles:{...valid.candles,
    c1:c1.map((x,i)=>i===236?{...x,time:x.time-1000}:x)}},'HISTORY_GAP'],
  ['wide spread',{...valid,ask:valid.bid+300},'SPREAD_TOO_WIDE'],
  ['low ATR/spread',{...valid,ask:valid.bid+15},'NO_COST_COVERED_M1_MOVE'],
  ['chase current candle',{...valid,bid:price+50,ask:price+52.5},'PRICE_DISLOCATED'],
  ['missing real tick volume',{...valid,candles:{...valid.candles,
    c1:c1.map((x,i)=>i===c1.length-1?{...x,tickVolume:0}:x)}},'NO_OBSERVED_VOLUME'],
  ['flat signal',{...valid,candles:{...valid.candles,
    c1:c1.map(x=>({...x,open:price,close:price,
      low:price-10,high:price+10}))}},'DIRECTION_UNCONFIRMED'],
] ){
  const d=planBtcDemoMarket(input,now);
  assert.deepEqual(d,{ready:false,reason:expected},name);
  assert.match(formatBtcDemoMarketWire(d),/^QBTCM1\|WAIT\|[A-Z0-9_]+\n$/);
}

// Each fresh M1 is considered early; late entry gets rejected so
// positions can be held until the END of their actual entry minute.
const lateNow=now+26000;
assert.deepEqual(planBtcDemoMarket({...valid,
  tickTimeMs:lateNow-200,observedAt:lateNow-300},lateNow),
  {ready:false,reason:'CLOSED_M1_TOO_OLD'});
// Broker tick movement can resolve an otherwise flat last M1 without
// pretending to have Level-2 order book data.
const flatC1=c1.map(x=>({...x,open:price,close:price,
  low:price-10,high:price+10}));
const tickDriven=planBtcDemoMarket({...valid,ticks:[
  {time:now-3000,bid:price-1,ask:price+1},
  {time:now-200,bid:price+.5,ask:price+3}
],candles:{...valid.candles,c1:flatC1}},now);
assert.equal(tickDriven.ready,true,JSON.stringify(tickDriven));
if(tickDriven.ready)assert.equal(tickDriven.side,'BUY_MARKET');
// Simulate eight successive healthy M1 bars: one candidate assessment
// for each minute. This is signal coverage only, NOT 8 wins or fills.
let advancing=c1;
for(let n=1;n<=8;n++){
  const previous=advancing.at(-1)!;
  const close=previous.close+(n%2?-2:3);
  const nextBar={time:previous.time+minute,
    open:previous.close,close,high:Math.max(close,previous.close)+10,
    low:Math.min(close,previous.close)-10,tickVolume:90+n};
  advancing=[...advancing.slice(1),nextBar];
  const evaluationTime=now+n*minute;
  const quote={...valid,bid:close+.5,ask:close+3,
    tickTimeMs:evaluationTime-200,observedAt:evaluationTime-300,
    candles:{...valid.candles,c1:advancing}};
  const attempted=planBtcDemoMarket(quote,evaluationTime);
  assert.equal(attempted.ready,true,`fresh M1 number ${n}: ${JSON.stringify(attempted)}`);
  if(attempted.ready)assert.equal(attempted.candleAt,nextBar.time);
}
recordBtcDemoMarketDecision(buy,now-3000);
recordBtcDemoMarketDecision({ready:false,reason:'BROKER_NOT_FRESH'},now-2000);
recordBtcDemoMarketDecision({ready:false,reason:'BROKER_NOT_FRESH'},now);
const stats=btcDemoMarketStats(now);
assert.equal(stats.observations,3);
assert.deepEqual(stats.topReasons[0],{reason:'BROKER_NOT_FRESH',count:2});
assert.equal(btcDemoMarketStats(now+600001).observations,0);

const ea=fs.readFileSync('mt5_bridge/mql5/QannasBtcDemoTrader.mq5','utf8');
const marketRoute=fs.readFileSync('app/api/mt5/btc-demo-market-signal/route.ts','utf8');
const limitRoute=fs.readFileSync('app/api/mt5/btc-demo-signal/route.ts','utf8');
const status=fs.readFileSync('app/api/mt5/btc-status/route.ts','utf8');
assert.match(marketRoute,/MT5_BTC_DEMO_MARKET_SIGNALS_ENABLED!=='true'/);
assert.match(marketRoute,/getMt5BtcVerifiedSnapshot\(now\)/);
assert.match(marketRoute,/MT5_BRIDGE_TOKEN/);
assert.match(marketRoute,/recordBtcDemoMarketDecision\(candidate,now\)/);
assert.match(status,/demoMarketDiagnostics:/);
assert.match(status,/actualMarketEaPolls:btcDemoMarketStats\(now\)/);
assert.match(limitRoute,/MT5_BTC_DEMO_SIGNALS_ENABLED!=='true'/);
assert.doesNotMatch(marketRoute,/OrderSend|trade\.Buy|trade\.Sell/);
assert.match(ea,/#property version "1\.07"/);
assert.match(ea,/UseDemoMarketEntries=false/);
assert.match(ea,/DemoMarketConfirmation=""/);
assert.match(ea,/I_ENABLE_DEMO_MARKET_ONLY_V1/);
assert.match(ea,/ACCOUNT_TRADE_MODE_DEMO/);
assert.match(ea,/ExpectedDemoLogin/);
assert.match(ea,/EnableDemoOrders=false/);
assert.match(ea,/MaxRiskPerTradePct>0\.10/);
assert.match(ea,/MaxDailyLossUSD=100\.00/);
assert.match(ea,/MaxDailyLossUSD>100\.00/);
assert.match(ea,/ACCOUNT_CURRENCY/);
assert.match(ea,/currentEquity<=startEquity-MaxDailyLossUSD/);
assert.match(ea,/pnl<=-MaxDailyLossUSD/);
assert.match(ea,/DAILY_EQUITY_STOP/);
assert.match(ea,/DAILY_REALIZED_STOP/);
assert.match(ea,/FILLED_TRADES_DAY_LIMIT/);
assert.match(ea,/FILLED_TRADES_MINUTE_LIMIT/);
assert.match(ea,/DEAL_FEE/);
assert.match(ea,/void OnTradeTransaction\(/);
assert.match(ea,/TRADE_TRANSACTION_DEAL_ADD/);
assert.match(ea,/Qannas BTC DEMO BROKER DEAL/);
assert.match(ea,/DEAL_REASON/);
assert.doesNotMatch(ea,/MaxDailyLossPct/);
assert.match(ea,/MaxFilledTradesPerMinute>9/);
assert.match(ea,/MaxMarketEntriesPerM1>4/);

// Higher frequency is DEMO-only, with strict per-M1/rolling-minute ceilings.
// MARKET uses higher risk-sized volume and up to three HEDGING positions;
 // legacy LIMIT remains capped to 0.05%, and no martingale is allowed.
assert.match(ea,/MaxFilledTradesPerMinute=9/);
assert.match(ea,/const int allowedPerMinute=UseDemoMarketEntries\?/);
assert.match(ea,/MathMin\(MaxFilledTradesPerMinute,4\)/);
assert.match(ea,/entriesLastMinute>=allowedPerMinute/);
assert.match(ea,/MaxMarketEntriesPerM1=4/);
assert.match(ea,/MarketReentryCooldownSeconds=4/);
assert.match(ea,/MarketSignalPollSeconds=2/);
assert.match(ea,/MarketExitAtMinuteEnd=true/);
assert.match(ea,/MarketLatestEntrySecond=35/);
assert.match(ea,/M1_ENTRY_MINUTE_END/);
assert.match(ea,/DailyEquityStopReached\(\)/);
assert.match(ea,/MaxDailyLossUSD=100\.00/);
assert.match(ea,/MaxCombinedStopRiskPct>0\.30/);
assert.match(ea,/MaxConcurrentMarketPositions>3/);
assert.match(ea,/const datetime minuteEnd=\(datetime\)/);
assert.match(ea,/MarketExitAtMinuteEnd&&/);
assert.match(ea,/if\(!UseDemoMarketEntries&&SymbolExposure\(\)>0\)/);
assert.match(ea,/MarketReentryCooldownSeconds<3\|\|MarketReentryCooldownSeconds>10/);
assert.match(ea,/MarketSignalPollSeconds<2\|\|MarketSignalPollSeconds>4/);
assert.match(ea,/TimeGMT\(\)-GlobalVariableGet\(cooldownKey\)<MarketReentryCooldownSeconds/);
assert.match(ea,/const int pollEvery=UseDemoMarketEntries\?MarketSignalPollSeconds:3/);
assert.match(ea,/MaxRiskPerTradePct\/100\.0\*\.80/);
assert.match(ea,/MarketStackingSafe\(buy,lots,entry,sl,slipAllowance\)/);
assert.match(ea,/AccountInfoInteger\(ACCOUNT_MARGIN_MODE\)!=ACCOUNT_MARGIN_MODE_RETAIL_HEDGING/);
assert.match(ea,/PositionGetInteger\(POSITION_MAGIC\)/);
assert.match(ea,/MaxConcurrentMarketPositions=3/);
assert.match(ea,/MaxCombinedStopRiskPct=0\.30/);
assert.doesNotMatch(ea,/Martingale|MartingaleMultiplier|RecoverLossLot|DoubleAfterLoss/i);

assert.match(ea,/HistoryLimits\(\)/);
assert.match(ea,/SymbolExposure\(\)>0/);
assert.match(ea,/MarketStackingSafe\(buy,lots,entry,sl,slipAllowance\)/);
assert.match(ea,/AccountInfoInteger\(ACCOUNT_MARGIN_MODE\)!=ACCOUNT_MARGIN_MODE_RETAIL_HEDGING/);
assert.match(ea,/PositionGetInteger\(POSITION_MAGIC\)/);
assert.match(ea,/MaxConcurrentMarketPositions=3/);
assert.match(ea,/MaxCombinedStopRiskPct=0\.30/);
assert.match(ea,/MaxPositionHoldSeconds>30/);
assert.match(ea,/MarketLossGraceSeconds=10/);
assert.match(ea,/MarketQuickProfitRiskFraction=0\.35/);
assert.match(ea,/MarketEarlyLossRiskFraction=0\.60/);
assert.match(ea,/MarketLossGraceSeconds<8\|\|MarketLossGraceSeconds>15/);
assert.match(ea,/MarketQuickProfitRiskFraction<0\.25\|\|MarketQuickProfitRiskFraction>0\.60/);
assert.match(ea,/MarketEarlyLossRiskFraction<0\.50\|\|MarketEarlyLossRiskFraction>0\.80/);
assert.match(ea,/POSITION_PROFIT/);
assert.match(ea,/POSITION_SWAP/);
assert.match(ea,/if\(floating>=profitTake\)/);
assert.match(ea,/else if\(age>=MarketLossGraceSeconds&&floating<=-lossCut\)/);
assert.match(ea,/if\(why==""&&\(!isMarket\|\|!MarketExitAtMinuteEnd\)&&age>=MaxPositionHoldSeconds\)/);
assert.match(ea,/QUICK_FLOATING_PROFIT/);
assert.match(ea,/EARLY_ADVERSE_LOSS/);
assert.match(ea,/MISSING_BROKER_SL_TP/);
assert.match(ea,/MAX_HOLD_TIME/);
assert.match(ea,/TRADE_RETCODE_DONE_PARTIAL/);
assert.match(ea,/const uint rc=trade\.ResultRetcode\(\)/);
assert.match(ea,/void OnTick\(\)/);
assert.match(ea,/EventSetTimer\(UseDemoMarketEntries\?1:3\)/);
assert.match(ea,/now==lastPositionScanAt/);
assert.match(ea,/now-lastCloseAttemptAt<2/);
assert.match(ea,/check History for final net/);
assert.doesNotMatch(ea,/closed own position \(time or missing SL\/TP\)/,
  'must not conflate missing broker SL/TP and time/profit exits');

assert.match(ea,/budget=AccountInfoDouble\(ACCOUNT_EQUITY\)\*/);
assert.match(ea,/OrderCalcProfit\(type,_Symbol,minLot,worstEntry,worstStop,atMin\)/);
assert.match(ea,/TRADE_RETCODE_DONE_PARTIAL/);
assert.match(ea,/ManageOwnOpenPositions\(\);/);
assert.match(ea,/SetDeviationInPoints/);
assert.match(ea,/trade\.Buy\(lots,_Symbol,entry,sl,tp/);
assert.match(ea,/trade\.Sell\(lots,_Symbol,entry,sl,tp/);
assert.match(ea,/UseDemoMarketEntries\?"\/api\/mt5\/btc-demo-market-signal"/);
assert.match(ea,/trade\.BuyLimit\(/); // legacy fallback is separate, not mixed
assert.match(ea,/trade\.SellLimit\(/);
assert.doesNotMatch(ea,/\bOrderSend\(/);
console.log('PASS: separately opted-in Exness BTC DEMO MARKET candidate/stop-risk validation, same-side risk-capped multi-position guard and M1-end exit; no live account');
