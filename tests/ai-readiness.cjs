const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const ex={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/ai-readiness.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{exports:ex,process,AbortSignal});
const summarize=ex.summarizeAiReadiness;
const ml={ok:true,status:'PARTIAL',oneMinute:{ready:true},fiveMinute:{ready:false}};
const neural={ok:true,status:'SHADOW',ready:false};
let h=summarize(ml,neural);
assert.equal(h.status,'degraded');assert.equal(h.ready,false);
assert.equal(h.models.mlM1.ready,true);assert.equal(h.reasons.length,2);
h=summarize({...ml,fiveMinute:{ready:true}},{...neural,ready:true});
assert.equal(h.status,'healthy');assert.equal(h.reasons.length,0);
h=summarize({...ml,ok:false},{...neural,ready:true});
assert.equal(h.models.mlM1.ready,false);
h=summarize(ml,neural,false,false);
assert.equal(h.models.mlM1.status,'DISABLED');assert.equal(h.models.neural.ready,false);
console.log('AI readiness checks passed');
