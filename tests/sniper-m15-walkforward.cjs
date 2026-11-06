const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file){
 const mod={exports:{}};
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText;
 vm.runInNewContext(js,{module:mod,exports:mod.exports,require:(name)=>
  name==='./sniper-m15-bias'?load('lib/sniper-m15-bias.ts'):require(name)});
 return mod.exports;
}
const {m15WalkForward,firstM15Evidence}=load('lib/sniper-m15-walkforward.ts');
for(const direction of [1,-1]){
 const start=Date.parse('2026-10-10T00:00:00Z');
 const bars=Array.from({length:230},(_,i)=>{
  const open=100+direction*i*.45,close=open+direction*.25;
  return {time:start+i*900000,open,close,
   high:Math.max(open,close)+.14,low:Math.min(open,close)-.14};
 });
 const stats=m15WalkForward(bars,bars.at(-1).time+900000,105);
 assert.ok(stats.selected>=40);
 assert.ok(stats.pairedBaselineEvaluated>=30);
 assert.ok(stats.pairedBaselineEvaluated<=stats.selected);
 assert.equal(stats.pairedBaselineAccuracy,1);
 const evidence=firstM15Evidence(stats);
 assert.equal(evidence.ready,true);
 assert.equal(evidence.calibrated,false);
 assert.equal(evidence.edgeProven,false,'100% matched momentum baseline is NOT a separate edge');
 assert.match(evidence.label,/تاريخي/);
 assert.match(evidence.detail,/ليست نسبة نجاح/);
}
const sparse=firstM15Evidence({status:'INSUFFICIENT',selected:0,evaluated:0,pairedBaselineEvaluated:0});
assert.equal(sparse.ready,false);
assert.doesNotMatch(sparse.label,/\\d+%/);
const ui=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
assert.match(ui,/firstM15Stats\.label/);
console.log('PASS: paired M15 holdout, low-sample suppression, historical score is not a success probability');
