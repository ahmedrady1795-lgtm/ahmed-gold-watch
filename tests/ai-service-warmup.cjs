const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const pending=[],calls=[],e={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/ai-service-warmup.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{exports:e,process:{env:{ML_ENGINE_URL:'https://ml.example',NEURAL_ENGINE_URL:'https://neural.example'}},
 URL,AbortSignal,console,fetch:async u=>{calls.push(String(u));await new Promise(resolve=>pending.push(resolve));
 return {ok:true,arrayBuffer:async()=>new ArrayBuffer(0)};}});
(async()=>{
 const a=e.warmAiServices(),b=e.warmAiServices();assert.equal(a,b,'slow cold starts cannot create overlapping health requests');
 assert.equal(calls.length,2);pending.forEach(f=>f());await a;
 const c=e.warmAiServices();assert.equal(calls.length,4,'health recovery can resume after completion');
 pending.slice(2).forEach(f=>f());await c;
 console.log('PASS: bounded health warmup deduplicates slow cold starts outside inference');
})().catch(e=>{console.error(e);process.exitCode=1;});
