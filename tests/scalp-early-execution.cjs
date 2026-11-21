const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
// Keep production extensionless imports; use the actual TS calculation via
// transpile for Node's isolated CJS regression without changing Next bundles.
function transpiled(path,dependencies={}){
 const e={},code=ts.transpileModule(fs.readFileSync(path,'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
 }).outputText;
 vm.runInNewContext(code,{exports:e,require:id=>{
  if(!(id in dependencies))throw Error('unexpected test import '+id);
  return dependencies[id];
 }});
 return e;
}
const select=transpiled('lib/scalp-selection.ts',{
 './scalp-risk-policy':{requiredScalpNetR:()=>1.25}});
const {detectEarlyExecutionLead}=transpiled('lib/scalp-early-execution.ts',{
 './scalp-selection':select});
const now=Date.parse('2026-11-21T12:32:08Z'),minute=Math.floor(now/60000)*60000;
const candles=(close,side='BUY')=>Array.from({length:80},(_,i)=>({
 time:minute-(80-i)*60000,open:close,close,
 high:i===79&&side==='SELL'?100.96:100.8,
 low:i===79&&side==='BUY'?99.08:99.2,
 tickVolume:30
}));
const base={
 ok:true,source:'Coinbase trades Kraken depth OKX depth',checkedAt:now-900,quality:92,
 side:'BUY',strength:66,pressure:20,providers:{coinbaseBbo:true,coinbaseTrades:true,
  krakenDepth:true,okxDepth:true,okxTrades:true},
 book:{bestBid:99.46,bestAsk:99.52,depthImbalance:24,bboImbalance:10,
  weightedImbalance:22,microEdge:5,spreadBps:6,bidDepthUsd:100000,
  askDepthUsd:75000,bidWall:2,askWall:1,bidWallPrice:99.4,
  askWallPrice:100.6,wallSide:'BUY',microprice:99.49},
 flow:{tradeCount:70,buyVolume:12,sellVolume:28,deltaVolume:-16,
  deltaPct:-40,priceChangeBps:0,cvdSide:'SELL'},
 dynamics:{pressureChange:5,bidDepthChangePct:10,
  askDepthChangePct:-1,acceleration:5},
 absorption:{side:'BUY',score:86,reason:'observed taker sell absorption',
  trapDetected:true,followThrough:false},
 integrity:{status:'NORMAL',blockedSides:[],reasons:[]},warnings:[]
};
const buy={asset:'BTC',c1:candles(99.5,'BUY'),
 quote:{price:99.5,bid:99.46,ask:99.52,at:now-600,source:'Kraken XBT/USD'},
 liquidity:base,estimatedRoundTripCost:.10,now};
const r=detectEarlyExecutionLead(buy);
assert.equal(r.status,'ENTRY_CANDIDATE',r.reason+' '+r.blockers);
assert.equal(r.side,'BUY');
assert.equal(r.setup,'SWEEP_RECLAIM');
assert.equal(r.entryType,'BUY_LIMIT');
assert.ok(r.entry<=buy.quote.bid,'passive BUY must never chase Ask');
assert.ok(r.stop<r.entry&&r.target>r.entry);
assert.ok(r.netR>=1.25);
assert.equal(r.researchOnly,true);
assert.equal(r.brokerExecutionVerified,false);
const heavy=detectEarlyExecutionLead({...buy,estimatedRoundTripCost:1.1});
assert.equal(heavy.status,'COST_BLOCKED');
assert.equal(heavy.side,'BUY');
assert.equal(heavy.target,null);
const sellerBook={...base,side:'SELL',strength:66,
 book:{...base.book,bestBid:100.46,bestAsk:100.54,depthImbalance:-22},
 flow:{...base.flow,deltaPct:42,cvdSide:'BUY'},
 absorption:{...base.absorption,side:'SELL'},
 dynamics:{...base.dynamics,bidDepthChangePct:0,askDepthChangePct:9}};
const sell={...buy,c1:candles(100.5,'SELL'),
 quote:{price:100.5,bid:100.46,ask:100.54,at:now-900,source:'Kraken XBT/USD'},
 liquidity:sellerBook,estimatedRoundTripCost:.08};
const s=detectEarlyExecutionLead(sell);
assert.equal(s.status,'ENTRY_CANDIDATE',s.reason+' '+s.blockers);
assert.equal(s.side,'SELL');
assert.equal(s.setup,'SWEEP_RECLAIM');
assert.equal(s.entryType,'SELL_LIMIT');
assert.ok(s.entry>=sell.quote.ask,'SELL LIMIT should rest above Ask');
assert.ok(s.stop>s.entry&&s.target<s.entry);
assert.ok(s.netR>=1.25);
assert.equal(detectEarlyExecutionLead({...buy,liquidity:{...base,ok:false,
 integrity:{...base.integrity,status:'VENUE_CONFLICT'}}}).status,'VENUE_CONFLICT');
assert.equal(detectEarlyExecutionLead({...buy,liquidity:{...base,ok:false,
 integrity:{...base.integrity,status:'UNVERIFIED'}}}).status,'STALE');
assert.equal(detectEarlyExecutionLead({...buy,liquidity:{...base,
 integrity:{...base.integrity,status:'POSSIBLE_DEPTH_WITHDRAWAL'}}}).status,'STALE');
assert.equal(detectEarlyExecutionLead({...buy,liquidity:{...base,
 providers:{...base.providers,coinbaseTrades:false}}}).status,'WAIT');
const okxTakerFallback={...base,source:'OKX BTC-USDT taker / Kraken BTC-USD depth',
 providers:{...base.providers,coinbaseTrades:false,okxTrades:true,krakenDepth:true},
 flow:{...base.flow,venue:'OKX',tradeCount:35}};
const okxBuy=detectEarlyExecutionLead({...buy,liquidity:okxTakerFallback});
assert.equal(okxBuy.status,'ENTRY_CANDIDATE',okxBuy.reason);
assert.equal(okxBuy.side,'BUY');
assert.match(okxBuy.evidence.join(' '),/OKX BTC-USDT/);
assert.equal(okxBuy.researchOnly,true);
assert.equal(okxBuy.brokerExecutionVerified,false);
const okxSell=detectEarlyExecutionLead({...sell,liquidity:{
 ...sellerBook,providers:okxTakerFallback.providers,
 flow:{...sellerBook.flow,venue:'OKX',tradeCount:45}
}});
assert.equal(okxSell.status,'ENTRY_CANDIDATE');
assert.equal(okxSell.side,'SELL');
assert.equal(detectEarlyExecutionLead({...buy,liquidity:{
 ...okxTakerFallback,providers:{...okxTakerFallback.providers,krakenDepth:false}
}}).status,'WAIT','one OKX tape and its own OKX book cannot self-certify a sniper');
assert.equal(detectEarlyExecutionLead({...buy,liquidity:{
 ...okxTakerFallback,flow:{...okxTakerFallback.flow,venue:'OKX',tradeCount:7}
}}).status,'WAIT','insufficient OKX executions cannot enable entry research');
assert.equal(detectEarlyExecutionLead({...buy,liquidity:{
 ...okxTakerFallback,integrity:{...base.integrity,status:'VENUE_CONFLICT'}
}}).status,'VENUE_CONFLICT');

assert.equal(detectEarlyExecutionLead({...buy,liquidity:{...base,
 book:{...base.book,bestBid:96,bestAsk:96.1}}}).status,'VENUE_CONFLICT');
assert.equal(detectEarlyExecutionLead({...buy,quote:{...buy.quote,at:now-15000}}).status,'STALE');
assert.equal(detectEarlyExecutionLead({...buy,quote:{...buy.quote,ask:99.40}}).status,'STALE');
assert.equal(detectEarlyExecutionLead({...buy,c1:buy.c1.slice(0,20)}).status,'STALE');
assert.equal(detectEarlyExecutionLead({...buy,c1:[...buy.c1.slice(0,-2),{
  ...buy.c1.at(-2),time:buy.c1.at(-2).time+120000},buy.c1.at(-1)]}).status,'STALE');
assert.equal(detectEarlyExecutionLead({...buy,asset:'GOLD'}).side,'WAIT');
assert.equal(detectEarlyExecutionLead({...buy,liquidity:{...base,
 flow:{...base.flow,deltaPct:40}}}).side,'WAIT');
assert.equal(detectEarlyExecutionLead({...buy,liquidity:{...base,
 integrity:{...base.integrity,blockedSides:['BUY']}}}).status,'COST_BLOCKED');
const ui=fs.readFileSync('components/ScalpDesk.tsx','utf8');
const desk=fs.readFileSync('lib/scalp-desk.ts','utf8');
assert.match(ui,/early\.status==='COST_BLOCKED'/);
assert.match(ui,/early\.status==='ENTRY_CANDIDATE'/);
assert.match(desk,/detectEarlyExecutionLead\(\{asset,c1:/,
 'BTC early-flow remains live in the asset-specific branch next to GOLD');
assert.doesNotMatch(desk,/executionEnabled\s*:\s*true/);
console.log('PASS: bid-ask-causal BTC BUY and SELL sweep absorption pre-entry, no venue spoof, no late/future candles, costed passive limit and UI research-only');
