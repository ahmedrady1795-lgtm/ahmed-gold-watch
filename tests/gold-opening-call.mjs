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
 const tooEarly=open-25000;
 assert.equal(nextGoldOpeningCall(null,tooEarly,chart,{...q,sourceTime:tooEarly-300,fetchedAt:tooEarly}),null,'reserve early window for a genuine setup');
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
   const call=nextGoldOpeningCall(null,at,chart,q);
   assert.equal(call?.side,buy?'BUY':'SELL');
   assert.match(call.reason,/تحضير قبل الكسر/);
   assert.equal(call.issued,at);
   assert.equal(call.target,open);
   assert.equal(nextGoldOpeningCall(call,at+1000,chart,{...q,price:price+(buy?-2:2)}),call);
   const crossed=price+(buy?.6:-.6);
   const later=nextGoldOpeningCall(null,at,chart,{...q,price:crossed,bid:crossed-.05,ask:crossed+.05});
   assert.ok(!later||!later.reason.startsWith('تحضير قبل الكسر'),'already crossed must not be called pre-break');
 }
 console.log('PASS: pre-break preparation is preferred for both frozen M5 directions');
