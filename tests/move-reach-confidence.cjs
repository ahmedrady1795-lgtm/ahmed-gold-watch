const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const exports_={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/move-reach-calibration.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{exports:exports_});
const observed=exports_.observedMoveEnvelope;
const start=Date.parse('2026-10-17T00:00:00Z');
const candles=Array.from({length:420},(_,i)=>{
  // Mixed deterministic regimes, not evidence of a real-world edge.
  const trend=Math.floor(i/56)%2===0?1:-1;
  const open=1000+Math.sin(i*.17)*3+i*.004+trend*.25;
  const close=open+Math.sin(i*.47)*.8;
  return {time:start+i*60000,open,close,
    high:Math.max(open,close)+1,low:Math.min(open,close)-1};
});
const now=start+candles.length*60000,price=candles.at(-1).close;
let r=observed(candles,1,1,now,price);
assert.equal(r.status,'READY');
assert.ok(r.walkForward.tested>=25);
const w=r.walkForward;
assert.ok(w.directionN<=w.tested);
assert.ok(w.directionalLower95Pct==null||
 (w.directionalLower95Pct>=0&&w.directionalLower95Pct<=w.directionalAccuracyPct));
if(w.directionN>0){
 assert.ok(w.baselineDirectionalAccuracyPct!=null);
 assert.ok(Math.abs(w.directionalLiftPct-
   (w.directionalAccuracyPct-w.baselineDirectionalAccuracyPct))<=.002,
   'baseline evaluated on precisely same OOS decisions');
}
if(w.directionQuality==='OBSERVED_EDGE'){
 assert.ok(w.directionN>=40&&w.directionalAccuracyPct>=58);
 assert.ok(w.directionalLower95Pct>50&&w.directionalLiftPct>=3,
   'sparse 55% is never called reliable out-of-sample edge');
}
const original=JSON.stringify(r.walkForward);
const future={time:now+60000,open:1000,high:50000,low:1,close:30000};
const partial={time:now,open:1000,high:50000,low:1,close:30000};
assert.equal(JSON.stringify(observed([...candles,future],1,1,now,price).walkForward),
 original,'future price must not enter training or OOS');
assert.equal(JSON.stringify(observed([...candles,partial],1,1,now,price).walkForward),
 original,'unclosed bar must not enter the audit');
const gap=candles.map(c=>({...c}));
gap[gap.length-3].time+=60000;
assert.equal(observed(gap,1,1,now,price).status,'STALE_CANDLES',
 'a broken last-three-bar condition may not get historical calibration');
const earlierGap=candles.map(c=>({...c}));
earlierGap[200].time+=60000;
const g=observed(earlierGap,1,1,now,price);
assert.ok(g.allSamples<r.allSamples,'historical trend context with missing bar gets excluded');
const reflected=candles.map(c=>({
 time:c.time,open:3000-c.open,close:3000-c.close,
 high:3000-c.low,low:3000-c.high
}));
const mirror=observed(reflected,1,1,now,3000-price);
assert.equal(mirror.walkForward.directionN,w.directionN);
assert.equal(mirror.walkForward.directionalAccuracyPct,w.directionalAccuracyPct);
assert.equal(mirror.walkForward.baselineDirectionalAccuracyPct,w.baselineDirectionalAccuracyPct);
assert.equal(mirror.walkForward.directionQuality,w.directionQuality);
assert.equal(observed(candles,1,1,now+600000,price).status,'STALE_CANDLES');
const ai=fs.readFileSync('app/api/ai-analysis/route.ts','utf8');
assert.match(ai,/oosBaseline:/,'BTC monitoring reports the paired historical trend baseline');
assert.match(ai,/oosWilsonLower95:/,'BTC monitoring reports the conservative evidence bound');
console.log('PASS: causal OOS confidence, paired momentum baseline, Wilson bound, stale/gap/partial/future and direction symmetry');
