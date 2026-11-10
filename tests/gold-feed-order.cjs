const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function read(path,req){
 const m={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
 }).outputText,{module:m,exports:m.exports,require:req||require,Date,Number});
 return m.exports;
}
const freshness=read('lib/client-market-freshness.ts');
const order=read('lib/gold-feed-order.ts',p=>p==='./client-market-freshness'?freshness:require(p));
const apply=order.shouldApplyGoldQuote,t=1790000000000;
const stream={ok:true,price:4201,sourceTime:t-1200,receivedAt:t-800,mode:'stream'};
const oldRest={ok:true,price:4180,sourceTime:t-2600,receivedAt:t,mode:'external'};
assert.equal(apply(oldRest,stream,t,t-800),false,'old REST cannot roll price/time back');
assert.equal(apply({...oldRest,sourceTime:t-300},stream,t,t-800),false,
 'a newer-looking REST reply still cannot supersede a healthy live stream');
assert.equal(apply({...oldRest,sourceTime:t+5000},null,t,0),false,
 'future provider timestamps are not real live quotes');
assert.equal(apply({...oldRest,sourceTime:t-21*60000},null,t,0),false,
 'badly stale gold observations must not overwrite screen');
assert.equal(apply({...oldRest,price:-7},null,t,0),false);
assert.equal(apply({...oldRest,sourceTime:null},null,t,0),false);
assert.equal(apply({...oldRest,sourceTime:t-500},stream,t,t-10000),true,
 'REST is a valid fallback when stream has been unavailable long enough');
assert.equal(apply({...oldRest,sourceTime:t-250},stream,t,t-10000),true);
assert.equal(apply({...stream,price:4202,sourceTime:t-100},stream,t,t-800),true,
 'real newer stream ticks remain accepted');
assert.equal(apply(stream,{...stream,receivedAt:t-200},t,t-800),false,
 'the exact same quote must not be needlessly re-rendered');
// Every repaired M15 candle must be exactly three genuine closed M5 bars.
const {repairGoldM15FromM5}=read('lib/gold-m15-reconstruction.ts');
const M5=300000,M15=900000,origin=Date.parse('2026-11-09T22:00:00Z');
const short=Array.from({length:120},(_,i)=>{
  const price=4100+i*.025,close=price+.02;
  return {time:origin+i*M5,open:price,high:close+.09,low:price-.06,close,
    tickVolume:10+i};
});
const m15=Array.from({length:40},(_,i)=>{
  const three=short.slice(i*3,i*3+3);
  return {time:origin+i*M15,open:three[0].open,
    high:Math.max(...three.map(b=>b.high)),
    low:Math.min(...three.map(b=>b.low)),close:three[2].close};
});
const now=origin+40*M15+1000;
const missingAt=m15[37].time;
const native=m15.filter(b=>b.time!==missingAt);
const repaired=repairGoldM15FromM5(short,native,now);
assert.equal(repaired.status,'REPAIRED');
assert.equal(repaired.added,1);
assert.ok(repaired.verifiedOverlaps>=5);
assert.equal(repaired.bars.length,40);
assert.equal(repaired.bars.find(b=>b.time===missingAt).close,m15[37].close);
assert.equal(repaired.bars.every((b,i,a)=>i===0||b.time-a[i-1].time===M15),true);
const partial=short.filter(b=>b.time!==missingAt+M5);
assert.equal(repairGoldM15FromM5(partial,native,now).added,0,
  'one missing source M5 prevents fabricated fifteen-minute candles');
const corrupt=native.map(b=>b.time===m15[35].time?{...b,close:b.close+1,high:b.high+1}:b);
assert.equal(repairGoldM15FromM5(short,[...native,{...m15[38],open:-5}],now).status,'SOURCE_CONFLICT',
  'invalid native OHLC cannot masquerade as a missing bar');
assert.equal(repairGoldM15FromM5(short,corrupt,now).status,'SOURCE_CONFLICT',
  'mismatched source never fills gaps across different OHLC feeds');
const future=repairGoldM15FromM5([...short,
 {time:origin+40*M15+M5,open:4200,high:4201,low:4199,close:4200}],native,now);
assert.ok(future.bars.every(b=>b.time+M15<=now),
  'an unfinished source group never becomes a real closed bar');
const hub=fs.readFileSync('lib/market-hub.ts','utf8');
assert.match(hub,/repairGoldM15FromM5\(m5,m15,now\)/);
assert.match(hub,/repairGoldM15FromM5\(mt5CandlesNow.c5,mt5CandlesNow.c15,now\)/);
const page=fs.readFileSync('app/page.tsx','utf8');
assert.match(page,/shouldApplyGoldQuote\(nextGoldTick,goldTickRef\.current,Date\.now\(\),lastStreamTick\)/,
 'late gold REST response checks the stream again before mutating state');
assert.match(page,/AbortSignal\.timeout\(6500\)/,'gold HTTP fallback must not hang the browser');
const chart=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
assert.doesNotMatch(chart,/توقف مؤقت للبيانات/,'a neutral model is never mislabeled as a data outage');
assert.match(chart,/!m\.bias\.active\?'التحليل مستمر · الاتجاه غير مؤكد'/);
assert.match(chart,/!sn\.view\.priceFresh\?'السعر متأخر/);
assert.match(chart,/!m\.historyFresh\?'الشموع متأخرة/);
console.log('PASS: gold tick monotonicity, fallback recovery, genuine staleness and honest neutral-state display');
