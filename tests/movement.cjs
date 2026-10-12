const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync('lib/move-reach-calibration.ts','utf8');
const out={};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS
}}).outputText,{exports:out,console,require});
const estimate=out.observedMoveEnvelope;
const origin=Date.parse('2026-10-01T00:00:00Z');
const candles=(n,step,ms)=>Array.from({length:n},(_,i)=>{
  const open=100+i*step,close=open+step;
  return {time:origin+i*ms,open,close,high:close+.05,low:open-.05};
});
const series=candles(420,.1,60000),now=origin+420*60000,price=series.at(-1).close;
const m1=estimate(series,1,1,now,price);
const m5=estimate(series,1,5,now,price);
assert.equal(m1.status,'READY');
assert.equal(m5.status,'READY');
assert.equal(m5.conditioning,'MATCHED_3_BAR_TREND');
assert.ok(m5.samples>=30,'M5 must use a credible historical sample');
assert.ok(m5.walkForward.tested>=20,'Time-split movement baseline should have independent held-out windows');
assert.equal(m5.walkForward.nominalCoveragePct,50,'The 25–75% interval has 50% NOMINAL coverage, not 75%');
assert.equal(m5.walkForward.directionalAccuracyPct,100,
  'Known synthetic upward history must yield strictly historical forward-median predictions');
assert.equal(m5.walkForward.directionQuality,'OBSERVED_EDGE');
assert.equal(estimate(series.slice(-25),1,5,now,price).walkForward.rangeQuality,'COLLECTING');
assert.ok(Math.abs(m5.endpointMedian-.5)<.001,
  'M5 forecast measures next five completed one-minute CLOSES, not same-bar excursions');
assert.ok(Math.abs(m5.upsideP75-.55)<.001,
  'Favorable move must use subsequent highs after the hypothetical entry');
assert.ok(Math.abs(m5.downsideP75-.05)<.001,
  'Historical adverse move must reflect actual subsequent lows');
assert.ok(m5.lowerPrice<=m5.medianPrice&&m5.medianPrice<=m5.upperPrice);
const partial={time:now,open:price,high:price+900,low:price-90,close:price+200};
const unchanged=estimate([...series,partial],1,5,now,price);
assert.equal(unchanged.walkForward.intervalCoveragePct,m5.walkForward.intervalCoveragePct,
  'A partial bar must not leak into chronological out-of-sample validation');
assert.equal(unchanged.endpointMedian,m5.endpointMedian,
  'Unclosed current candle cannot leak into the historical reference distribution');
const future={time:now+60000,open:price,high:price+200,low:price-20,close:price+100};
assert.equal(estimate([...series,future],1,5,now,price).upsideP75,m5.upsideP75,
  'Future candle cannot leak into the current forecast');
const gap=series.filter((_,i)=>i!==412);
assert.ok(estimate(gap,1,5,now,price).allSamples<m5.allSamples,
  'Gapped intervals are excluded instead of inventing five-minute movement');
assert.equal(estimate(series,1,5,now+240000,price).status,'STALE_CANDLES',
  'Stale candles cannot qualify a current destination');
assert.equal(estimate(series.slice(-25),1,5,now,price).status,'INSUFFICIENT_DATA',
  'Tiny samples must not claim statistical readiness');
const m5bars=candles(360,.3,300000),m5now=origin+360*300000;
const m15=estimate(m5bars,5,15,m5now,m5bars.at(-1).close);
assert.equal(m15.status,'READY');
assert.ok(m15.samples>=30);
assert.ok(m15.walkForward.tested>=20);
assert.equal(m15.walkForward.directionalAccuracyPct,100);
assert.ok(Math.abs(m15.endpointMedian-.9)<.001,
  '15-minute movement MUST use three future CLOSED M5 candles, not M1 ATR');
const reflected=series.map(c=>({...c,open:250-c.open,close:250-c.close,
  high:250-c.low,low:250-c.high}));
const bearish=estimate(reflected,1,5,now,250-price);
assert.ok(Math.abs(bearish.endpointMedian+m5.endpointMedian)<.001,
  'Bearish and bullish direction must be treated symmetrically');
assert.ok(Math.abs(bearish.downsideP75-m5.upsideP75)<.001);
console.log('PASS: causal M1/M5/M15 movement quantiles, matched trend context, future/partial leakage, stale candles, gaps, insufficient samples and directional symmetry.');
