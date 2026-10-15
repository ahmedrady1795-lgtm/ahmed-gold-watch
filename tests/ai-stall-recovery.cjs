const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/analysis-stage-deadline.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:m,exports:m.exports,require,setTimeout,clearTimeout,Date});
const stage=m.exports.awaitAiStage;
async function verify(){
  const t=Date.now();
  assert.equal(await stage('instant',Promise.resolve('OK'),t),'OK');
  await assert.rejects(
    stage('hung-provider',new Promise(()=>{}),Date.now(),{totalBudgetMs:90,stageBudgetMs:28}),
    /AI_STAGE_TIMEOUT:hung-provider/,
    'hung external requests must not leave the heavy-core lock forever'
  );
  await assert.rejects(
    stage('out-of-time',new Promise(()=>{}),Date.now()-100000,{totalBudgetMs:90}),
    /AI_STAGE_DEADLINE:out-of-time/,
    'elapsed total budget prevents a sequence of slow jobs from exceeding the worker deadline'
  );
  assert.equal(await stage('recovery',Promise.resolve(42),Date.now(),{totalBudgetMs:80}),42,
    'a new request can proceed after the failed request expires');
  const route=fs.readFileSync('app/api/ai-analysis/route.ts','utf8');
  for(const name of ['initial-market-feeds','gold-market-fallback','ml-prediction',
    'web-intelligence','market-tool-mesh','market-learning','expected-move-learning',
    'evolution-policy','autonomous-research','paper-learning-observations','recommendation-learning']){
    assert.ok(route.includes("stage('"+name+"'"),'unbounded awaited stage: '+name);
  }
  assert.match(route,/totalBudgetMs:39000/);
  assert.match(route,/\]\),2800\)\.catch\(\(\)=>\{/,
    'optional market-tool-mesh must degrade without cancelling AI generation');
  assert.match(route,/finally\s*\{\s*analysisBusy=false;/);
  const snapshot=fs.readFileSync('app/api/ai-snapshot/route.ts','utf8');
  assert.match(snapshot,/snap\.ageMs>90000/);
  assert.match(snapshot,/'X-AI-Snapshot':'expired'/);
  const page=fs.readFileSync('app/page.tsx','utf8');
  assert.match(page,/if\(j\.stale\)\{/);
  assert.match(page,/setAiLastOkAt\(0\)/);
  console.log('PASS: bounded AI stage, overall 39s timeout, lock cleanup, expired snapshot and visible stale alert');
}
verify().catch(e=>{console.error(e);process.exitCode=1;});
