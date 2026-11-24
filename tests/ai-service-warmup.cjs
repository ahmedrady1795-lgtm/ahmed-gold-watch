const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const pending=[],calls=[],e={},readiness={};
let now=1_000_000;
const backoff={aiRetryAt:()=>0,recordAiResponse:()=>{}};
const ctx=vm.createContext({Date:{now:()=>now},
 process:{env:{ML_ENGINE_URL:'https://ml.example',NEURAL_ENGINE_URL:'https://neural.example'}},
 URL,AbortSignal,console,
 fetch:async u=>{calls.push(String(u));return new Promise(resolve=>pending.push(resolve));}
});
for(const [name,ex] of [['ai-readiness',readiness],['ai-service-warmup',e]]){
 const code=ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
 }).outputText;
 vm.runInContext('(function(exports,require){'+code+'\n})',ctx)(ex,
  id=>id==='./ai-readiness'?readiness:backoff);
}
const response=status=>({status,ok:status>=200&&status<300,headers:{get:()=>null},json:async()=>({ok:true,status:'COLLECTING'}),arrayBuffer:async()=>new ArrayBuffer(0)});
(async()=>{
 const a=e.warmAiServices(),b=e.warmAiServices();
 assert.equal(a,b,'simultaneous calls share one health probe');
 assert.equal(calls.length,2);
 const direct=readiness.getAiReadiness();
 assert.equal(calls.length,2,'readiness shares already in-flight warmup, no duplicate HTTP');
 pending.splice(0,2).forEach(done=>done(response(200)));
 await a;await direct;
 await e.warmAiServices();
 assert.equal(calls.length,2,'warmup must NOT hammer health again on next cycle');
 now+=120001;
 const c=e.warmAiServices();
 assert.equal(calls.length,4,'healthy health probes may refresh after two minutes');
 const next=pending.splice(0,2);
 next[0](response(429));next[1](response(200));
 await c;
 now+=120001;
 await e.warmAiServices();
 assert.equal(calls.length,4,'HTTP 429 must trigger an additional five-minute cooldown');
 now+=180000;
 const d=e.warmAiServices();
 assert.equal(calls.length,6,'health recovery resumes after a bounded cooldown');
 pending.splice(0,2).forEach(done=>done(response(200)));
 await d;
 console.log('PASS: deduplicated AI warmup, two-minute quiet period and 429 cooldown with no false readiness');
})().catch(e=>{console.error(e);process.exitCode=1;});
