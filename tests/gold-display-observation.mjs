import assert from 'node:assert/strict';
import {startDisplayObservation,advanceDisplayObservation} from '../lib/gold-display-observation.ts';
const now=1800000000000;
const quote=(time,price)=>({source:'feed',status:'live',price,bid:price-.25,ask:price+.25,sourceTime:time,fetchedAt:time});
for(const side of ['BUY','SELL']){
  const call={target:now,issued:now-9000,quoteSource:'feed',side,reason:'تحضير قبل الكسر'};
  const begin=startDisplayObservation(call,now,quote(now-100,2000));
  assert.equal(begin.spread,.5);
  assert.equal(begin.shown,now);
  const sign=side==='BUY'?1:-1;
  for(const [move,result] of [[.6,'مع الاتجاه'],[-.6,'عكس الاتجاه']]){
    const settled=advanceDisplayObservation(begin,now+2000,quote(now+2000,2000+sign*move));
    assert.equal(settled.outcome,result);
    assert.equal(settled.moveAt,now+2000);
    assert.equal(advanceDisplayObservation(settled,now+3000,quote(now+3000,2000-sign*move)),settled);
  }
  assert.equal(advanceDisplayObservation(begin,now+15000,quote(now+15000,2002)).outcome,'غير محسومة');
  assert.equal(advanceDisplayObservation(begin,now,quote(now-1,2005)),begin);
  assert.equal(startDisplayObservation(call,now,{...quote(now,2000),ask:null}).outcome,'غير محسومة');
  assert.equal(startDisplayObservation(call,now,{...quote(now,2000),source:'other'}).price,null);
}
const browserQuote={...quote(now,2000),source:'Biquote · MT5 XAUUSD WebSocket',fetchedAt:undefined,receivedAt:now};
assert.equal(startDisplayObservation({issued:now-500,target:now,side:'BUY',reason:'',quoteSource:'Biquote · MT5 XAUUSD'},now,browserQuote).price,2000);
console.log('PASS: display timestamps, forward quotes, spread threshold in both directions, gaps and unavailable spread');
