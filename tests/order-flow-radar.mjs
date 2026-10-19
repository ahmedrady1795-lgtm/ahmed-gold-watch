import assert from 'node:assert/strict';
import {OrderFlowRadar} from '../lib/order-flow-radar.ts';
const start=1800000000000;
function ready(buy=false){
 const r=new OrderFlowRadar();
 r.ingest({type:'snapshot',product_id:'BTC-USD',bids:[['99.99',buy?'1':'9']],asks:[['100.01',buy?'9':'1']]},start-31000);
 r.heartbeatAt=start;r.bookAt=start;
 for(let i=0;i<30;i++)r.ingest({type:'match',product_id:'BTC-USD',trade_id:i+1,time:new Date(start-2900+i*100).toISOString(),price:'100',size:'1',side:buy?'sell':'buy'},start);
 r.replenishments=[{at:start,side:buy?'sell':'buy'},{at:start,side:buy?'sell':'buy'}];
 return r;
}
const r=ready();
assert.equal(r.evaluate(start).delta,-100,'maker buy is aggressive sell');
assert.equal(r.view.phase,'WATCH');
r.heartbeatAt=start+5000;r.bookAt=start+5000;
r.ingest({type:'match',product_id:'BTC-USD',trade_id:31,time:new Date(start+5000).toISOString(),price:'100',size:'1',side:'buy'},start+5000);
assert.equal(r.evaluate(start+5000).phase,'PREPARE');
const levels=[r.view.confirm,r.view.invalidate];
for(let i=0;i<6;i++)r.ingest({type:'match',product_id:'BTC-USD',trade_id:32+i,time:new Date(start+6000+i*100).toISOString(),price:'100.04',size:'3',side:'sell'},start+6500);
r.heartbeatAt=start+6500;r.bookAt=start+6500;
assert.equal(r.evaluate(start+6500).phase,'CONFIRMED');
assert.deepEqual([r.view.confirm,r.view.invalidate],levels,'levels must not drift');
r.ingest({type:'match',product_id:'BTC-USD',trade_id:38,time:new Date(start+7000).toISOString(),price:'99.95',size:'1',side:'buy'},start+7000);
assert.equal(r.evaluate(start+7000).phase,'INVALIDATED');
assert.equal(r.evaluate(start+20000).phase,'OFFLINE');
assert.equal(r.view.confirm,null);
const gap=ready();gap.ingest({type:'match',product_id:'BTC-USD',trade_id:32,time:new Date(start).toISOString(),price:'100',size:'1',side:'buy'},start);
assert.equal(gap.evaluate(start).phase,'OFFLINE','missing trade blocks signals');
assert.equal(gap.broken,false,'trade gap quarantines delta without losing L2 connection');
assert.ok(gap.quarantineUntil>=start+30000);
for(let i=0;i<25;i++){
 const t=start+31000+i*40;
 gap.ingest({type:'match',product_id:'BTC-USD',trade_id:33+i,
   time:new Date(t).toISOString(),price:'100',size:'1',side:'buy'},t);
}
gap.heartbeatAt=start+32000;gap.bookAt=start+32000;
assert.equal(gap.evaluate(start+32000).phase,'WATCH',
 'clean flow resumes after quarantine without rebuilding order book');
const duplicate=ready();duplicate.ingest({type:'match',product_id:'BTC-USD',trade_id:30,time:new Date(start).toISOString(),price:'100',size:'1',side:'buy'},start);
assert.equal(duplicate.trades.length,30);
const sell=ready(true);assert.equal(sell.evaluate(start).delta,100);
const stale=ready();stale.ingest({type:'heartbeat',product_id:'BTC-USD',time:new Date(start-10000).toISOString(),last_trade_id:30},start);assert.equal(stale.evaluate(start).phase,'OFFLINE');
console.log('Radar: direction, persistence, frozen levels, confirmation, invalidation, stale and gap guards passed');
