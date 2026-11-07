import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planBtcDemoLimit,formatBtcDemoWire} from '../lib/mt5-btc-demo-plan.ts';

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
  candles:{c1,c5,c15:bars(minute*15),c60:bars(minute*60)}};
const buy=planBtcDemoLimit(fresh,now);
assert.equal(buy.ready,true,JSON.stringify(buy));
if(buy.ready){
  assert.equal(buy.side,'BUY_LIMIT');
  assert.equal(buy.symbol,'BTCUSDm');
  assert.ok(buy.entry<fresh.bid,'passive BUY limit, never market price');
  assert.ok(buy.stop<buy.entry&&buy.target>buy.entry);
  assert.ok(buy.expiresAt-now<=15000);
  assert.ok(formatBtcDemoWire(buy).startsWith('QBTC1|BUY_LIMIT|BTCUSDm|'));
}
const shortM1=c1.map(x=>({...x,open:150000-x.open,
  close:150000-x.close,high:150000-x.low,low:150000-x.high}));
const shortM5=c5.map(x=>({...x,open:150000-x.open,
  close:150000-x.close,high:150000-x.low,low:150000-x.high}));
const short=shortM1.at(-1).close;
const sell=planBtcDemoLimit({...fresh,bid:short-3,ask:short-.5,
  candles:{...fresh.candles,c1:shortM1,c5:shortM5}},now);
assert.equal(sell.ready,true,JSON.stringify(sell));
if(sell.ready){
  assert.equal(sell.side,'SELL_LIMIT');
  assert.ok(sell.entry>short-.5,'passive SELL limit');
  assert.ok(sell.stop>sell.entry&&sell.target<sell.entry);
}
for(const [label,bad] of [
  ['no data',null],
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
  assert.match(formatBtcDemoWire(result),/^QBTC1\|WAIT\|[A-Z_]+\n$/,label);
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
assert.match(ea,/MaxRiskPerTradePct>0\.10/);
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
console.log('PASS: demo LIMIT planning, gaps/stale/spread vetoes, and strict broker-local execution guards');
