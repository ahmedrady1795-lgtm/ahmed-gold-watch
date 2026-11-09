const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
function load(path){
 const holder={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
 }).outputText,{module:holder,exports:holder.exports});
 return holder.exports;
}
const {buildMt5QuoteProfile}=load('lib/mt5-quote-profile.ts');
const {assessFlowProfile,flowAvailableBeforeM1}=load('lib/flow-profile-decision.ts');
const {fuseLocalSniper}=load('lib/sniper-local-fusion.ts');
const now=Date.parse('2026-11-07T16:00:00.000Z');
const ticks=Array.from({length:23},(_,i)=>{
 const mid=4000+(i%3)*.04,at=now-13000+i*550;
 return {at,receivedAt:at,price:mid,bid:mid-.05,ask:mid+.05};
});
const quoteProfile=buildMt5QuoteProfile(ticks,now);
assert.equal(quoteProfile.ready,true);
assert.equal(quoteProfile.basis,'QUOTE_UPDATE_COUNT');
assert.ok(quoteProfile.poc>=quoteProfile.val&&quoteProfile.poc<=quoteProfile.vah);
assert.equal(quoteProfile.actionable,false);
const slowTicks=Array.from({length:13},(_,i)=>{
 const at=now-65000+i*5000,mid=4000+(i%3)*.08;
 return {at,receivedAt:at,price:mid,bid:mid-.05,ask:mid+.05};
});
const slowProfile=buildMt5QuoteProfile(slowTicks,now);
assert.equal(slowProfile.ready,true,
 'five-second MT5 polls should eventually provide an indicative profile');
assert.equal(slowProfile.samples,13);
const warming=buildMt5QuoteProfile(slowTicks.slice(-6),now);
assert.equal(warming.ready,false);
assert.equal(warming.samples,6,'warm-up sample counts must not be zeroed');
assert.equal(buildMt5QuoteProfile(slowTicks,now+15000).ready,false,
 'stale quotes must not pass a live-profile check');
assert.equal(buildMt5QuoteProfile(ticks,now+50000).ready,false);
const btc={
 ok:true,status:'LIVE_SAMPLE',asOf:now-2000,fetchedAt:now-1700,
 source:'Coinbase Exchange BTC-USD',
 coverage:{from:now-25000,to:now-2000,trades:100,seconds:23,
 completeSession:false,completeMinutes:false,maxPerRequest:1000},
 profile:{poc:100,vwap:100.4,vah:103,val:98,binSize:1,rows:[{price:99},{price:101}]},
 flow:{deltaPct:33}
};
const buy=assessFlowProfile({asset:'BTC',price:101,now,sourceMatches:true,
 observedAt:now-1000,btc});
assert.equal(buy.ready,true);
assert.equal(buy.side,'BUY');
assert.equal(buy.profileBasis,'EXECUTED_TRADES');
assert.equal(buy.confirmed,true);
assert.equal(buy.actionable,false);
assert.equal(assessFlowProfile({asset:'BTC',price:101,now,sourceMatches:false,btc}).ready,false);
assert.equal(assessFlowProfile({asset:'BTC',price:101,now,sourceMatches:true,
 btc:{...btc,asOf:now-20000}}).ready,false);
assert.equal(assessFlowProfile({asset:'BTC',price:101,now,sourceMatches:true,
 btc:{...btc,flow:{deltaPct:-35}}}).side,'WAIT');
assert.equal(assessFlowProfile({asset:'BTC',price:101,now,sourceMatches:true,
 btc,bookSide:'SELL'}).side,'WAIT');
const issuedAt=now;
assert.equal(flowAvailableBeforeM1({...buy,observedAt:now-1000,
 asOf:now-2000},issuedAt),true);
assert.equal(flowAvailableBeforeM1({...buy,observedAt:now+1},issuedAt),false,
 'flow fetched after issue must never rewrite the candle');
assert.equal(flowAvailableBeforeM1({...buy,asOf:now+1},issuedAt),false,
 'trade after issue is not evidence before issue');
assert.equal(flowAvailableBeforeM1({...buy,observedAt:null},issuedAt),false);
const dom={
 available:true,asOf:now-1200,samples:4,imbalancePct:35
};
const gold=assessFlowProfile({asset:'GOLD',price:4000.09,now,
 observedAt:now-600,sourceMatches:true,gold:{
 mode:'broker',brokerSymbol:'XAUUSDm',brokerDepth:dom,
 quoteProfile:{...quoteProfile,poc:4000.04,val:4000,vah:4000.12,
 directionalPct:38,asOf:now-1300}
}});
assert.equal(gold.ready,true);
assert.equal(gold.quality,'INDICATIVE_BROKER');
assert.equal(gold.confirmed,false);
assert.equal(gold.actionable,false);
const noDom=assessFlowProfile({asset:'GOLD',price:4000.09,now,
 sourceMatches:true,gold:{mode:'broker',brokerSymbol:'XAUUSDm',
 brokerDepth:null,quoteProfile}});
assert.equal(noDom.ready,false);
assert.equal(noDom.profileReady,true,'quote-only POC should be observable without DOM');
assert.equal(noDom.orderFlowReady,false);
assert.equal(noDom.side,'WAIT','missing DOM must not invent flow direction');
assert.equal(noDom.profileBasis,'QUOTE_UPDATES');
assert.equal(noDom.confirmed,false);
assert.equal(noDom.actionable,false);
const input={marketOpen:true,fresh:true,providerTransition:false,
 preMove:{ok:true,stage:'ARMED',side:'BUY'},
 hunt:{ready:true,referenceOnly:false,observation:{quality:'CLEAR',
 conflicting:false},preferred:'BUY'},
 m1:{ready:true,side:'BUY'},
 liquidity:{ready:false},flowProfile:buy};
assert.equal(fuseLocalSniper(input).side,'BUY');
assert.equal(fuseLocalSniper({...input,flowProfile:{...buy,side:'SELL'}}).side,'WAIT',
 'strong opposing order flow cannot mint a bullish scenario');
assert.equal(fuseLocalSniper({...input,flowProfile:null}).side,'BUY',
 'missing sample does not become a fabricated SELL flow');
const noM15=fuseLocalSniper({...input,m15Fresh:false,flowProfile:null,
 preMove:{ok:false,stage:'WAIT',side:'WAIT'}});
assert.equal(noM15.m15,'WAIT','stale M15 cannot vote in M1-only observation');
assert.equal(noM15.m1,'BUY','fresh M1 should remain visible when M15 is stale');
assert.equal(noM15.tradeAuthorized,false);
console.log('Flow profile and next-candle causality tests passed');
