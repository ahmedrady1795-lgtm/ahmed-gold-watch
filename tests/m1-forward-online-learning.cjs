const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('typescript'),cache=new Map();
function load(file){
  file=path.resolve(file);if(cache.has(file))return cache.get(file);
  const result={};cache.set(file,result);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,
      esModuleInterop:true}
  }).outputText,{exports:result,require:name=>name.startsWith('.')?
    load(path.resolve(path.dirname(file),name+'.ts')):require(name),
    globalThis:{},console,Date,Math,Number,process:{env:{}}},{filename:file});
  return result;
}
const {chooseOnlineM1}=load('lib/scalp-m1-online-learning.ts');
const {advanceEveryM1}=load('lib/scalp-every-candle.ts');
const T=Date.parse('2026-11-05T14:00:00Z');
const signal={issuedAt:T+37*60000,side:'BUY',weak:true,
 pattern:'MOMENTUM'};
const bad=Array.from({length:36},(_,i)=>({
 issuedAt:T+i*60000,side:'BUY',originalSide:'BUY',weak:true,
 pattern:'MOMENTUM',directionObserved:'SELL',
 directionEvaluatedAt:T+(i+1)*60000
}));
let decision=chooseOnlineM1(signal,bad);
assert.equal(decision.priorGraded,36);
assert.equal(decision.trainTotal,24);
assert.equal(decision.checkedTotal,12);
assert.equal(decision.trainHits,0);
assert.equal(decision.checkedHits,0);
assert.equal(decision.inverted,true,'real prior repeated failure can invert next estimate');
assert.equal(decision.side,'SELL');
assert.equal(decision.model,'ONLINE_INVERSION');
decision=chooseOnlineM1(signal,bad.slice(0,35));
assert.equal(decision.inverted,false,'35 examples cannot fit a 24 +12 online train/check');
decision=chooseOnlineM1(signal,bad.map((r,i)=>i<24?r:{...r,directionObserved:'BUY'}));
assert.equal(decision.inverted,false,'an invalidating later holdout must cancel inversion');
decision=chooseOnlineM1(signal,bad.map((r,i)=>i>=24?r:{...r,directionObserved:'BUY'}));
assert.equal(decision.inverted,false,'bad holdout alone cannot overcome failing training');
decision=chooseOnlineM1({...signal,weak:false},bad);
assert.equal(decision.inverted,false,'online weak/strong evidence must not leak between regimes');
decision=chooseOnlineM1({...signal,pattern:'SWEEP_REJECTION'},bad);
assert.equal(decision.inverted,false,'separate reversal and momentum strata');
decision=chooseOnlineM1(signal,[...bad,{
 ...bad[0],issuedAt:signal.issuedAt+60000,
 directionEvaluatedAt:signal.issuedAt+120000,directionObserved:'BUY'
}]);
assert.equal(decision.checkedHits,0,'future outcome ignored before its issuance');
decision=chooseOnlineM1(signal,bad.map((r,i)=>i>=30?{
 ...r,directionEvaluatedAt:signal.issuedAt+1000}:r));
assert.equal(decision.inverted,false,'a grade stamped after signal is not training evidence');
decision=chooseOnlineM1(signal,bad.map((r,i)=>i>=30?{
 ...r,directionEvaluatedAt:r.issuedAt+1000}:r));
assert.equal(decision.inverted,false,'grade before next candle close is not causal');

const bars=Array.from({length:43},(_,i)=>{const open=100+i*.06,close=open+.035;
  return {time:T+i*60000,open,close,high:close+.05,low:open-.05};
});
const issue=bars.at(-1).time+60000;
const q=(bid,ask,at,source='MATCHED_QUOTE')=>({
 price:(bid+ask)/2,bid,ask,at,source
});
let ledger={version:1,history:[]};
ledger=advanceEveryM1(ledger,bars,q(102.5,102.6,issue+300),issue+300,.15,'BARS_A');
assert.equal(ledger.history.length,1);
const initial=ledger.history[0];
assert.equal(initial.directionObserved,null,'issue does not know the next close');
assert.equal(initial.originalSide,'BUY');
assert.equal(initial.onlineModel,'BASELINE');
assert.equal(initial.qualityTier,'RESEARCH_CANDIDATE');
assert.equal(initial.strategyVersion,'EVERY_M1_TICK_CONFIRMED_LIMIT_V5');
const later=[...bars,{time:issue,open:bars.at(-1).close,
  close:bars.at(-1).close-.04,
  high:bars.at(-1).close+.03,low:bars.at(-1).close-.07}];
ledger=advanceEveryM1(ledger,later,q(102.5,102.6,issue+60200),
 issue+60300,.15,'BARS_A');
assert.equal(ledger.history[0].directionObserved,'SELL');
assert.ok(ledger.history[0].directionEvaluatedAt>=issue+60000);
assert.equal(ledger.history[0].side==='SELL',false,
 'post-signal negative candle is graded as a missed prediction, not repainted');
const sourceSwap=advanceEveryM1({version:1,history:[{...initial,directionObserved:null,
  directionEvaluatedAt:null}]},later,q(102.5,102.6,issue+60200),
 issue+60300,.15,'OTHER_PROVIDER');
assert.equal(sourceSwap.history[0].directionObserved,'UNKNOWN',
 'source changes cannot count as successful forward predictions');
const revised=later.map(x=>({...x}));
revised[revised.length-2].close+=.3;
const backfill=advanceEveryM1({version:1,history:[{...initial,directionObserved:null,
  directionEvaluatedAt:null}]},revised,q(102.5,102.6,issue+60200),
 issue+60300,.15,'BARS_A');
assert.equal(backfill.history[0].directionObserved,'UNKNOWN',
 'a revised anchor close cannot retroactively validate the directional forecast');
const late=advanceEveryM1({version:1,history:[{...initial,directionObserved:null,
  directionEvaluatedAt:null}]},later,q(102.5,102.6,issue+95000),
 issue+95000,.15,'BARS_A');
assert.equal(late.history[0].directionObserved,'UNKNOWN',
 'a long Render sleep must never backfill historical wins');
const source=fs.readFileSync('lib/scalp-every-candle.ts','utf8');
assert.match(source,/gradeNextClosed\(t,raw,now,chartSource\)/);
assert.match(source,/chooseOnlineM1\(signal,history\)/);
assert.match(source,/legacyNetR/);
assert.match(source,/directionHits/);
const page=fs.readFileSync('app/scalp/page.tsx','utf8');
assert.match(page,/التعلّم الحي من الشموع/);
assert.match(page,/V5 نتائج LIMIT محسومة/);
console.log('PASS: true forward-only frozen M1 grading, 24+12 online inversion, prior vs future isolation, source/sleep integrity, honest V4 P&L');
