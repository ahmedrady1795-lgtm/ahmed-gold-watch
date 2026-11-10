const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync('lib/sniper-order-flow-observation.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:mod,exports:mod.exports});
const {closedM1PricePressure,observeSniperOrderFlow:read}=mod.exports;
const now=Date.parse('2026-11-10T10:00:00Z'),T=60000;
const bars=Array.from({length:8},(_,i)=>{
  const open=4110+i*.13,close=open+.11;
  return {time:now-8*T+i*T,open,close,high:close+.08,low:open-.08};
});
const proxy=closedM1PricePressure(bars,now);
assert.equal(proxy.bars,8);
assert.ok(proxy.pressure>0);
assert.equal(closedM1PricePressure(bars,now+5*T).pressure,null,
  'expired candles cannot provide a current price proxy');
assert.equal(closedM1PricePressure(bars.filter((_,i)=>i!==3),now).pressure,null,
  'a missing minute must not be silently interpolated');
assert.equal(closedM1PricePressure([...bars.slice(0,7),
 {...bars[7],high:bars[7].low-.5}],now).pressure,null);
const base={asset:'GOLD',now,m1:bars,marketFresh:true,sourceMatches:true};
const missing=read({...base,flow:null});
assert.equal(missing.status,'PRICE_PROXY');
assert.equal(missing.side,'WAIT');
assert.equal(missing.actionable,false);
assert.equal(missing.brokerExecutedVolume,false);
assert.equal(missing.depthPct,null);
assert.equal(read({...base,sourceMatches:false,flow:null}).side,'WAIT',
  'cross-provider closes are never reported as true broker flow');
const gold={ready:true,side:'BUY',quality:'INDICATIVE_BROKER',
 profileBasis:'QUOTE_UPDATES',orderFlowReady:true,profileReady:true,
 asOf:now-1000,poc:4120,vah:4121,val:4119,flowPct:35,depthPct:40,
 source:'Exness/MT5 broker quotes + displayed DOM',reason:'indicative',
 actionable:false};
const book={available:true,asOf:now-1200,source:'MT5_BROKER_DOM',
 samples:4,imbalancePct:40,bidDepthLots:18,askDepthLots:8,
 possibleBidWithdrawal:false,possibleAskWithdrawal:true};
const live=read({...base,flow:gold,brokerDepth:book});
assert.equal(live.status,'BROKER_DOM');
assert.equal(live.side,'BUY');
assert.equal(live.bidSharePct,70);
assert.equal(live.askSharePct,30);
assert.equal(live.withdrawal,'ASK');
assert.equal(live.deltaPct,null,'gold depth is NOT executed trade delta');
assert.equal(live.brokerExecutedVolume,false);
const quote=read({...base,flow:{...gold,ready:false,
 orderFlowReady:false,side:'WAIT'},brokerDepth:null});
assert.equal(quote.status,'QUOTE_ACTIVITY');
assert.equal(quote.side,'WAIT');
assert.equal(quote.depthPct,null);
assert.equal(quote.poc,4120);
const staleBook=read({...base,flow:gold,
 brokerDepth:{...book,asOf:now-25000}});
assert.equal(staleBook.status,'QUOTE_ACTIVITY');
assert.equal(staleBook.bidSharePct,null);
assert.equal(read({...base,flow:{...gold,asOf:now-30000},brokerDepth:book}).status,
 'PRICE_PROXY','stale quote evidence cannot be called live order flow');
assert.equal(read({...base,flow:gold,sourceMatches:false,brokerDepth:book}).status,
 'PRICE_PROXY','mismatched MT5 XAUUSD/Biquote must not label displayed depth as live');
const btc={...gold,quality:'EXECUTED_SAMPLE',profileBasis:'EXECUTED_TRADES',
 flowPct:-24,side:'SELL',source:'Coinbase BTC-USD',asOf:now-3000};
const trades=read({...base,asset:'BTC',flow:btc});
assert.equal(trades.status,'EXECUTED_TRADES');
assert.equal(trades.side,'SELL');
assert.equal(trades.deltaPct,-24);
assert.equal(trades.depthPct,null);
assert.equal(read({...base,asset:'BTC',flow:{...btc,asOf:now-30000}}).status,'PRICE_PROXY');
const noBars=read({...base,flow:null,m1:[]});
assert.equal(noBars.status,'UNAVAILABLE');
assert.equal(noBars.proxyPressurePct,null);
const ui=fs.readFileSync('components/SniperOrderFlowStrip.tsx','utf8');
const chart=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const css=fs.readFileSync('app/qannas-scenario-2026.css','utf8');
assert.match(chart,/observeSniperOrderFlow/);
assert.match(chart,/<SniperOrderFlowStrip data=\{flowObservation\}/);
assert.match(ui,/ORDER FLOW/);
assert.match(ui,/ليس حجمًا منفذًا|ليست تداولات منفذة/);
assert.match(ui,/data-flow-status=\{data.status\}/);
assert.doesNotMatch(ui,/placeOrder|OrderSend|setTrade|sendTrade/);
assert.match(css,/\.sniper-orderflow-strip/);
console.log('PASS: GOLD MT5 broker DOM vs quote activity vs M1 proxy, BTC executed delta, stale/gap/venue guards and display-only Order Flow');
