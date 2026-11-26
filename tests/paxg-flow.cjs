const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const context={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/paxg-flow.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,context);
const {readPaxgFlow,readKrakenPaxgFlow}=context.exports;
const now=100000,levels=[0,1,2,3,4];
const book=buy=>({bids:levels.map(i=>[100-i,buy?4:1]),asks:levels.map(i=>[101+i,buy?1:4])});
const trades=buy=>levels.map(i=>({a:i,q:'1',T:now-i*1000,m:!buy}));
assert.equal(readPaxgFlow(book(true),trades(true),now).side,'BUY');
assert.equal(readPaxgFlow(book(false),trades(false),now).side,'SELL');
assert.equal(readPaxgFlow(book(false),trades(true),now).side,'NEUTRAL');
assert.equal(readPaxgFlow(book(true),trades(true),now+16000).side,'UNAVAILABLE');
assert.equal(readPaxgFlow(book(true),Array(5).fill(trades(true)[0]),now).side,'UNAVAILABLE');
assert.equal(readPaxgFlow(book(true),trades(true),now-6000).side,'UNAVAILABLE');
const tapeOnly=readPaxgFlow({},trades(true),now);
assert.equal(tapeOnly.side,'NEUTRAL');
assert.equal(tapeOnly.depthAvailable,false);
assert.equal(tapeOnly.depthImbalancePct,undefined);
assert.equal(tapeOnly.buyVolume,5);
assert.equal(tapeOnly.sellVolume,0);
assert.equal(tapeOnly.deltaVolume,5);
assert.equal(tapeOnly.tradeDeltaPct,100);
assert.equal(tapeOnly.coverageSeconds,4);
assert.equal(readPaxgFlow({},[],now).side,'UNAVAILABLE');
console.log('PASS PAXG book and trade alignment, conflict, freshness and deduplication');

const krakenTrades=buy=>levels.map((i)=>[
  String(100+i*.01),'1',(now-i*1000)/1000,buy?'b':'s','m','',String(i)
]);
assert.equal(readKrakenPaxgFlow(book(true),krakenTrades(true),now).side,'BUY',
  'Kraken spot depth and genuinely executed buys can agree on BUY');
assert.equal(readKrakenPaxgFlow(book(false),krakenTrades(false),now).side,'SELL');
assert.equal(readKrakenPaxgFlow(book(true),krakenTrades(false),now).side,'NEUTRAL',
  'Kraken depth/tape disagreement is never forced to a signal');
assert.equal(readKrakenPaxgFlow(book(true),krakenTrades(true),now+16000).side,'UNAVAILABLE',
  'Kraken historical print timestamps cannot be freshened at fetch time');
assert.equal(readKrakenPaxgFlow(book(true),krakenTrades(true),now-5000).side,'UNAVAILABLE',
  'Kraken future prints are discarded');
assert.equal(readKrakenPaxgFlow(book(true),Array(5).fill(krakenTrades(true)[0]),now).side,
  'UNAVAILABLE','duplicated trade rows cannot manufacture flow pressure');
const kt=readKrakenPaxgFlow({},krakenTrades(false),now);
assert.equal(kt.side,'NEUTRAL');
assert.equal(kt.depthAvailable,false);
assert.equal(kt.sellVolume,5);
assert.equal(kt.deltaVolume,-5);
assert.equal(kt.tradeDeltaPct,-100);
assert.match(readKrakenPaxgFlow(book(true),krakenTrades(true),now).source,/Kraken PAXG\/USD/,
  'proxy must name its true venue instead of claiming Exness XAU DOM');
const route=fs.readFileSync('app/api/paxg-flow/route.ts','utf8');
assert.match(route,/Depth\?pair=PAXGUSD/);
assert.match(route,/Trades\?pair=PAXGUSD/);
assert.match(route,/independentFlowSlot\(binanceSample,freshVenue,5000\)/);
assert.match(route,/independentFlowSlot\(krakenSample,freshVenue,5000\)/);
assert.match(route,/collectIndependentFlow\(slots\)/,
  'independent venues refresh without blocking the available tape');
assert.match(route,/venueSamples:fresh/,'retain actual venue identities; never combine raw contract sizes');
assert.match(route,/krakenRetryAt/,'rate limited Kraken must have independent backoff');
const panel=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
assert.match(panel,/visiblePreOpen\.proxySource/,
  'the real exchange name must be shown instead of hardcoded Binance');
console.log('PASS Kraken independent PAXG depth and executed trade fallback; no synthetic XAU DOM');

// Executed volume and price response must be measured on the same prints.
for(const buy of [true,false]){
 const rows=Array.from({length:12},(_,i)=>({a:i,q:'1',T:now-11000+i*1000,m:!buy,p:100+(buy?-1:1)*i*.01}));
 const result=readPaxgFlow(null,rows,now);
 assert.equal(result.absorptionWatch,buy?'SELL':'BUY');
 assert.equal(result.side,'NEUTRAL');
 assert.equal(readPaxgFlow(null,rows.map(t=>({...t,p:undefined})),now).absorptionWatch,undefined);
 assert.equal(readPaxgFlow(null,rows,now+9000).absorptionWatch,undefined);
}
const accelerating=Array.from({length:18},(_,i)=>({a:i,q:'1',T:now-17000+i*1000,m:i<8,p:100+i*.001}));
assert.equal(readPaxgFlow(null,accelerating,now).accelerationSide,'BUY');
console.log('PASS PAXG price response, absorption and separate short-window acceleration without a depth vote');
