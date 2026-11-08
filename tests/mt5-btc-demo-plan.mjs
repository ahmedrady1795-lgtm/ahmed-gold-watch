import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planBtcDemoLimit,formatBtcDemoWire} from '../lib/mt5-btc-demo-plan.ts';
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
assert.match(api,/getMt5BtcVerifiedSnapshot\(\)/,
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
assert.doesNotMatch(ea,/trade\.Buy\(|trade\.Sell\(|\bOrderSend\(/,
  'never send an instant market order');
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
assert.match(statusRoute,/demoDiagnostics:/);
assert.match(statusRoute,/actualEaPolls:btcDemoWaitStats\(now\)/);
assert.match(statusRoute,/getMt5BtcVerifiedSnapshot\(now\)/);
assert.match(statusRoute,/waitReason:/);
assert.match(statusRoute,/Cache-Control':'private, no-store'/);
assert.doesNotMatch(statusRoute,/trade\.Buy|trade\.Sell|OrderSend|BridgeToken|Authorization: Bearer/i);
console.log('PASS: BTC demo only diagnostics from authentic EA polling, 10-minute WAIT distribution and no order exposure');

