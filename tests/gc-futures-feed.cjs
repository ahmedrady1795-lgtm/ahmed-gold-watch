const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),
 ts=require('typescript');
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(
 fs.readFileSync('lib/gc-futures-feed.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:m,exports:m.exports});
const {parseYahooGC,parseLicensedGC}=m.exports;
const now=Date.UTC(2026,9,20,19,0,30),start=now-12*60000-30000;
const raw=(symbol='GC=F')=>({chart:{result:[{meta:{symbol},timestamp:
 Array.from({length:10},(_,i)=>(start+i*60000)/1000),
 indicators:{quote:[{close:
 Array.from({length:10},(_,i)=>4100+i*.4)}]}}],error:null}});
const delayed=parseYahooGC(raw(),now);
assert.equal(delayed.available,true,'accept genuine sourced GC=F minute quotes');
assert.equal(delayed.status,'DELAYED','never upgrade Yahoo snapshot to true CME live');
assert.equal(delayed.directContract,false,'vendor continuation is not delivery GCZ26');
assert.equal(delayed.eligibleForLead,false,'delayed GC cannot lead spot');
assert.equal(delayed.orderBook,false,'quote is not GC Level 2');
assert.equal(delayed.executedTrades,false,'OHLC prices are not executed futures tape');
assert.equal(delayed.quoteAt,start+9*60000);
assert.equal(delayed.previous,4100+4*.4);
assert.ok(delayed.change5mPct>0);
assert.equal(parseYahooGC(raw('XAUUSD'),now).available,false,
 'spot feed cannot masquerade as GC futures');
assert.equal(parseYahooGC({chart:{error:{code:'Forbidden'}}},now).available,false);
assert.equal(parseYahooGC({chart:{result:[{meta:{symbol:'GC=F'},
 timestamp:[Math.floor(now/1000)+3000,Math.floor(now/1000)+3060],
 indicators:{quote:[{close:[4100,4200]}]}}]}},now).available,false,
 'no forward-dated GC bars');
assert.equal(parseYahooGC({chart:{result:[{meta:{symbol:'GC=F'},
 timestamp:[(now-90000000)/1000,(now-89000000)/1000],
 indicators:{quote:[{close:[4100,4101]}]}}]}},now).available,false,
 'time-inaccurate futures quotes never look fresh');
const genuine={exchange:'COMEX',symbol:'GCZ26',price:4100.1,at:now-2000};
const live=parseLicensedGC(genuine,now);
assert.equal(live.available,true);
assert.equal(live.status,'LIVE');
assert.equal(live.directContract,true);
assert.equal(live.eligibleForLead,false,
 'price-only licensed feed does not prove an exchange leads other venues');
assert.equal(parseLicensedGC({...genuine,symbol:'GCUSD'},now).available,false,
 'generic commodity price is not a GC expiration contract');
assert.equal(parseLicensedGC({...genuine,exchange:'spot'},now).available,false);
assert.equal(parseLicensedGC({...genuine,at:now-60000},now).available,false);
const ui=fs.readFileSync('components/GoldRadarBadge.tsx','utf8');
const api=fs.readFileSync('app/api/gc-futures/route.ts','utf8');
assert.match(ui,/fetch\('\/api\/gc-futures'/);
assert.match(ui,/GC · غير متاح/);
assert.match(ui,/قيادة العقود للسبوت: غير مثبتة/);
assert.match(api,/GC_FUTURES_FEED_TOKEN/);
assert.match(api,/parseYahooGC\(await r\.json\(\),Date\.now\(\)\)/);
console.log('PASS: GC actual futures symbol, exchange, timestamps, delayed/no-lead guards, optional licensed COMEX and UI');
