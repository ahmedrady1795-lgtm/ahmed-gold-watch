const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const files=new Map(),fakeFs={existsSync:()=>false,readFileSync:p=>{if(!files.has(p))throw Error('ENOENT');return files.get(p);},
 writeFileSync:(p,t)=>files.set(p,t),renameSync:(a,b)=>{files.set(b,files.get(a));files.delete(a);}};
function instance(){const e={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/next-move-outcome.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}
}).outputText,{exports:e,require:p=>p==='node:fs'?fakeFs:require(p),Date,console});return e;}
const now=Date.parse('2026-10-21T08:00:00Z');
const arg={asset:'BTC_TARGET_T1_15M',price:100,atr:1,now,horizonMs:900000,minRecordIntervalMs:900000,
 targetPrice:101,stopPrice:99,hunt:{nextMove:{side:'BUY',confidence:70,source:'STRUCTURAL'}}};
let api=instance();assert.equal(api.recordNextMoveOutcome(arg).recorded,true);
assert.equal(api.getNextMoveOutcome(arg.asset,101.1,now+60000).global.hits,1);
assert.equal(api.recordNextMoveOutcome({...arg,now:now+60000}).recorded,false,
 'a quick TP does not restart the same 15m cohort one minute later');
api=instance();
assert.equal(api.recordNextMoveOutcome({...arg,now:now+120000}).recorded,false,
 'cooldown also survives process reload');
assert.equal(api.recordNextMoveOutcome({...arg,now:now+900000}).recorded,true,
 'a genuinely new horizon can begin after 15m');
console.log('PASS: no serial correlated 15m wins after a quick hit or server reload');
