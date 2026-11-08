import assert from 'node:assert/strict';
import fs from 'node:fs';
// GitHub CI already runs this file; exercise the independent MARKET gates too.
import './mt5-btc-demo-market-plan.mjs';
import {planBtcDemoLimit,planBtcDemoEveryCandle,formatBtcDemoWire} from '../lib/mt5-btc-demo-plan.ts';
import {recordBtcDemoSignalDecision,btcDemoWaitStats} from '../lib/mt5-btc-demo-diagnostics.ts';

const minute=60000,now=Date.UTC(2026,10,8,15,34,13);
function bars(period,count=240,increment=2,base=75000,width=12){
  const end=Math.floor(now/period)*period-period;
  return Array.from({length:count},(_,i)=>{
    const close=base+i*increment;
    return {time:end-(count-i-1)*period,
      open:close-increment,close,high:close+width,low:close-width,
      tickVolume:120};
  });
}
const c1=bars(minute,240,2,75000,10);
const price=c1.at(-1).close;
const c5=bars(minute*5,240,5,price-239*5,20);
const fresh={symbol:'BTCUSDm',bid:price+0.5,ask:price+3,
  tickTimeMs:now-200,observedAt:now-300,
  ticks:[
    {time:now-10200,bid:price+0.2,ask:price+2.7},
    {time:now-5200,bid:price-1.0,ask:price+1.5},
    {time:now-200,bid:price+0.5,ask:price+3}
  ],
  candles:{c1,c5,c15:bars(minute*15),c60:bars(minute*60)}};
const buy=planBtcDemoLimit(fresh,now);
assert.equal(buy.ready,true,JSON.stringify(buy));
if(buy.ready){
  assert.equal(buy.side,'BUY_LIMIT');
  assert.equal(buy.symbol,'BTCUSDm');
  assert.ok(buy.entry<fresh.bid,'passive BUY limit, never market price');
  assert.ok(buy.stop<buy.entry&&buy.target>buy.entry);
  assert.ok(buy.expiresAt-now<=15000);
  assert.equal(buy.signalTickTimeMs,now-200);
  assert.equal(formatBtcDemoWire(buy).trim().split('|').length,12);
  assert.ok(formatBtcDemoWire(buy).startsWith('QBTC1|BUY_LIMIT|BTCUSDm|'));
}
// Regression from an Exness-like BTC quote: roughly $6 spread vs $14
// observed M1 ATR. The old 3x spread requirement rejected this setup before
// the limit-entry cost/SL/TP checks could assess it.
const lowerRangeC1=c1.map(x=>({...x,high:x.close+7,low:x.close-7}));
const moderateCost={...fresh,bid:price+.5,ask:price+6.5,
  ticks:[
    {time:now-10200,bid:price+.2,ask:price+6.2},
    {time:now-5200,bid:price-2.2,ask:price+3.8},
    {time:now-200,bid:price+.5,ask:price+6.5}
  ],
  candles:{...fresh.candles,c1:lowerRangeC1}};
const costAware=planBtcDemoLimit(moderateCost,now);
assert.equal(costAware.ready,true,
  'a fresh broker-verified 2.33x ATR/spread setup must reach geometry checks: '+JSON.stringify(costAware));
if(costAware.ready){
  assert.equal(costAware.side,'BUY_LIMIT');
  assert.ok(costAware.entry<moderateCost.bid);
  assert.ok(costAware.stop<costAware.entry&&costAware.target>costAware.entry);
  assert.ok(costAware.target-costAware.entry>=2.4*(moderateCost.ask-moderateCost.bid)-.01,
    'cost-covered TP required after relaxing the pre-filter');
}
const noCostCoverage=planBtcDemoLimit({...moderateCost,ask:price+11.5},now);
assert.deepEqual(noCostCoverage,{ready:false,reason:'VOLATILITY_TOO_LOW'},
  '14 USD ATR must not qualify against 11 USD spread');
const weakM5=planBtcDemoLimit({...moderateCost,candles:{
  ...moderateCost.candles,c5:c5.map(x=>({...x,high:x.close+3,low:x.close-3}))
}},now);
assert.deepEqual(weakM5,{ready:false,reason:'VOLATILITY_TOO_LOW'},
  'M5 context with too little motion relative to fees must still wait');

// Explicit every-M1 demo fallback: valid stale-safe cost-covered pending
// LIMIT candidate even when the original 3-tick reversal has NOT formed.
const noTickSetup={...fresh,ticks:[]};
assert.deepEqual(planBtcDemoLimit(noTickSetup,now),
  {ready:false,reason:'NO_FRESH_THREE_TICK_SETUP'});
const perCandle=planBtcDemoEveryCandle(noTickSetup,now);
assert.equal(perCandle.ready,true,JSON.stringify(perCandle));
if(perCandle.ready){
  assert.equal(perCandle.strategy,'PER_CANDLE');
  assert.equal(perCandle.candleAt,c1.at(-1).time);
  assert.equal(perCandle.side,'BUY_LIMIT');
  assert.ok(perCandle.entry<noTickSetup.bid);
  assert.ok(perCandle.stop<perCandle.entry&&perCandle.target>perCandle.entry);
  assert.ok(perCandle.target-perCandle.entry>=2.4*(noTickSetup.ask-noTickSetup.bid));
  assert.equal(formatBtcDemoWire(perCandle).trim().split('|').length,12);
}
const withTickPattern=planBtcDemoEveryCandle(fresh,now);
assert.equal(withTickPattern.ready,true);
if(withTickPattern.ready)assert.equal(withTickPattern.strategy,'TICK_REVERSAL');
const nextNow=now+60000;
const lastCurrent=c1.at(-1);
const nextC1=[...c1.slice(1),{time:lastCurrent.time+60000,
  open:price,close:price+2,high:price+12,low:price-8,tickVolume:120}];
const next=planBtcDemoEveryCandle({...noTickSetup,
  bid:price+2.5,ask:price+5,tickTimeMs:nextNow-200,
  observedAt:nextNow-300,candles:{...noTickSetup.candles,c1:nextC1}},nextNow);
assert.equal(next.ready,true,'next M1 should be assessed separately: '+JSON.stringify(next));
if(next.ready&&perCandle.ready){
  assert.equal(next.candleAt-perCandle.candleAt,60000);
  assert.ok(next.expiresAt-nextNow<=15000);
}
assert.deepEqual(planBtcDemoEveryCandle({...noTickSetup,
  tickTimeMs:now+40000-200,observedAt:now+40000-300},now+40000),
  {ready:false,reason:'PER_CANDLE_WINDOW_PASSED'},
  'do not chase late M1 candles');
assert.deepEqual(planBtcDemoEveryCandle({...noTickSetup,tickTimeMs:now-20000},now),
  {ready:false,reason:'STALE_BROKER_QUOTE'});
assert.deepEqual(planBtcDemoEveryCandle({...noTickSetup,ask:noTickSetup.bid+100},now),
  {ready:false,reason:'SPREAD_TOO_WIDE'});
assert.deepEqual(planBtcDemoEveryCandle({...noTickSetup,ask:noTickSetup.bid+19},now),
  {ready:false,reason:'VOLATILITY_TOO_LOW'},
  'cannot force a trade when spread absorbs recent observed movement');
const undirected=c1.map(x=>({...x,open:price,close:price,high:price+10,low:price-10}));
assert.deepEqual(planBtcDemoEveryCandle({...noTickSetup,
  candles:{...noTickSetup.candles,c1:undirected}},now),
  {ready:false,reason:'NO_DIRECTIONAL_EVIDENCE'},
  'cannot invent direction without a genuine nonzero movement');

const shortM1=c1.map(x=>({...x,open:150000-x.open,
  close:150000-x.close,high:150000-x.low,low:150000-x.high}));
const shortM5=c5.map(x=>({...x,open:150000-x.open,
  close:150000-x.close,high:150000-x.low,low:150000-x.high}));
const short=shortM1.at(-1).close;
const sell=planBtcDemoLimit({...fresh,bid:short-3,ask:short-.5,
  ticks:[
    {time:now-10200,bid:short-3.2,ask:short-.7},
    {time:now-5200,bid:short-1,ask:short+1.5},
    {time:now-200,bid:short-3,ask:short-.5}
  ],
  candles:{...fresh.candles,c1:shortM1,c5:shortM5}},now);
assert.equal(sell.ready,true,JSON.stringify(sell));
if(sell.ready){
  assert.equal(sell.side,'SELL_LIMIT');
  assert.ok(sell.entry>short-.5,'passive SELL limit');
  assert.ok(sell.stop>sell.entry&&sell.target<sell.entry);
}
for(const [label,bad] of [
  ['no data',null],
  ['missing three tick reversal',{...fresh,ticks:[]}],
  ['duplicate tick sample',{...fresh,ticks:fresh.ticks.map((x,i)=>
    i===1?{...x,time:fresh.ticks[0].time}:x)}],
  ['stale intraminute tick pattern',{...fresh,ticks:fresh.ticks.map((x,i)=>
    i===0?{...x,time:now-30000}:x)}],
  ['wrong symbol',{...fresh,symbol:'XAUUSDm'}],
  ['stale tick',{...fresh,tickTimeMs:now-15000}],
  ['M5 venue mismatch',{...fresh,candles:{...fresh.candles,c5:bars(minute*5,240,5,75000,20)}}],
  ['stale bridge',{...fresh,observedAt:now-20000}],
  ['huge spread',{...fresh,ask:fresh.bid+200}],
  ['missing M1',{...fresh,candles:{...fresh.candles,c1:[]}}],
  ['M1 discontinuity',{...fresh,candles:{...fresh.candles,
    c1:c1.map((x,i)=>i===235?{...x,time:x.time-1000}:x)}}],
  ['bad tick volume',{...fresh,candles:{...fresh.candles,
    c1:c1.map((x,i)=>i===239?{...x,tickVolume:0}:x)}}],
] ){
  const result=planBtcDemoLimit(bad,now);
  assert.equal(result.ready,false,label);
  assert.match(formatBtcDemoWire(result),/^QBTC1\|WAIT\|[A-Z0-9_]+\n$/,label);
}
const api=fs.readFileSync('app/api/mt5/btc-demo-signal/route.ts','utf8');
const ea=fs.readFileSync('mt5_bridge/mql5/QannasBtcDemoTrader.mq5','utf8');
assert.match(api,/MT5_BTC_DEMO_SIGNALS_ENABLED!=='true'/,
  'server demo signal remains off without explicit opt-in');
assert.match(api,/getMt5BtcVerifiedSnapshot\(now\)/,
  'server must use broker-only validated history');
assert.match(api,/MT5_BRIDGE_TOKEN/);
assert.match(ea,/ACCOUNT_TRADE_MODE_DEMO/);
assert.match(ea,/ExpectedDemoLogin/);
assert.match(ea,/EnableDemoOrders=false/);
assert.match(ea,/I_ENABLE_DEMO_ONLY_V1/);
assert.match(ea,/TRADE_RETCODE_PLACED/);
assert.match(ea,/ORDER_TIME_SPECIFIED/);
assert.match(ea,/MaxRiskPerTradePct>0\.05/);
assert.match(ea,/MaxFilledTradesPerMinute>4/);
assert.match(ea,/MaxFilledTradesPerDay>360/);
assert.match(ea,/MaxPositionHoldSeconds>30/);
assert.match(ea,/GlobalVariableSet\(signalKey,\(double\)signalTick\)/);
assert.match(ea,/TimeGMT\(\)-GlobalVariableGet\(cooldownKey\)<10/);
assert.match(ea,/MaxDailyLossPct>0\.50/);
assert.match(ea,/HistoryLimits\(\)/);
assert.match(ea,/GlobalVariableSet\(signalKey/);
assert.match(ea,/SymbolExposure\(\)>0/);
assert.match(ea,/trade\.BuyLimit\(/);
assert.match(ea,/trade\.SellLimit\(/);
assert.match(ea,/trade\.PositionClose\(ticket\)/);
assert.match(ea,/trade\.OrderDelete\(ticket\)/);
const legacyLimitPath=ea.split('bool ValidateAndPlace(const string wire)')[1]
  ?.split('void OnTimer()')[0];
assert.ok(legacyLimitPath,'legacy LIMIT entry must still exist');
assert.doesNotMatch(legacyLimitPath,/trade\.Buy\(|trade\.Sell\(|\bOrderSend\(/,
  'the existing LIMIT path must not become an implicit market fallback');
// Exness demo rejected 4-15s ORDER_TIME_SPECIFIED with retcode 10022.
// Keep the broker-side expiry long enough to be valid, but cancel the LIMIT
// locally within 11s using broker-persisted ORDER_TIME_SETUP. Never leave GTC
// orders behind or convert these failures into market orders.
assert.match(ea,/#property version "1\.03"/);
assert.match(ea,/BROKER_PENDING_EXPIRY_SECONDS=180/);
assert.match(ea,/LocalPendingLifetimeSeconds=11/);
assert.match(ea,/LocalPendingLifetimeSeconds>15/);
assert.match(ea,/const datetime brokerNow=TimeTradeServer\(\)/);
assert.match(ea,/const datetime expiry=brokerNow\+BROKER_PENDING_EXPIRY_SECONDS/);
assert.match(ea,/const datetime setup=\(datetime\)OrderGetInteger\(ORDER_TIME_SETUP\)/);
assert.match(ea,/now-setup<LocalPendingLifetimeSeconds/);
assert.match(ea,/CancelStaleOwnedPending\(\);/);
assert.match(ea,/trade\.OrderDelete\(ticket\)/);
assert.match(ea,/TRADE_RETCODE_INVALID_EXPIRATION/);
assert.doesNotMatch(ea,/\(int\)MathMin\(15,MathMax\(4/);
assert.doesNotMatch(ea,/ORDER_TIME_GTC|ORDER_TIME_DAY/, 'no unbounded expiration fallback');

console.log('PASS: intraminute BTC demo LIMIT tick-reversal/unique-quote signals, 4/min guard, 0.05% risk, 30s hold');
// Real authenticated EA poll responses, not browser GETs, own the rolling
// diagnostics counters. A one-off snapshot is not evidence of repeated trades.
for(let i=0;i<4;i++)
  recordBtcDemoSignalDecision({ready:false,reason:'VOLATILITY_TOO_LOW'},now-5000+i);
recordBtcDemoSignalDecision(buy,now);
const stats=btcDemoWaitStats(now);
assert.equal(stats.observations,5);
assert.equal(stats.lastDecision,'CANDIDATE_READY');
assert.deepEqual(stats.topReasons[0],{reason:'VOLATILITY_TOO_LOW',count:4});
assert.equal(btcDemoWaitStats(now+10*60000+1000).observations,0);
const statusRoute=fs.readFileSync('app/api/mt5/btc-status/route.ts','utf8');
const signalRoute=fs.readFileSync('app/api/mt5/btc-demo-signal/route.ts','utf8');
assert.match(signalRoute,/recordBtcDemoSignalDecision\(decision,now\)/);
assert.match(signalRoute,/planBtcDemoEveryCandle\(getMt5BtcVerifiedSnapshot\(now\),now\)/);
assert.match(statusRoute,/demoEveryM1CandleMode:true/);
assert.match(statusRoute,/demoDiagnostics:/);
assert.match(statusRoute,/actualEaPolls:btcDemoWaitStats\(now\)/);
assert.match(statusRoute,/getMt5BtcVerifiedSnapshot\(now\)/);
assert.match(statusRoute,/waitReason:/);
assert.match(statusRoute,/Cache-Control':'private, no-store'/);
assert.doesNotMatch(statusRoute,/trade\.Buy|trade\.Sell|OrderSend|BridgeToken|Authorization: Bearer/i);
console.log('PASS: BTC demo only diagnostics from authentic EA polling, 10-minute WAIT distribution and no order exposure');

