const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const module_={exports:{}};
vm.runInNewContext(ts.transpileModule(
 fs.readFileSync('lib/gold-proxy-readout.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
 }).outputText,{module:module_,exports:module_.exports});
const read=module_.exports.observeGoldProxyFlow;
const fns={exports:{}};
vm.runInNewContext(ts.transpileModule(
 fs.readFileSync('lib/paxg-flow.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
 }).outputText,{module:fns,exports:fns.exports});
const {readPaxgFlow,readKrakenPaxgFlow}=fns.exports;
const now=1795525000000,idx=[0,1,2,3,4];
const book={bids:idx.map(i=>[100-i,4]),asks:idx.map(i=>[101+i,1])};
const trades=idx.map(i=>({a:i,q:'2',m:false,T:now-i*1000}));
const f=readPaxgFlow(book,trades,now);
assert.equal(f.side,'BUY');
assert.equal(f.depthImbalancePct,60);
assert.equal(f.tradeDeltaPct,100);
const base={now,marketOpen:true,flow:f,chartSide:'BUY'};
const agree=read(base);
assert.equal(agree.status,'ALIGNED');
assert.equal(agree.side,'BUY');
assert.equal(agree.actionable,false);
assert.match(agree.source,/Binance PAXG/);
assert.match(agree.detail,/ليس دفتر Exness/);
assert.match(agree.detail,/60\.0%/);
assert.match(agree.detail,/100\.0%/);
const split=read({...base,flow:{...f,side:'NEUTRAL',depthImbalancePct:-60,tradeDeltaPct:80}});
assert.equal(split.status,'OBSERVED');
assert.equal(split.side,'WAIT','split evidence must not become confirmed XAU direction');
assert.match(split.label,/تنفيذ شراء.*دفتر معاكس/);
assert.equal(split.actionable,false);
const tapeOnly=read({...base,flow:readPaxgFlow(null,trades,now)});
assert.equal(tapeOnly.status,'OBSERVED');
assert.equal(tapeOnly.side,'WAIT');
assert.match(tapeOnly.label,/دفتر غير متاح/);
assert.match(tapeOnly.detail,/شراء هجومي 10\.000/);
assert.equal(tapeOnly.actionable,false);
const disagree=read({...base,chartSide:'SELL'});
assert.equal(disagree.status,'DIVERGENT');
assert.equal(disagree.actionable,false);
assert.equal(read({...base,chartSide:'WAIT'}).status,'OBSERVED');
const kTrades=idx.map(i=>[String(100+i*.01),'2',(now-i*1000)/1000,'b','m','',String(i)]);
const kraken=readKrakenPaxgFlow(book,kTrades,now);
assert.equal(kraken.depthImbalancePct,60);
assert.equal(kraken.tradeDeltaPct,100);
assert.match(read({...base,flow:kraken}).label,/Kraken/);
for(const input of [
 {...base,marketOpen:false},
 {...base,now:now+16000},
 {...base,flow:{...f,tradeAt:now-18000}},
 {...base,flow:{...f,source:'Exness XAUUSD DOM'}},
 {...base,flow:{...f,count:1}},
 {...base,flow:{...f,observedAt:now+100}},
 {...base,flow:{...f,tradeDeltaPct:150}},
 {...base,flow:{...f,depthImbalancePct:NaN}},
 {...base,flow:null}
]){
 const v=read(input);
 assert.equal(v.status,'UNAVAILABLE','invalid/stale external proxy cannot count as current exchange depth');
 assert.equal(v.side,'WAIT');
 assert.equal(v.actionable,false);
}
const panel=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const css=fs.readFileSync('app/qannas-chart-focus.css','utf8');
assert.match(panel,/observeGoldProxyFlow\(\{/);
assert.match(panel,/chartSide:liquidityReadout.aheadSide/);
assert.match(panel,/data-gold-proxy-status=\{goldProxyReadout.status\}/);
assert.match(css,/\.sniper-chart-gold-proxy/);
console.log('PASS: XAU alternative PAXG book and actual executed tape labeled by Binance/Kraken, stale/conflict safeguards and non-actionable chart display');

const absorbed=readPaxgFlow(null,Array.from({length:12},(_,i)=>({a:i,q:'1',T:now-11000+i*1000,m:true,p:100+i*.01})),now);
const absorption=read({...base,flow:absorbed});
assert.match(absorption.label,/امتصاص بيع محتمل/);
assert.equal(absorption.side,'WAIT');
assert.equal(absorption.actionable,false);
assert.match(panel,/data-btc-tape-watch/);

const {readBybitGoldPerp,readBinanceGoldPerp}=fns.exports;
const byBook={retCode:0,result:{s:'XAUUSDT',cts:now,b:book.bids,a:book.asks}};
const prints=idx.map(i=>({symbol:'XAUUSDT',execId:'id'+i,price:'100',size:'2',side:'Buy',time:String(now-i*1000)}));
const byHistory={retCode:0,result:{category:'linear',list:prints}};
const by=readBybitGoldPerp(byBook,byHistory,now);
assert.equal(by.side,'BUY');assert.equal(by.buyVolume,10);
assert.equal(by.source,'Bybit XAUUSDT perpetual');
assert.equal(readBybitGoldPerp(null,byHistory,now).depthAvailable,false);
assert.equal(readBybitGoldPerp(byBook,{...byHistory,result:{category:'linear',list:prints.map(t=>({...t,symbol:'BTCUSDT'}))}},now).side,'UNAVAILABLE');
assert.equal(readBybitGoldPerp(byBook,{...byHistory,result:{category:'linear',list:Array(5).fill(prints[0])}},now).side,'UNAVAILABLE');
const bn=readBinanceGoldPerp({...book,T:now},trades.map(t=>({...t,p:'100'})),now);
assert.equal(bn.side,'BUY');assert.equal(bn.source,'Binance XAUUSDT perpetual');
assert.equal(read({...base,flow:by}).status,'UNAVAILABLE','perpetual is not PAXG');
const perp=read({...base,flow:by,instrument:'XAUUSDT'});
assert.match(perp.label,/XAUUSDT Bybit/);assert.equal(perp.actionable,false);
assert.equal(read({...base,flow:by,instrument:'XAUUSDT',now:now+16000}).status,'UNAVAILABLE');
assert.match(panel,/data-gold-perp-status/);
console.log('PASS: public gold perpetual feed, taker sides, symbol, freshness, deduplication and separate display');

const history={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/gold-flow-history.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:history,exports:history.exports});
const h=history.exports,s=h.newVenueHistory();
const p=[{id:'1',at:now-1000,qty:2,buy:true},{id:'2',at:now-2000,qty:1,buy:false}];
const b1={at:now-1000,bid:100,ask:101,bidWall:98,askWall:103};
const x=h.updateVenueHistory(s,'Bybit',now,p,b1);
assert.equal(x.sampledCvd60s,1);
const x2=h.updateVenueHistory(s,'Bybit',now+1000,[...p,{id:'3',at:now,qty:4,buy:true}],{...b1,at:now,bidWall:99});
assert.equal(x2.sampledCvd60s,5,'overlapping REST trades must be counted only once');
assert.equal(x2.bidWallShift,1);
assert.equal(h.updateVenueHistory(s,'Bybit',now+62000,[],null).count,0);
assert.equal(h.compareGoldVenues({...by,count:10},{...bn,count:10},now),'BUY');
assert.equal(h.compareGoldVenues({...by,count:10},{...bn,count:10,tradeDeltaPct:-90},now),'CONFLICT');
assert.equal(h.compareGoldVenues({...by,count:10},{...bn,count:10,tradeAt:now-9000},now),'INSUFFICIENT');
assert.equal(h.observeLeadLag([],now).leader,null);
const returns=Array.from({length:35},(_,i)=>Math.sin(i*2.13)*.001);
let ap=100,bp=100;
const series=returns.map((v,i)=>{ap*=Math.exp(v);bp*=Math.exp(returns[i-1]??0);return {at:now-(34-i)*5000,a:ap,b:bp};});
assert.equal(h.observeLeadLag(series,now).leader,'Bybit');
assert.equal(h.observeLeadLag(series.slice(-6),now).leader,null);
console.log('PASS: independent sampled CVD, deduplication, wall shifts, consensus and exploratory lead/lag');
