import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getMt5BtcStatus,setMt5BtcStatus} from '../lib/mt5-btc-readonly.ts';

const now=Date.UTC(2026,10,8,12,41,30);
const candlesFor=(period,count=240)=>{
  const end=Math.floor(now/period)*period-period;
  return Array.from({length:count},(_,i)=>{
    const time=end-(count-i-1)*period;
    return {time,open:100000,high:100020,low:99980,close:100005,tickVolume:55};
  });
};
const payload={
  symbol:'BTCUSDm',tickTimeMs:now-200,bid:100001,ask:100004,
  mode:'dry-run',candles:{
    c1:candlesFor(60000),c5:candlesFor(300000),
    c15:candlesFor(900000),c60:candlesFor(3600000)
  }
};
assert.equal(getMt5BtcStatus(now).connected,false);
const state=setMt5BtcStatus(payload,now);
assert.equal(state.connected,true);
assert.equal(state.fresh,true);
assert.equal(state.candlesFresh,true);
assert.equal(state.status?.candleCounts?.m1,240);
assert.equal(getMt5BtcStatus(now+9000).fresh,false);
assert.equal(getMt5BtcStatus(now+9000).candlesFresh,false);
assert.throws(()=>setMt5BtcStatus({...payload,symbol:'XAUUSDm'},now));
assert.throws(()=>setMt5BtcStatus({...payload,ask:99999},now));
assert.throws(()=>setMt5BtcStatus({...payload,tickTimeMs:now+20000},now));
assert.throws(()=>setMt5BtcStatus({...payload,mode:'live'},now));
assert.equal(setMt5BtcStatus({...payload,candles:{
  ...payload.candles,c1:[...payload.candles.c1.slice(1),{
  time:now+60000,open:100000,close:100005,high:100020,low:99980}]}
},now).candlesFresh,true,'previous good candles survive invalid update');
const route=fs.readFileSync('app/api/mt5/btc-status/route.ts','utf8');
const ea=fs.readFileSync('mt5_bridge/mql5/QannasReadOnlyBridge.mq5','utf8');
assert.match(route,/MT5_BRIDGE_TOKEN/);
assert.match(route,/safeEqual/);
assert.match(route,/executionEnabled:false/);
assert.match(ea,/isBitcoin\?"\/api\/mt5\/btc-status":"\/api\/mt5\/status"/);
assert.doesNotMatch(ea,/\b(?:OrderSend|CTrade|TRADE_ACTION_DEAL|TRADE_ACTION_PENDING)\s*\(/);
console.log('PASS: BTCUSDm independent read-only bridge, symbol isolation, freshness and safety');
