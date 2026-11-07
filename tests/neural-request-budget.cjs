const assert=require('node:assert/strict'),fs=require('node:fs'),
 vm=require('node:vm'),ts=require('typescript');
let clock=1_000_000,calls=0,limited=false;
class Clock extends Date{static now(){return clock}}
const output={};
const source=ts.transpileModule(fs.readFileSync('lib/neural-prediction.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
vm.runInNewContext(source,{exports:output,Date:Clock,Number,Math,
 process:{env:{NEURAL_ENGINE_URL:'https://neural.example'}},
 AbortController,console,setTimeout,clearTimeout,
 require:id=>id==='./ai-service-backoff'?
  {aiRetryAt:()=>limited?clock+60000:0,recordAiResponse:()=>{}}:
  {certifyNeuralResponse:j=>({...j,ready:true})},
 fetch:async()=>{calls++;return {ok:true,status:200,
  headers:{get:()=>null},json:async()=>({ok:true,side:'BUY'})}}
});
(async()=>{
 const first=await output.getNeuralPrediction();
 assert.equal(first.ok,true);
 assert.equal(calls,1);
 clock+=7000;
 const reused=await output.getNeuralPrediction();
 assert.equal(reused.side,'BUY');
 assert.equal(calls,1,'freshest in-window response can be reused');
 clock+=6000;
 const budget=await output.getNeuralPrediction();
 assert.equal(budget.status,'REQUEST_BUDGET');
 assert.equal(budget.ready,false);
 assert.equal(budget.side,'WAIT',
  'no stale 13-second BUY prediction while avoiding provider request');
 assert.equal(calls,1,'no repeated inference in 45-second slot');
 limited=true;clock+=10000;
 assert.equal((await output.getNeuralPrediction()).status,'RATE_LIMITED',
  'provider cooldown has priority over local call budget');
 limited=false;clock+=24000;
 assert.equal((await output.getNeuralPrediction()).ok,true);
 assert.equal(calls,2,'new remote call after budget slot');
 console.log('PASS: 45s Neural rate budget, 10s fresh cache, no stale trade direction, shared 429 cooldown');
})().catch(e=>{console.error(e);process.exitCode=1});
