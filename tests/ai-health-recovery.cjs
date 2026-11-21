const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
let now=Date.parse('2026-11-21T10:45:00Z');
class Clock extends Date{static now(){return now;}}
const env={ML_ENGINE_URL:'https://ml.test',NEURAL_ENGINE_URL:'https://neural.test'};
const ctx=vm.createContext({Date:Clock,process:{env},URL,AbortSignal,console,
 fetch:async url=>{
   const isMl=String(url).includes('ml.test');
   return {status:200,ok:true,headers:{get:()=>null},
    json:async()=>isMl?{ok:true,status:'SHADOW',modelReady:false,readiness:{},
      trainedAt:now,historyRows:29999,training:false}:
      {ok:true,status:'COLLECTING',storedSnapshots:2,modelReady:false,
       prediction:{ready:false,status:'COLLECTING'}},
    arrayBuffer:async()=>new ArrayBuffer(0)};
 }});
const modules={};
function load(name){
 if(modules[name])return modules[name];
 const ex={};modules[name]=ex;
 const src=fs.readFileSync('lib/'+name+'.ts','utf8');
 const code=ts.transpileModule(src,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS
 }}).outputText;
 const fn=vm.runInContext('(function(exports,require){'+code+'\n})',ctx);
 fn(ex,id=>load(id.slice(2)));
 return ex;
}
(async()=>{
 const readiness=load('ai-readiness');
 const warm=load('ai-service-warmup');
 await warm.warmAiServices();
 const result=await readiness.getAiReadiness();
 assert.equal(result.configuredCount,3);
 assert.equal(result.readyCount,0,'ML/Neural HTTP 200 must not produce readiness');
 assert.equal(result.models.mlM1.status,'SHADOW');
 assert.equal(result.models.neural.status,'COLLECTING');
 assert.match(result.models.mlM1.reason,/unqualified/i);
 assert.match(result.models.neural.reason,/2/);
 assert.equal(readiness.noteAiHealthyService('https://ml.test',{
  ok:true,status:'READY',readiness:{m1:true,m5:false}},now),true);
 const partial=await readiness.getAiReadiness();
 assert.equal(partial.models.mlM1.ready,true,
  'only explicit independent readiness can promote model');
 assert.equal(partial.models.mlM5.ready,false);
 assert.equal(partial.models.neural.ready,false);
 assert.equal(partial.mode,'PARTIAL');
 assert.equal(readiness.noteAiHealthyService('https://ml.test',{
  ok:false,status:'READY',readiness:{m1:true,m5:true}},now),false,
  'an unhealthy health response must not promote readiness');
 console.log('PASS: AI warm recovery shares actual health without making ML/Neural HTTP 200 a trade qualification');
})().catch(e=>{console.error(e);process.exitCode=1;});
