const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
let clock=Date.parse('2026-11-21T09:00:00Z');
class Clock extends Date {static now(){return clock;}}
const pending=[],calls=[];
const exportsRef={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/liquidity-intelligence.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{
 exports:exportsRef,Date:Clock,URL,AbortSignal,Promise,console,
 fetch:url=>{calls.push(String(url));return new Promise(resolve=>pending.push(resolve));}
},{filename:'liquidity-intelligence.ts'});
const {coinbaseExecutedFlow:coinbase,okxExecutedFlow:okx,
 getBtcLiquidity:liquidity}=exportsRef;

// Same monotonic falling prices but REST maker SELL: every completed
// Coinbase print is an aggressive BUY, not a price-tick-based SELL.
const cb=Array.from({length:40},(_,i)=>({
 trade_id:990000+i,time:new Date(clock-2000-i*75).toISOString(),
 price:String(62000-i),size:'0.2',side:'sell'
}));
let result=coinbase(cb,clock);
assert.equal(result.tradeCount,40);
assert.equal(result.buyVolume,8);
assert.equal(result.sellVolume,0);
assert.ok(result.deltaPct>99&&result.priceChangeBps>0,
 'chronological direction can disagree with actual aggressor side');
assert.equal(coinbase([cb[0],cb[0]],clock).tradeCount,1,
 'duplicate trade id cannot double-count volume');
assert.equal(coinbase([cb[0],{...cb[0],size:'0.3'}],clock).tradeCount,0,
 'conflicting duplicate id is excluded, not chosen arbitrarily');
assert.equal(coinbase([{...cb[0],time:new Date(clock+2000).toISOString()}],clock).tradeCount,0);
assert.equal(coinbase([{...cb[0],time:new Date(clock-35000).toISOString()}],clock).tradeCount,0);
assert.equal(coinbase([{...cb[0],side:'not-a-maker'}],clock).tradeCount,0);
assert.equal(coinbase([{...cb[0],trade_id:'unknown'}],clock).tradeCount,0);
assert.equal(coinbase(cb,clock+35000).tradeCount,0);

const okxRows=Array.from({length:30},(_,i)=>({
 tradeId:String(100000+i),ts:String(clock-1000-i*75),
 px:String(62010+i),sz:'0.1',side:'sell'
}));
const okxFlow=okx(okxRows,clock);
assert.equal(okxFlow.tradeCount,30);
assert.ok(okxFlow.deltaPct<-99,'OKX side is taker/aggressor, NOT Coinbase maker side');
assert.equal(okx([okxRows[0],okxRows[0]],clock).tradeCount,1);
assert.equal(okx([{...okxRows[0],ts:String(clock+4000)}],clock).tradeCount,0);

(async()=>{
 const a=liquidity(true),b=liquidity(true);
 assert.equal(a,b,'five source requests must collapse while first snapshot is pending');
 assert.equal(calls.length,5,'BTC liquidity should fetch five exchange endpoints once');
 const unavailable=()=>({ok:false,status:503,json:async()=>({})});
 pending.splice(0).forEach(done=>done(unavailable()));
 const first=await a;
 assert.equal(first.ok,false,'exchange failure never manufactures directional flow');
 const c=liquidity(true);
 assert.equal(calls.length,10,'a completed request can trigger the next snapshot');
 pending.splice(0).forEach(done=>done(unavailable()));
 await c;
 console.log('PASS: verified Coinbase maker inversion, OKX taker flow, dedup, stale guards and coalesced BTC requests');
})().catch(e=>{console.error(e);process.exitCode=1;});
