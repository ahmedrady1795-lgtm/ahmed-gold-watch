const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const context={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/continuous-direction.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,context,{filename:'lib/continuous-direction.ts'});
const {buildContinuousBias:build}=context.exports;
const {frames}=require('./long-range-fixture.cjs');
const now=Date.parse('2026-10-11T12:00:00Z');
const history=frames(now);
for(const label of ['m5','m15','h1']){
  const rows=history[label];
  for(let i=rows.length-24;i<rows.length;i++){
    const v=99.4+(i-(rows.length-24))*.055;
    rows[i].open=v-.04;rows[i].close=v+.04;
    rows[i].low=Math.min(rows[i].low,v-.27);
    rows[i].high=Math.max(rows[i].high,v+.28);
  }
}
const ref=history.h1.at(-1).close;
const args={asset:'BTC',frames:history,now,price:ref,sourceReady:true,
  fourHour:{ready:true,side:'BUY'}};
let v=build(args);
assert.equal(v.status,'LIVE');
assert.equal(v.active,true);
assert.equal(v.side,'BUY');
assert.ok(v.agreement>=2,'M5/M15/H1 should align to the observed climb');
assert.ok(v.targets.length>0,'distant, observed levels should appear even if the trade setup is unqualified');
assert.ok(v.targets.every(t=>t.kind==='STRUCTURAL'&&t.price>ref));
assert.ok(v.targets.every(t=>/H1|H4/.test(t.source)),'no artificial ATR targets');
assert.ok(v.targets.every((t,i)=>i===0||t.price>v.targets[i-1].price));
let paused=build({...args,sourceReady:false});
assert.equal(paused.status,'PAUSED','bias can remain visible but must not be called live');
assert.equal(paused.targets.length,0,'a cached or closed market must never paint active far objectives');
const stale=Object.fromEntries(Object.entries(history).map(([k,rows])=>
  [k,rows.map(c=>({...c,time:c.time-4*3600000}))]));
v=build({...args,frames:stale});
assert.equal(v.status,'PAUSED','historical frames should not appear live');
assert.equal(v.targets.length,0);
v=build({...args,price:ref*1.07});
assert.equal(v.status,'PAUSED','cross-feed mismatch cannot become a long-range forecast');
assert.equal(v.targets.length,0);
v=build({...args,frames:{...history,h1:[]}});
assert.equal(v.status,'NO_DATA');
assert.equal(v.targets.length,0);
console.log('PASS: continuous bias independent of trade confirmation; authentic H1/H4 objectives, stale guards');
