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
 const call=nextGoldOpeningCall(null,issued,chart,q);
 assert.equal(call?.side,buy?'BUY':'SELL');
 assert.equal(call.target,open);
 assert.equal(call.issued,issued);
 assert.ok(validOpeningCall(call,open));
 assert.equal(nextGoldOpeningCall(call,issued+1,chart,{...q,price:3500}),call);
 assert.equal(nextGoldOpeningCall(null,open+200,chart,q),null);
 assert.equal(nextGoldOpeningCall(null,issued,chart,{...q,source:'unrelated'}),null);
 assert.equal(nextGoldOpeningCall(null,issued,chart,{...q,sourceTime:issued-20000}),null);
 assert.equal(nextGoldOpeningCall(null,issued,chart,{...q,sourceTime:issued+1}),null);
 const future={time:open,open:3500,high:4000,low:3000,close:buy?3001:3999};
 assert.deepEqual(nextGoldOpeningCall(null,issued,{...chart,chartCandles:[...rows,future]},q),call);
 assert.equal(validOpeningCall({...call,issued:open},open+1),false);
 assert.equal(validOpeningCall(call,open+300000),false);
}
console.log('PASS: pre-open BUY/SELL, frozen side and issue time, no late/backfilled or future-data forecast');
