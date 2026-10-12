const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
function load(path,customRequire){
  const module={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
  }).outputText,{module,exports:module.exports,require:customRequire||require},{filename:path});
  return module.exports;
}
const long=load('lib/long-range-targets.ts');
const {buildStructuralWatch:watch}=load('lib/structural-watch.ts',
  p=>p==='./long-range-targets'?long:require(p));
const {frames}=require('./long-range-fixture.cjs');
const now=Date.parse('2026-10-11T10:00:00Z');
const structured=frames(now);
for(const name of ['m5','m15','h1']){
  const rows=structured[name];
  for(let i=rows.length-20;i<rows.length;i++){
    const close=99.15+(i-(rows.length-20))*.065;
    rows[i].close=close;
    rows[i].open=close-.08;
    rows[i].high=Math.max(rows[i].high,close+.22);
    rows[i].low=Math.min(rows[i].low,close-.22);
  }
}
let w=watch('BTC',{chartHigherFrames:structured},100.6,now,true);
assert.equal(w.side,'BUY','two or more independently trending closed frames support observational bias');
assert.equal(w.ready,true,'measured higher timeframe levels are available');
assert.ok(w.targets.length>=1);
assert.ok(w.targets.every(t=>t.price>100.6&&t.kind==='STRUCTURAL'));
assert.ok(w.invalidation<100.6);
w=watch('BTC',{chartHigherFrames:structured},100.6,now,false);
assert.equal(w.ready,false,'a stale model/quote must not activate even observational levels');
w=watch('BTC',{chartHigherFrames:structured},108,now,true);
assert.equal(w.ready,false,'provider mismatch must veto watch');
const stale=Object.fromEntries(Object.entries(structured).map(([k,v])=>
  [k,v.map(b=>({...b,time:b.time-3*3600000}))]));
w=watch('BTC',{chartHigherFrames:stale},100.6,now,true);
assert.equal(w.ready,false,'late M5/M15/H1 data cannot predict the future');
console.log('PASS: structural observation is closed-bar, separately labeled and stale-safe');
