const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const moduleRef={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/visual-forecast-candles.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:moduleRef,exports:moduleRef.exports,require},
{filename:'lib/visual-forecast-candles.ts'});
const {auditFirstVisualCandle:audit,buildVisualFuture:build}=moduleRef.exports;
const t0=Date.parse('2026-10-14T00:00:00Z');
let close=100;
const candles=Array.from({length:238},(_,i)=>{
  const open=close,body=.28*Math.sin(i*.91)+.32*Math.cos(i*.27)+(i%13===0?.35:0);
  close=open+body;
  return {time:t0+i*60000,open,close,high:Math.max(open,close)+.08+.17*Math.abs(Math.sin(i)),
    low:Math.min(open,close)-.07-.16*Math.abs(Math.cos(i))};
});
const report=audit(candles);
assert.ok(report.samples>=30,'first-bar replay must count a useful number of held-out M1 closures');
assert.ok(report.hits>=0&&report.hits<=report.samples);
assert.ok(report.baselineHits>=0&&report.baselineHits<=report.samples);
assert.equal(report.accuracyPct,Math.round(report.hits/report.samples*100));
assert.equal(report.baselinePct,Math.round(report.baselineHits/report.samples*100));
assert.ok(report.maeAtr!=null&&Number.isFinite(report.maeAtr));
assert.ok(report.baselineMaeAtr!=null&&Number.isFinite(report.baselineMaeAtr));
assert.equal(report.edgeSupported,false,'historic agreement is not a trading success probability');
assert.equal(audit(candles).samples,report.samples,'replay must be deterministic');
assert.equal(audit(candles.slice(0,65)).samples,0,'no invented percentage with inadequate source');
assert.equal(audit(candles.slice(0,65)).accuracyPct,null);
const tail=candles.slice(0,170);
const next=build({candles:tail,forecast:{mode:'RANGE',atr:.4,side:'WAIT',candles:[]},side:'WAIT'});
assert.equal(next[0].time,tail.at(-1).time+60000,'first visual bar follows the last closed M1');
const ui=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
assert.match(ui,/auditFirstVisualCandle\(m\.candles\)/);
assert.match(ui,/مسار أهداف مشروط/,'stages are conditional price-space, not timed next M1');
assert.doesNotMatch(ui,/aria-label="فحص أول شمعة في السيناريو"/,
 'extra text below the first scenario candle has been removed');
assert.match(ui,/firstCandleStudy\.samples>=30/);
assert.doesNotMatch(ui,/sn\.view\.confidence>0\?'ثقة فنية'/,
 'technical confidence must not be mislabeled as candle win probability');
const firstSpot=ui.indexOf('className="sniper-first-scenario-focus"');
const mapSpot=ui.indexOf('{visualCandles.map((c,i)=>{');
assert.ok(firstSpot>0&&firstSpot<mapSpot,
 'first candle highlight must not inject transparent candle artwork into actual OHLC loop');
console.log('PASS: first M1 causal direction/MAE audit, honest reference, and chart emphasis');
