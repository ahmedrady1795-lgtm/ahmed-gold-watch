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
