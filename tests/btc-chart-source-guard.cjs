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
assert.equal(Boolean(b.chart.providerTransition),false,
 'a complete fresh same-venue history can replace the old chart immediately');
assert.equal(b.chart.candleSource,'Kraken XBT/USD',
 'replace the complete chart; never blend provider candles');
assert.equal(b.gate.accepted,'Kraken XBT/USD');
const returnToCoin=guard(b.chart,feed('Coinbase BTC-USD',39,2),b.gate,base+39*60000+1000);
assert.equal(returnToCoin.chart.candleSource,'Coinbase BTC-USD',
 'a second complete fresh provider history can replace the chart atomically');
assert.equal(Boolean(returnToCoin.chart.providerTransition),false);
const gap=feed('Coinbase BTC-USD',40,3);
gap.chartCandles[35].time+=1000;
let corrupt=guard(returnToCoin.chart,gap,returnToCoin.gate,base+40*60000+1000);
assert.equal(corrupt.chart.providerTransition,true,'invalid/gapped candle history must not promote');
assert.equal(corrupt.gate.newCloses,0);
const page=fs.readFileSync('app/page.tsx','utf8');
const chart=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
const command=fs.readFileSync('components/AICommandCenter.tsx','utf8');
assert.match(page,/reconcileBtcChartProvider\(/);
assert.match(chart,/!providerTransition&&m\.observationFresh/);
assert.match(command,/providerTransition:Boolean\(separate\.providerTransition\)/);
console.log('PASS: BTC provider changes replace the full chart only after 36 fresh contiguous same-venue M1 bars');
