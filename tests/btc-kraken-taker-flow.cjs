const assert=require('node:assert/strict'),fs=require('node:fs'),
 vm=require('node:vm'),ts=require('typescript');
const module_={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/btc-orderflow.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:module_,exports:module_.exports});
const {normalizeKrakenTrades:normalize,buildBtcOrderflow:build,
 btcOrderflowMatchesChart:matches,normalizeCoinbaseTrades}=module_.exports;
const now=Date.parse('2026-11-21T16:32:00Z');
const rows=Array.from({length:130},(_,i)=>[
 String(i<75?60005:i<100?60000:60010),String(.12),((now-1000-i*360)/1000).toFixed(5),
 i<80?'b':'s','m','',910000+i
]);
const kraken=normalize(rows,now);
assert.equal(kraken.length,130);
assert.equal(kraken.at(-1).aggressor,'BUY','Kraken b is a TAKER BUY, never invert like Coinbase');
assert.equal(kraken[0].aggressor,'SELL','Kraken s is a TAKER SELL');
assert.equal(normalize([rows[0],rows[0]],now).length,1,'repeated Kraken trade IDs are not counted twice');
assert.equal(normalize([rows[0],[...rows[0].slice(0,1),'4.0',...rows[0].slice(2)]],now).length,0,
 'conflicted duplicate Kraken trade IDs are discarded');
assert.equal(normalize([[...rows[0].slice(0,2),(now+15000)/1000,...rows[0].slice(3)]],now).length,0,
 'future execution timestamp cannot become live');
assert.equal(normalize([[...rows[0].slice(0,3),'x',...rows[0].slice(4)]],now).length,0);
assert.equal(normalize([[...rows[0].slice(0,6),'bogus-id']],now).length,0);
assert.equal(normalize(rows,now+13*60000).length,0);
const profile=build(kraken,now,1000,'Kraken XBT/USD');
assert.equal(profile.ok,true);
assert.equal(profile.source,'Kraken XBT/USD');
assert.equal(profile.profile.volumeBtc,15.6);
assert.equal(profile.coverage.completeSession,false,'an incomplete poll must not pretend full exchange history');
assert.equal(profile.actionable,false,'Kraken order flow is chart research, not Exness execution');
assert.equal(profile.venueComplete,false);
assert.equal(profile.flow.buyBtc,9.6,'Kraken taker BUY volume must not be flipped');
assert.equal(profile.flow.sellBtc,6);
assert.ok(profile.footprint.length>=1);
assert.equal(build(kraken,now+50000,1000,'Kraken XBT/USD').source,'Kraken XBT/USD');
assert.equal(build(kraken,now+50000,1000,'Kraken XBT/USD').status,'STALE');
assert.equal(matches('Kraken XBT/USD · fresh-candle fallback',
 'Kraken XBT/USD Trades','Kraken XBT/USD'),true);
assert.equal(matches('Coinbase BTC-USD · extended M1',
 'Coinbase WebSocket','Coinbase Exchange BTC-USD'),true);
assert.equal(matches('Kraken XBT/USD · fresh-candle fallback',
 'Kraken XBT/USD Trades','Coinbase Exchange BTC-USD'),false,
 'Coinbase trade prints cannot vote on a Kraken live chart');
assert.equal(matches('Kraken XBT/USD · fresh-candle fallback',
 'Coinbase WebSocket','Kraken XBT/USD'),false);
assert.equal(matches('Coinbase BTC-USD · extended M1',
 'Coinbase WebSocket','Kraken XBT/USD'),false);
assert.equal(matches('unknown BTC market','Kraken XBT/USD Trades','Kraken XBT/USD'),false);
const cb=normalizeCoinbaseTrades([{trade_id:45,time:new Date(now-1000).toISOString(),
 price:'60000',size:'0.1',side:'sell'}],now);
assert.equal(cb[0].aggressor,'BUY','Coinbase maker SELL is inverted to taker BUY');
const route=fs.readFileSync('app/api/orderflow/route.ts','utf8');
const chart=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const obs=fs.readFileSync('lib/sniper-order-flow-observation.ts','utf8');
assert.match(route,/api\.kraken\.com\/0\/public\/Trades\?pair=XBTUSD&count=1000/);
assert.match(route,/venue==='kraken'/);
assert.match(route,/normalizeKrakenTrades\(rows,now\)/);
assert.match(route,/let krakenTape:ExecutedTrade\[\]=\[\]/);
assert.match(route,/let tape:ExecutedTrade\[\]=\[\]/);
assert.match(route,/return Response\.json\(\{ok:false,source:'Kraken XBT\/USD'/);
assert.match(chart,/orderflow\?venue=kraken/);
assert.match(chart,/actualFlowSameVenue=asset==='BTC'\?/);
assert.match(chart,/btcOrderflowMatchesChart\(x\?\.candleSource,liveQuote\?\.source/);
assert.match(chart,/sourceMatches:actualFlowSameVenue/);
assert.match(obs,/دلتا صفقات Kraken المنفذة/);
console.log('PASS: Kraken XBT/USD true taker side, real trade IDs, dedup, timestamp guards, strict quote/candle/tape source and no fictional Exness fills');
