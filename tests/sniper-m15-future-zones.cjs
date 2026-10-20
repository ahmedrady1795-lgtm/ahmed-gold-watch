const assert=require('node:assert/strict'),fs=require('node:fs'),
 vm=require('node:vm'),ts=require('typescript');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/sniper-m15-future-zones.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:mod,exports:mod.exports});
const {futureM15WatchZones,conditionalM15BreakoutLevels}=mod.exports;
const now=Date.parse('2026-10-20T09:30:05Z');
const time=Math.floor(now/900000)*900000-900000;
const history=Array.from({length:42},(_,i)=>{
 const p=82000+Math.sin(i*.44)*55;
 return {time:time-(41-i)*900000,open:p,close:p+4,
   high:p+22,low:p-22};
});
const z=(kind,low,high)=>({kind,low,high,label:'closed',
 source:'سعر M15 مغلق',confirmedAt:now-900000});
const layers={ready:true,reason:'',phase:'',context:null,events:[],zones:[
 z('SUPPLY',82100,82145),z('DEMAND',81895,81934),
 z('HIGH_POOL',82195,82205),z('LOW_POOL',81798,81802)
]};
const first=futureM15WatchZones({now,history,liquidity:layers,
 sourceReady:true});
assert.equal(first.length,4,'four evidence-grounded labels in prospective half');
assert.deepEqual(Array.from(first,x=>x.key),[
 'SUPPLY','DEMAND','HIGH_POOL','LOW_POOL']);
assert.ok(first.every(x=>x.historical&&x.actionable===false&&
 x.low<=x.price&&x.high>=x.price));
assert.ok(first.find(x=>x.key==='DEMAND').confirm>
 first.find(x=>x.key==='DEMAND').high);
assert.ok(first.find(x=>x.key==='SUPPLY').confirm<
 first.find(x=>x.key==='SUPPLY').low);
const noContext=futureM15WatchZones({now,history,
 liquidity:{...layers,ready:false},sourceReady:true});
assert.equal(noContext.length,0,'no fake live liquidity on stale history');
assert.equal(futureM15WatchZones({now,history,
 liquidity:layers,sourceReady:false}).length,0);
const fakedFuture={...layers,zones:[z('SUPPLY',82100,82145),
 {...z('DEMAND',81895,81934),confirmedAt:now+900000}]};
assert.equal(futureM15WatchZones({now,history,liquidity:fakedFuture,
 sourceReady:true}).some(x=>x.key==='DEMAND'),false,
 'no future-confirmed zone permitted');
const overlap={...layers,zones:[z('SUPPLY',82100,82145),
 z('HIGH_POOL',82123,82135)]};
assert.equal(futureM15WatchZones({now,history,liquidity:overlap,
 sourceReady:true}).length,1,'crowded identical-price zones are not double-labelled');
const range=conditionalM15BreakoutLevels({now,history,sourceReady:true});
assert.equal(range.valid,true,'WAIT still has both true breakout boundaries');
assert.ok(Math.abs(range.upper-Math.max(...history.slice(-12).map(b=>b.high)))<.0001);
assert.ok(Math.abs(range.lower-Math.min(...history.slice(-12).map(b=>b.low)))<.0001);
assert.match(range.note,/شرط/);
const bad=[...history];bad[bad.length-1]={...bad.at(-1),
 time:bad.at(-1).time+1000};
assert.equal(conditionalM15BreakoutLevels({now,history:bad,
 sourceReady:true}).valid,false,'broken M15 feed blocks levels');
const comp=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
assert.match(comp,/className="sniper-m15-future-zone"/);
assert.match(comp,/showLiquidity&&forwardLabels\.map/);
assert.match(comp,/forwardSnapshot/);
assert.match(comp,/prev\?\.key===candleKey\?prev/,
 'forecast-side historical levels cannot change on every tick');
assert.match(comp,/conditionalM15BreakoutLevels/);
assert.match(comp,/safeSide==='WAIT'&&conditionalRange\.valid/,
 'BTC WAIT gets historical boundary prices, not a fake direction');
assert.match(comp,/stable\.goals\.filter\(g=>stable\.scenario\.touches\.includes\(g\.stage\)\)/,
 'unreached far H1/H4 structural pivot must not be called reachable M15 TP');
assert.match(comp,/const stop=stable\?\.stop\?\?null/,
 'orphan stop must not appear when no active frozen M15 path exists');
assert.doesNotMatch(comp,/const goals=stable\?\.goals\?\?/,
 'unverified structural goals cannot flatten future chart vertical scale');
console.log('PASS: future-side BUY/SELL test zones, WAIT bounds, exact closed prices, immutable bands and realistic TP rail');
