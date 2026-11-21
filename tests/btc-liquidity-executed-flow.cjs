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
assert.ok(Math.abs(result.buyVolume-8)<1e-8);
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
const select=exportsRef.selectBtcExecutedFlow;
const cbFlow=coinbase(cb,clock);
assert.equal(select({coinbaseValid:true,okxValid:true,
 coinbase:cbFlow,okx:okxFlow}).venue,'COINBASE',
 'Coinbase stays primary when its observed executions are fresh');
const okxSelected=select({coinbaseValid:false,okxValid:true,
 coinbase:cbFlow,okx:okxFlow});
assert.equal(okxSelected.venue,'OKX','never mix a stale Coinbase tape with OKX');
assert.equal(okxSelected.deltaPct,okxFlow.deltaPct);
assert.equal(okxSelected.priceChangeBps,okxFlow.priceChangeBps);
assert.equal(select({coinbaseValid:false,okxValid:false,
 coinbase:cbFlow,okx:okxFlow}).venue,'NONE');
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
 // Live-like fallback: Coinbase trades HTTP429, but OKX executed taker sales
 // and an independent Kraken L2 remain genuinely fresh. Neither Coinbase
 // executed volume nor BTC-USD market prints are forged.
 const kTime=(clock-850)/1000;
 const kb=Array.from({length:25},(_,i)=>[
   String(62000-i*.15),String(1.1+(i%4)*.05),kTime]);
 const ka=Array.from({length:25},(_,i)=>[
   String(62000.35+i*.15),String(.95+(i%4)*.05),kTime]);
 const okxDepth={
  data:[{ts:String(clock-850),
   bids:kb.map(([v,q])=>[v,q,'0','1']),
   asks:ka.map(([v,q])=>[v,q,'0','1'])}]
 };
 const okxTape={data:Array.from({length:65},(_,i)=>({
   tradeId:String(330000+i),ts:String(clock-900-i*29),
   px:'62000.15',sz:'0.1',side:'sell'
 }))};
 const valid=r=>({ok:true,status:200,json:async()=>r});
 const invalid=()=>({ok:false,status:429,json:async()=>({error:'rate limited'})});
 const next=liquidity(true);
 assert.equal(calls.length,15);
 const latest=pending.splice(0);
 latest.forEach((resolve,i)=>resolve(i===0?valid({bids:[['62000','1']],asks:[['62000.35','1']]}):
   i===1?valid({result:{'XXBTZUSD':{bids:kb,asks:ka}}}):
   i===2?invalid():
   i===3?valid(okxDepth):valid(okxTape)));
 const snapshot=await next;
 assert.equal(snapshot.ok,true,'independent Kraken L2 and OKX taker must keep BTC research fed');
 assert.equal(snapshot.providers.coinbaseTrades,false);
 assert.equal(snapshot.providers.okxTrades,true);
 assert.equal(snapshot.providers.krakenDepth,true);
 assert.equal(snapshot.flow.venue,'OKX');
 assert.equal(snapshot.flow.tradeCount,65);
 assert.ok(snapshot.flow.deltaPct< -95);
 assert.equal(snapshot.absorption.side,'BUY','true aggressive OKX sales absorbed at flat OKX price');
 assert.match(snapshot.warnings.join(' '),/OKX BTC-USDT taker flow/);
 assert.equal(snapshot.flow.buyVolume,0);
 console.log('PASS: verified Coinbase maker inversion, OKX taker flow, dedup, stale guards, coalesced requests and HTTP429 fallback with independent Kraken depth');
})().catch(e=>{console.error(e);process.exitCode=1;});
