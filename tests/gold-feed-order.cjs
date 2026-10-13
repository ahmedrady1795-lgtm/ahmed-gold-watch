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
