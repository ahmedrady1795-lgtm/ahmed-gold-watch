const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/ghost-forecast.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:mod,exports:mod.exports,require,console},{filename:'lib/ghost-forecast.ts'});
const {buildGhostForecast:build,evaluateGhostCandles:evaluate}=mod.exports;
const start=Date.parse('2026-10-16T10:00:00Z');
function sequence(n,step=.16){
  return Array.from({length:n},(_,i)=>{
    const open=100+i*step;
    const close=open+step*.8;
    return {time:start+i*60000,open,close,high:Math.max(open,close)+.27,
      low:Math.min(open,close)-.23,volume:60+i};
  });
}
const rows=sequence(165),now=start+165*60000;
const base={candles:rows,now,side:'BUY',price:rows.at(-1).close,
  sourceReady:true,scenarioReady:true};
const out=build(base);
assert.equal(out.ready,true,'aligned observed BUY movement should allow experimental candles');
assert.equal(out.candles.length,3);
assert.equal(out.source,'CLOSED_M1_EMPIRICAL_SHADOW');
assert.equal(out.baseAt,rows.at(-1).time);
assert.equal(out.candles[0].time,rows.at(-1).time+60000,'only AFTER last real close');
assert.equal(out.candles[0].open,rows.at(-1).close,'ghost starts from genuine closed price, not from quote');
assert.equal(out.candles[1].open,out.candles[0].close,'synthetic next OHLC must remain chained');
assert.ok(out.candles.every(c=>c.high>=Math.max(c.open,c.close)&&
  c.low<=Math.min(c.open,c.close)&&c.lowerBand<=c.low&&c.upperBand>=c.high));
assert.ok(out.validation.samples>=12,'independent walk-forward samples use prior windows');
assert.equal(out.validation.directionHits,out.validation.samples,'strict monotone pattern should pass directional shadow baseline');
assert.ok(out.validation.maeAtr!=null&&Number.isFinite(out.validation.maeAtr));
assert.equal(build({...base,side:'SELL'}).ready,false,'server direction must agree with M1 momentum');
assert.equal(build({...base,side:'WAIT'}).ready,false);
assert.equal(build({...base,sourceReady:false}).ready,false);
assert.equal(build({...base,scenarioReady:false}).ready,false);
assert.equal(build({...base,price:out.candles[0].close+20}).ready,false,'stale or diverged quote cannot anchor fantasy');
assert.equal(build({...base,now:now+250000}).ready,false,'expired last close cannot create fresh future');
const gap=rows.filter((_,i)=>i!==150);
assert.equal(build({...base,candles:gap}).ready,false,'60 closed M1 observations must be contiguous');
const offMinute=[...rows,{...rows.at(-1),time:rows.at(-1).time+15000,close:999}];
assert.equal(build({...base,candles:offMinute}).candles[0].open,rows.at(-1).close,
  'off-minute or partial data never repaints real last candle');
const conflicting=[...rows,{...rows.at(-1),close:rows.at(-1).close+4,high:rows.at(-1).close+4}];
assert.equal(build({...base,candles:conflicting}).ready,false,'conflicting duplicate timestamp must be rejected');
const sellRows=sequence(165,-.16),sellBase={...base,candles:sellRows,side:'SELL',price:sellRows.at(-1).close};
const sold=build(sellBase);
assert.equal(sold.ready,true,'symmetric SELL forecast must pass');
assert.ok(sold.candles[0].close<sold.candles[0].open);
assert.equal(build({...sellBase,side:'BUY'}).ready,false);
const flat=sequence(165,0);
assert.equal(build({...base,candles:flat,price:100}).ready,false,'flat context never earns imaginary directional candles');
// Evaluation is independent of the current server side, and excludes ANY
// following/partially formed bars from causal training windows.
const buyScore=evaluate(rows,now),sellScore=evaluate(rows,now);
assert.equal(JSON.stringify(buyScore),JSON.stringify(sellScore));
const earlyRows=rows.slice(0,162);
const early=evaluate(earlyRows,now);
const laterWithFuture=[...rows,{...rows.at(-1),time:now+60000,close:999,high:999}];
assert.equal(JSON.stringify(evaluate(laterWithFuture,now)),JSON.stringify(buyScore),
  'future bars must not leak into evaluation or current estimation');
assert.ok(early.samples<=buyScore.samples);
const ui=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
assert.match(ui,/aria-pressed=\{showGhost\}/);
assert.match(ui,/ghostVisible&&<g className="sniper-ghost-forecast"/);
assert.match(ui,/buildGhostForecast\(\{candles:m\.candles,now,/);
assert.match(ui,/\?ghost\.candles\.flatMap/,'shared historical price scale must include projected OHLC only on opt-in');
assert.match(ui,/شموع M1 الافتراضية الثلاث/);
assert.match(ui,/ليست نموذج ML معتمدًا/);
console.log('PASS: causal BUY/SELL experimental M1 ghost candles, OHLC invariant, uncertainty, stale/gap guards, walk-forward origin isolation and default opt-in');
