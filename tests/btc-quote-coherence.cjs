const assert=require('node:assert/strict'),fs=require('node:fs'),
 ts=require('typescript'),vm=require('node:vm');
const exports_={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/btc-quote-coherence.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{exports:exports_});
const {btcVenue,btcQuoteMatchesChart,acceptBtcQuote}=exports_;
const now=Date.parse('2026-11-21T17:15:40Z');
const kraken='Kraken XBT/USD · fresh-candle fallback';
const cb='Coinbase BTC-USD · extended M1';
assert.equal(btcVenue(kraken),'KRAKEN');
assert.equal(btcVenue('Kraken XBT/USD Trades'),'KRAKEN');
assert.equal(btcVenue(cb),'COINBASE');
assert.equal(btcQuoteMatchesChart(kraken,'Coinbase Exchange'),false);
assert.equal(btcQuoteMatchesChart(kraken,'Kraken XBT/USD Trades'),true);
assert.equal(btcQuoteMatchesChart(cb,'Coinbase WebSocket'),true);
assert.equal(btcQuoteMatchesChart('unavailable','Kraken XBT/USD Trades'),false);
const observed=acceptBtcQuote({
 chartSource:kraken,quoteSource:'Kraken XBT/USD Trades',
 at:now-1500,now,previous:null
});
assert.equal(observed.venue,'KRAKEN');
assert.equal(observed.at,now-1500);
assert.equal(acceptBtcQuote({
 chartSource:kraken,quoteSource:'Kraken XBT/USD Trades',
 at:now-4500,now,previous:observed}),null,
 'an older REST reply cannot overwrite a newer accepted live tick');
assert.equal(acceptBtcQuote({
 chartSource:kraken,quoteSource:'Kraken XBT/USD Trades',
 at:now-12000,now,previous:observed}),null,
 'a delayed REST response cannot clear a previous valid live price');
assert.equal(acceptBtcQuote({
 chartSource:kraken,quoteSource:'Coinbase Exchange',
 at:now-300,now,previous:observed}),null,
 'current Coinbase quote cannot be called LIVE on Kraken candles');
assert.equal(acceptBtcQuote({
 chartSource:cb,quoteSource:'Coinbase WebSocket',
 at:now-500,now,previous:observed}).venue,'COINBASE',
 'a complete provider transition accepts fresh same-venue source immediately');
assert.equal(acceptBtcQuote({
 chartSource:cb,quoteSource:'Coinbase WebSocket',
 at:now+5000,now,previous:null}),null,
 'future quotes must not become prematurely live');
assert.equal(acceptBtcQuote({
 chartSource:cb,quoteSource:'Coinbase Spot · time unknown',
 at:0,now,previous:null}),null,
 'timeless prices must never qualify for LIVE');
const page=fs.readFileSync('app/page.tsx','utf8');
assert.match(page,/btcObserved=useRef<ObservedBtcQuote\|null>/);
assert.match(page,/const observed=j\?\.status==='live'/);
assert.doesNotMatch(page,/setBtcAt\(timedLive\?at:0\)/,
 'delayed poll must not erase last good BTC live exchange timestamp');
assert.match(page,/btcQuoteMatchesChart\(btcChartSource,btcSource\)/);
assert.match(page,/btcQuoteMatchesChart\(btcChartSource,aiData\?\.bitcoin\?\.candleSource\)/);
console.log('PASS: BTC Kraken/Coinbase venue-matched, monotonic, time-fresh live quote; no late REST rollback and no mixed-source UI signals');
