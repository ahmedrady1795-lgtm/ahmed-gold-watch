const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
let now=Date.parse('2026-11-04T09:00:15Z'),calls=[],respond;
const env={ML_ENGINE_URL:'https://ml.test',NEURAL_ENGINE_URL:'https://neural.test'};
class Clock extends Date{static now(){return now;}}
const ctx=vm.createContext({Date:Clock,process:{env},URL,AbortSignal,AbortController,setTimeout,clearTimeout,console,
 fetch:async(url,init)=>{calls.push({url:String(url),init});return respond(url,init);}});
const modules={};
function load(name){
 if(modules[name])return modules[name];
 const ex={};modules[name]=ex;
 const code=ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const fn=vm.runInContext('(function(exports,require){'+code+'\n})',ctx);
 fn(ex,id=>id==='./ai-model-certification'?{certifyMlResponse:x=>x,certifyNeuralResponse:x=>x}:load(path.basename(id)));
 return ex;
}
const response=(status,header=null,data={ok:true})=>({status,ok:status===200,headers:{get:()=>header},json:async()=>data,arrayBuffer:async()=>new ArrayBuffer(0)});
(async()=>{
 const backoff=load('ai-service-backoff');
 backoff.recordAiResponse(env.ML_ENGINE_URL,429,'1800');
 assert.equal(backoff.aiRetryAt(env.ML_ENGINE_URL),now+1800000,'long Retry-After must not be clipped');
 backoff.recordAiResponse(env.NEURAL_ENGINE_URL,429,new Date(now+3600000).toUTCString());
 assert.equal(backoff.aiRetryAt(env.NEURAL_ENGINE_URL),Math.floor((now+3600000)/1000)*1000,'HTTP-date honored');
 backoff.recordAiResponse(env.ML_ENGINE_URL,200,null);
 assert.ok(backoff.aiRetryAt(env.ML_ENGINE_URL)>now,'late success cannot erase active throttle');
 respond=()=>{throw Error('cooldown must prevent network');};
 const health=await load('ai-readiness').getAiReadiness();
 assert.equal(health.models.neural.status,'RATE_LIMITED');
 assert.match(health.models.neural.reason,/429/,'readiness preserves transport reason');
 await load('ai-service-warmup').warmAiServices();
 assert.equal((await load('neural-prediction').getNeuralPrediction()).status,'RATE_LIMITED');
 const ml=load('ml-prediction');
 const rows=()=>Array.from({length:260},(_,i)=>({time:Math.floor(now/60000)*60000-(260-i)*60000,open:100,high:102,low:99,close:101,realVolume:2}));
 assert.equal((await ml.getMlPrediction(rows())).status,'RATE_LIMITED');
 assert.equal(calls.length,0,'all clients honor shared budget');
 now+=3601000;
 backoff.recordAiResponse(env.ML_ENGINE_URL,200,null);backoff.recordAiResponse(env.NEURAL_ENGINE_URL,200,null);
 const pending=[];respond=()=>new Promise(resolve=>pending.push(resolve));
 const a=rows(),b=rows();b[100].close=100.5;
 const p1=ml.getMlPrediction(a),same=ml.getMlPrediction(a),p2=ml.getMlPrediction(b);
 assert.equal(p1,same);assert.notEqual(p1,p2);assert.equal(calls.length,2);
 pending[0](response(200,null,{ok:true,marker:'a'}));pending[1](response(200,null,{ok:true,marker:'b'}));
 assert.equal((await p1).marker,'a');assert.equal((await p2).marker,'b');
 const p3=load('neural-prediction').getNeuralPrediction();env.NEURAL_ENABLED='0';
 assert.equal((await load('neural-prediction').getNeuralPrediction()).status,'DISABLED','disable wins over in-flight request');
 pending[2](response(200));await p3;
 console.log('PASS: shared 429 budget, Retry-After dates, transport reasons, keyed inference and in-flight opt-out');
})().catch(e=>{console.error(e);process.exitCode=1;});
