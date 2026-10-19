const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path){
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
 }).outputText,{module,exports:module.exports,require,Math,Map,Number},
 {filename:path});
 return module.exports;
}
const live=load('lib/sampled-live-candle.ts');
const strategy=load('lib/next-candle-strategies.ts');
const now=Date.parse('2026-10-19T08:24:15.000Z'),minute=Math.floor(now/60000)*60000;
const base={now,at:now-600,price:100,sourceKey:'Coinbase WebSocket',
  historicalSource:'Coinbase BTC-USD · closed M1',lastClosedAt:minute};
let bar=live.updateSampledLiveCandle(null,base);
assert.equal(bar.open,100);
assert.equal(bar.high,100);
assert.equal(bar.low,100);
assert.equal(bar.count,1);
assert.equal(bar.matchedVenue,true);
bar=live.updateSampledLiveCandle(bar,{...base,at:now-400,price:101});
bar=live.updateSampledLiveCandle(bar,{...base,at:now-200,price:99});
assert.equal(bar.high,101);
assert.equal(bar.low,99);
assert.equal(bar.close,99);
assert.equal(bar.open,100,'first observed tick only (not historic exchange minute open)');
assert.equal(bar.count,3);
assert.equal(live.updateSampledLiveCandle(bar,{...base,at:now-500,price:120}).close,99,
 'out-of-order tick cannot repaint observed live candle');
assert.equal(live.visibleSampledLiveCandle(bar,now,minute,base.sourceKey,base.historicalSource)?.close,99);
assert.equal(live.visibleSampledLiveCandle(bar,now+60000,minute,base.sourceKey,base.historicalSource),null,
 'candle cannot remain marked LIVE after minute rolls');
assert.equal(live.updateSampledLiveCandle(bar,{...base,historicalSource:'Kraken XBT/USD'}).matchedVenue,false,
 'venue mismatch must be explicit and suppress next qualified drawing');
assert.equal(live.updateSampledLiveCandle(bar,{...base,at:now-14000}),null,'old ticks are not live');
assert.equal(live.updateSampledLiveCandle(bar,{...base,lastClosedAt:minute-120000}),null,'feed gaps block live construction');
const closedNow=Date.parse('2026-10-19T08:24:00.000Z');
const rows=Array.from({length:250},(_,i)=>{
 const open=100+i*.24,close=open+.18;
 return {time:closedNow-(250-i)*60000,open,close,high:close+.12,low:open-.12};
});
const s=strategy.analyzeNextCandleStrategies(rows,closedNow);
assert.ok(s.strategy,'select one of six technical methods using old closed M1');
assert.equal(s.side,'BUY');
assert.ok(s.train.n>=20&&s.holdout.n>0);
assert.equal(s.edgeSupported,false,
 '100 percent accuracy shared with naive direction has NO independent edge');
assert.equal(s.status,'TECHNICAL_ONLY');
const c=strategy.illustrativeNextCandle({study:s,anchor:160,minute:closedNow,enabled:true});
assert.ok(c&&c.time===closedNow+60000&&c.close>c.open);
assert.ok(c.high>=c.close&&c.low<=c.open);
assert.equal(c.illustrative,true);
assert.equal(c.validated,false);
assert.equal(strategy.illustrativeNextCandle({study:s,anchor:160,minute:closedNow,enabled:false}),null);
const future={...rows.at(-1),time:closedNow,close:900,high:900};
const futureIgnored=strategy.analyzeNextCandleStrategies([...rows,future],closedNow);
assert.equal(JSON.stringify(futureIgnored),JSON.stringify(s),
 'unfinished future bar must not enter historical model training or scoring');
const broken=rows.map(x=>({...x}));broken.at(-8).time+=30000;
assert.equal(strategy.analyzeNextCandleStrategies(broken,closedNow).status,'UNAVAILABLE',
 'M1 gaps and invalid timestamps reject predictive model');
assert.equal(strategy.analyzeNextCandleStrategies(rows.slice(-90),closedNow).status,'UNAVAILABLE',
 'no invented accuracy or direction without samples');
const ui=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
assert.match(ui,/className="sniper-sampled-live-candle"/);
assert.match(ui,/className="sniper-ai-next-candle"/);
assert.match(ui,/sniper-live-next-status/);
assert.match(ui,/ref=\{chartScrollRef\}/,'scroll should initially center LIVE and AI NEXT');
assert.match(ui,/nextX=xf\+9\+futureStride\*\.5/);
assert.match(ui,/ghostXs=visualCandles\.map\(\(_,i\)=>xf\+9\+\(i\+1\.5\)\*futureStride\)/,
 'TP route starts after NEXT, not on top of real-time M1 forecast');
assert.match(ui,/Math\.abs\(m\.price-rawQuote\)/,
 'live candle sampled only from the actual displayed quote');
assert.match(ui,/nextCandle=illustrativeNextCandle/);
const page=fs.readFileSync('app/page.tsx','utf8');
assert.match(page,/source:btcDirectFresh\?btcSource:/,
 'pass quote venue to prevent cross-exchange live OHLC mixing');
const btcRoute=fs.readFileSync('app/api/btc/route.ts','utf8');
assert.match(btcRoute,/if\(requested==='kraken'\)/,'Kraken chart must request timestamped Kraken trades');
assert.match(btcRoute,/return ok\(await krakenTrades\(now\),now\)/,
 'Kraken quote must be an actual timed trade, not an invented ticker timestamp');
assert.match(page,/\/api\/btc\?source='\+wanted/,'BTC REST quote venue follows the M1 candle provider');
assert.match(page,/if\(\/kraken\/i\.test\(String\(chartDataRef\.current\?\.bitcoin\?\.candleSource/,
 'Coinbase WS is not allowed to overwrite the live Kraken chart lane');
console.log('PASS: causally sampled LIVE M1, vendor separation, first next candle, six train/holdout strategies, no imaginary edge');
