const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file){const ex={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:ex,require:()=>load('lib/sniper-m15-bias.ts')});return ex;}
const {m15WalkForward,firstM15Evidence}=load('lib/sniper-m15-walkforward.ts');
const start=Date.parse('2026-01-01T00:00:00Z');
const bars=Array.from({length:230},(_,i)=>{const close=100+i*.2;return {time:start+i*900000,open:close-.1,high:close+.1,low:close-.2,close};});
const w=m15WalkForward(bars,bars.at(-1).time+900000);
assert.equal(w.pairedModelAccuracy,1);assert.equal(w.pairedBaselineAccuracy,1);
assert.equal(firstM15Evidence(w).edgeProven,false);
assert.equal(firstM15Evidence({...w,wilsonLower:.99,pairedBaselineAccuracy:.2}).edgeProven,false);
const flat=bars.map(b=>({...b,open:100,close:100,high:100.1,low:99.9}));
const f=m15WalkForward(flat,flat.at(-1).time+900000);assert.ok(f.neutral>0);assert.equal(f.neutral,f.evaluated);
console.log('PASS: same-date comparisons, neutral coverage, historical edge not independently certified');
