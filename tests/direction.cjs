const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const ex={};
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync('lib/direction-walkforward.ts','utf8'),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
  }).outputText,{exports:ex,console,require});
const validate=ex.validateDirectionChronologically;
const t0=Date.parse('2026-09-30T00:00:00Z');
const history=Array.from({length:650},(_,i)=>{
  // Alternating up/down regimes with bounded price-action, NOT real market.
  const trend=i%120<60?1:-1;
  const wobble=.09*Math.sin(i*.41);
  const center=100+Math.floor(i/120)*.08+(i%120<60?(i%120)*.12:(120-i%120)*.12);
  const open=center-.055*trend+wobble,close=center+.055*trend+wobble;
  return {time:t0+i*60000,open,close,high:Math.max(open,close)+.08,low:Math.min(open,close)-.08};
});
const now=t0+history.length*60000;
const m1=validate(history,now,1,.01),m5=validate(history,now,5,.01);
for(const [h,result] of [[1,m1],[5,m5]]){
  assert.equal(result.horizon,h);
  assert.equal(result.closedBars,650);
  assert.ok(result.trainRows>result.testRows);
  assert.ok(result.testRows>=20);
  assert.ok(result.holdout.n<=result.testRows,'Holdout directional N cannot exceed independent observations');
  assert.ok(result.holdout.accuracyPct==null||
    (result.holdout.accuracyPct>=0&&result.holdout.accuracyPct<=100));
  assert.ok(result.baseline.n<=result.holdout.n,'Paired baseline must never use more prediction dates');
  assert.equal(result.qualified,result.status==='QUALIFIED');
  if(result.qualified){
    assert.notEqual(result.selected,'MOMENTUM_3');
    assert.ok(result.holdout.n>=35&&result.holdout.lower95Pct>50);
    assert.ok(result.holdout.accuracyPct>=result.baseline.accuracyPct+3);
  }
}
assert.equal(validate(history.slice(-90),now,1,.01).status,'INSUFFICIENT');
assert.equal(validate(history,now,1,-1).status,'INSUFFICIENT');
const partial={time:now,open:110,high:99999,low:1,close:900};
const future={time:now+60000,open:110,high:99999,low:1,close:900};
for(const extra of [partial,future]){
  const after=validate([...history,extra],now,5,.01);
  assert.equal(after.selected,m5.selected,'A partial or future candle must not change the trained champion');
  assert.equal(after.holdout.accuracyPct,m5.holdout.accuracyPct);
  assert.equal(after.liveSide,m5.liveSide);
}
const shifted=history.map(c=>({...c}));
for(let i=shifted.length-22;i<shifted.length;i++){
  const v=shifted[i];v.open+=i%2?-.45:.45;
  v.close+=i%2?.45:-.45;
  v.high=Math.max(v.open,v.close)+.08;
  v.low=Math.min(v.open,v.close)-.08;
}
assert.equal(validate(shifted,now,5,.01).selected,m5.selected,
  'Later HOLDOUT observations must not influence training-only candidate selection');
const reflect=history.map(c=>({...c,open:250-c.open,close:250-c.close,high:250-c.low,low:250-c.high}));
for(const [h,a] of [[1,m1],[5,m5]]){
  const b=validate(reflect,now,h,.01);
  assert.equal(a.selected,b.selected,'Mirror BUY/SELL should select the same causal strategy');
  assert.equal(a.holdout.n,b.holdout.n);
  assert.equal(a.holdout.accuracyPct,b.holdout.accuracyPct);
  assert.equal(a.liveSide==='BUY'?'SELL':a.liveSide==='SELL'?'BUY':'WAIT',b.liveSide);
}
const broken=history.map(c=>({...c}));
broken[broken.length-10].time+=60000;
assert.equal(validate(broken,now,5,.01).status,'INSUFFICIENT',
  'A recent time gap invalidates a supposed independent directional study');
const costly=validate(history,now,5,1e5);
assert.equal(costly.qualified,false,'Extremely high costs must not produce a qualified direction');
assert.equal(costly.holdout.n,0,'Price changes smaller than costs must remain neutral');
console.log('PASS: chronological disjoint training/holdout, paired baseline, BUY/SELL symmetry, partial/future exclusion, no selection leakage, gaps and cost deadzone. Synthetic fixture does NOT prove real-world edge.');
