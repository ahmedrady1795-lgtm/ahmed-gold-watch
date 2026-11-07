const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file){const exports={};const js=ts.transpileModule(
 fs.readFileSync(file,'utf8'),{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(js,{exports,Math,Number,Date,require},{filename:file});return exports;}
const {classifyM1MarketRegime}=load('lib/sniper-m1-market-regime.ts');
const {selectRegimeM1Expert}=load('lib/sniper-m1-regime-selector.ts');
const T=Date.parse('2026-11-06T01:00:00Z'),M=60000;
const trend=Array.from({length:32},(_,i)=>({
 time:T+i*M,open:100+i*.22,close:100+i*.22+.15,
 high:100+i*.22+.2,low:100+i*.22-.05
}));
const now=trend.at(-1).time+M;
assert.equal(classifyM1MarketRegime(trend,now).regime,'TREND',
 'monotonic closed M1 must be classified TREND');
const sideways=trend.map((b,i)=>({
 time:b.time,open:100.5,close:i%2?100.4:100.6,high:101,low:100
}));
assert.equal(classifyM1MarketRegime(sideways,now).regime,'RANGE');
const squeeze=trend.map((b,i)=>{
 const low=i<24?99:100+i*.007;
 return {time:b.time,open:low+.06,close:low+.13,
  high:i<24?101:low+.20,low};
});
assert.equal(classifyM1MarketRegime(squeeze,now).regime,'SQUEEZE');
const quiet=trend.map((b,i)=>i>=24?{time:b.time,
 open:100,close:100,high:100.04,low:99.96}:b);
const q=classifyM1MarketRegime(quiet,now);
assert.equal(q.regime,'LOW_ACTIVITY');
assert.ok(q.flatCount>=5);
assert.equal(q.brokerAuthorized,false);
assert.equal(classifyM1MarketRegime(trend,now+60001).regime,'INVALID',
 'stale minute cannot be treated as a fresh forecast');
const gap=trend.map(x=>({...x}));gap[18].time+=30000;
assert.equal(classifyM1MarketRegime(gap,now).regime,'INVALID');
const partial=trend.map(x=>({...x}));partial.at(-1).time+=M;
assert.equal(classifyM1MarketRegime(partial,now).ready,false);
const row=(regime,correct,which)=>({
 regime,observed:'BUY',pressure:which<5?'BUY':'SELL',
 bodyFollow:'SELL',bodyFade:correct?'BUY':'SELL',
 threeClose:'SELL',exhaustionFade:'SELL'
});
const good=(n,reg='RANGE')=>Array.from({length:n},(_,i)=>row(reg,i<n-2,i));
const train=good(12),check=good(12);
const picked=selectRegimeM1Expert('RANGE',train,check);
assert.equal(picked.model,'BODY_FADE');
assert.equal(picked.trainN,12);assert.equal(picked.checkN,12);
assert.equal(picked.trainHits,10);assert.equal(picked.checkHits,10);
assert.equal(picked.approvedForTrading,false);
assert.equal(selectRegimeM1Expert('TREND',train,check).model,null,
 'performance learned in RANGE cannot be imported into a TREND');
assert.equal(selectRegimeM1Expert('LOW_ACTIVITY',train,check).model,null,
 'low-activity feed is not eligible for model promotion');
assert.equal(selectRegimeM1Expert('RANGE',train,check.slice(0,6)).model,null);
const poor=Array.from({length:12},(_,i)=>row('RANGE',i<6,i));
assert.equal(selectRegimeM1Expert('RANGE',train,poor).model,null,
 'a failed later check cancels a strong earlier model');
const only7=good(12).map((x,i)=>({...x,regime:i<7?'RANGE':'TREND'}));
assert.equal(selectRegimeM1Expert('RANGE',only7,check).model,null,
 'same-regime sample count, not global samples, controls promotion');
const engine=fs.readFileSync('lib/sniper-m1-every-direction.ts','utf8');
const ledger=fs.readFileSync('lib/scalp-every-candle.ts','utf8');
assert.match(engine,/classifyM1MarketRegime\(rows,now\)/);
assert.match(engine,/const side=alternative\?\?\(applyRegime\?/);
assert.match(engine,/const weak=flatCluster\|\|lowActivity\|\|applyRegime\|\|applyEarly/);
assert.match(engine,/i<rows\.length-15\?older:later/);
assert.match(ledger,/signal\.regimeExpert\?\.applied/);
assert.match(ledger,/marketRegime:signal\.marketRegime/);
console.log('PASS: M1 5-regime classification and disjoint 15+15 causal regime-specific challenger vs pressure and last-candle, no trading promotion');
