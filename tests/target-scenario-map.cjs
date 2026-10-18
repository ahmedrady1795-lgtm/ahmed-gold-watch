const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/target-scenario-map.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{module:mod,exports:mod.exports});
const build=mod.exports.buildTargetScenarioMap;
const history=Array.from({length:36},(_,i)=>({open:100,close:i%3?101:99,high:102,low:98}));
for(const side of ['BUY','SELL']){
 const sign=side==='BUY'?1:-1,targets=[1,2,3].map(stage=>({stage,price:100+sign*stage*8}));
 const m=build(history,100,side,targets,100-sign*6);
 assert.ok(m.complete);assert.equal(m.markers.length,3);
 m.bars.forEach((b,i)=>{assert.ok(b.high>=Math.max(b.open,b.close));assert.ok(b.low<=Math.min(b.open,b.close));assert.ok(Math.abs(b.close-b.open)<=1.00000001);if(i)assert.equal(b.open,m.bars[i-1].close)});
 assert.equal(m.bars.at(-1).close,targets.at(-1).price);
}
assert.equal(build(history,100,'BUY',[{stage:1,price:120}],110),null);
assert.equal(build([],100,'BUY',[{stage:1,price:120}],90),null);
const far=build(history,100,'BUY',[{stage:1,price:10000}],90);
assert.ok(!far.complete);assert.equal(far.bars.length,480);
console.log('PASS: conditional storyboard BUY/SELL, exact goals, bounded bodies, continuous OHLC, invalid inputs and bounded work');
