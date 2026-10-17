const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');

const files=['lib/neural-prediction.ts','lib/ai-readiness.ts'];
for(const path of files){
  const source=fs.readFileSync(path,'utf8');
  assert.match(source,/NEURAL_ENABLED/,'Both neural call and readiness must support suspension');
}
// Run the actual neural fetch accessor under a mock request-free environment.
// Importing must not make network requests and the OFF flag must beat a cached prediction.
const transpiled=ts.transpileModule(fs.readFileSync(files[0],'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const moduleExports={};
const env={NEURAL_ENABLED:'0',NEURAL_ENGINE_URL:'http://unreachable:8000'};
let requests=0;
vm.runInNewContext(transpiled,{
  exports:moduleExports,process:{env},
  // CommonJS transpilation loads the optional certification dependency eagerly.
  // In this disabled-mode test it must never be invoked.
  require:(id)=>{
    assert.equal(id,'./ai-model-certification');
    return {certifyNeuralResponse:()=>{throw Error('Neural certification reached while disabled');}};
  },
  fetch:()=>{requests++;throw Error('Forbidden neural network request');},
  AbortController,Date,Number,String,Error,setTimeout,clearTimeout
});
(async()=>{
  const result=await moduleExports.getNeuralPrediction(Date.now());
  assert.equal(result.ready,false);
  assert.equal(result.status,'DISABLED');
  assert.equal(result.side,'WAIT');
  assert.equal(requests,0,'Disabled neural must issue zero network requests');
  console.log('PASS: disabled neural returns WAIT immediately without network');
})().catch(e=>{console.error(e);process.exitCode=1;});
