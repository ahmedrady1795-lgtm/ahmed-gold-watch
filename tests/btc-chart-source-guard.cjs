const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/btc-chart-source-guard.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:mod,exports:mod.exports});
const guard=mod.exports.reconcileBtcChartProvider;
const base=Date.parse('2026-10-18T04:00:00Z');
function feed(source,count,offset=0){
 const rows=Array.from({length:count},(_,i)=>{
   const close=81000+offset+i*.4;
   return {time:base+i*60000,open:close-.3,high:close+.3,low:close-.5,close};
 });
 return {candleSource:source,chartCandles:rows};
}
const coin=feed('Coinbase BTC-USD',36),kraken=feed('Kraken XBT/USD',39,4);
let now=base+36*60000+1000;
let a=guard(null,coin,null,now);
assert.equal(a.chart.candleSource,'Coinbase BTC-USD');
assert.equal(a.gate.accepted,'Coinbase BTC-USD');
let b=guard(a.chart,feed('Kraken XBT/USD',36,4),a.gate,now);
assert.equal(b.chart.providerTransition,true,'freeze chart immediately on first different provider');
assert.equal(b.chart.candleSource,'Coinbase BTC-USD','cannot blend Kraken M1 into Coinbase chart');
assert.equal(b.gate.newCloses,0);
let same=guard(b.chart,feed('Kraken XBT/USD',36,4),b.gate,now);
assert.equal(same.gate.newCloses,0,'polling same closed minute must never promote a provider');
let next=guard(same.chart,feed('Kraken XBT/USD',37,4),same.gate,base+37*60000+1000);
assert.equal(next.gate.newCloses,1);
assert.equal(next.chart.providerTransition,true);
let approved=guard(next.chart,feed('Kraken XBT/USD',38,4),next.gate,base+38*60000+1000);
assert.equal(approved.gate.accepted,'Kraken XBT/USD');
assert.equal(Boolean(approved.chart.providerTransition),false,'must release freeze after second new real M1 close');
const returnToCoin=guard(approved.chart,coin,approved.gate,base+38*60000+1000);
assert.equal(returnToCoin.chart.providerTransition,true);
assert.equal(returnToCoin.gate.accepted,'Kraken XBT/USD');
const gap=feed('Coinbase BTC-USD',40,3);
gap.chartCandles[35].time+=1000;
let corrupt=guard(approved.chart,gap,approved.gate,base+40*60000+1000);
assert.equal(corrupt.chart.providerTransition,true,'invalid/gapped candle history must not promote');
assert.equal(corrupt.gate.newCloses,0);
const page=fs.readFileSync('app/page.tsx','utf8');
const chart=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
const command=fs.readFileSync('components/AICommandCenter.tsx','utf8');
assert.match(page,/reconcileBtcChartProvider\(/);
assert.match(chart,/!providerTransition&&m\.observationFresh/);
assert.match(command,/providerTransition:Boolean\(separate\.providerTransition\)/);
console.log('PASS: BTC Coinbase/Kraken change freezes chart, requires 2 new contiguous closes and suppresses target route');
