const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
let now=1_000_000;
const env={},moduleExports={};
const code=ts.transpileModule(fs.readFileSync('lib/render-free-eco.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText;
vm.runInNewContext(code,{exports:moduleExports,process:{env},Date:{now:()=>now}});
const eco=moduleExports;
assert.equal(eco.allowBackgroundWork(),true,'non-Render services preserve background cycles');
env.RENDER_SERVICE_NAME='ahmed-gold-watch-free';
assert.equal(eco.renderFreeEcoEnabled(),true);
assert.equal(eco.allowBackgroundWork(),false,'Render Free starts idle, without waking AI services');
eco.noteViewerActivity(now);
assert.equal(eco.allowBackgroundWork(),true,'live dashboard permits background observations');
now+=120000;
assert.equal(eco.allowBackgroundWork(),true,'viewer grace period is bounded');
now++;
assert.equal(eco.allowBackgroundWork(),false,'closed dashboard cannot keep the ML/Neural services warm');
eco.noteViewerActivity(now+10000);
assert.equal(eco.allowBackgroundWork(),false,'future heartbeat may not authenticate past time');
now+=10000;
assert.equal(eco.allowBackgroundWork(),true,'new browser refresh resumes observations');
env.QANNAS_RENDER_ECO_MODE='0';
now+=1000000;
assert.equal(eco.allowBackgroundWork(),true,'explicit opt-out preserves old 24/7 behavior');
env.QANNAS_RENDER_ECO_MODE='1';
assert.equal(eco.allowBackgroundWork(),false,'explicit override works without any fresh viewer');
const instrument=fs.readFileSync('instrumentation.ts','utf8');
const snapshot=fs.readFileSync('app/api/ai-snapshot/route.ts','utf8');
const page=fs.readFileSync('app/page.tsx','utf8');
assert.match(page,/X-Qannas-Viewer/,'dashboard identifies viewer snapshot polls');
assert.match(snapshot,/noteViewerActivity\(now\)/,'read-only snapshot records viewer presence');
for(const part of ['warmAiServices','getScalpDesk','observe','tick','settleNextMove'])
  assert.match(instrument,/allowBackgroundWork\(\)/,'background budget must guard '+part);
assert.match(instrument,/if\(!allowBackgroundWork\(\)\)\{schedule\(30000\);return;\}/,
  'worker must recheck the viewer on the next idle window');
assert.match(instrument,/if\(!allowBackgroundWork\(\)\)return;/,
  'observation/settlement must not fetch while idle');
console.log('PASS: Render Free dashboard activity gate and background cycle budget');
