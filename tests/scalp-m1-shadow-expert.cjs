const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const js=ts.transpileModule(fs.readFileSync('lib/scalp-m1-shadow-expert.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText;
const exports={};vm.runInNewContext(js,{exports,Number,Math,Date},{
 filename:'lib/scalp-m1-shadow-expert.ts'});
const {chooseM1ShadowExpert,auditM1ShadowExpert,
 M1_SHADOW_TRAIN,M1_SHADOW_CHECK}=exports;
assert.equal(M1_SHADOW_TRAIN,8);
assert.equal(M1_SHADOW_CHECK,8);
const T=Date.parse('2026-11-06T01:00:00Z');
const signal={issuedAt:T+17*60000,side:'BUY',weak:true,pattern:'MOMENTUM'};
const rows=Array.from({length:16},(_,i)=>({
 issuedAt:T+i*60000,side:'BUY',originalSide:'BUY',
 weak:true,pattern:'MOMENTUM',chartSource:'Biquote M1',
 directionObserved:'SELL',directionEvaluatedAt:T+(i+1)*60000
}));
const select=(history,extra={})=>chooseM1ShadowExpert(
 {...signal,...extra},history,'Biquote M1');
let c=select(rows);
assert.equal(c.model,'REVERSAL_SHADOW');
assert.equal(c.side,'SELL');
assert.equal(c.prior,16);
assert.equal(c.trainTotal,8);
assert.equal(c.checkedTotal,8);
assert.equal(c.trainHits,0);
assert.equal(c.checkedHits,0);
assert.equal(select(rows.slice(0,15)).model,'BASELINE_SHADOW',
 '15 outcomes cannot be treated as a validated 8+8 comparison');
assert.equal(select(rows.map((r,i)=>i>=8?{...r,directionObserved:'BUY'}:r))
 .model,'BASELINE_SHADOW','later disjoint failures must confirm early failures');
assert.equal(select(rows.map((r,i)=>i<8?{...r,directionObserved:'BUY'}:r))
 .model,'BASELINE_SHADOW','later fails alone are insufficient');
assert.equal(select(rows.map((r,i)=>i===15?{...r,
 directionEvaluatedAt:signal.issuedAt+60000}:r)).model,'BASELINE_SHADOW',
 'results measured after issuance must not enter the decision');
assert.equal(select(rows.map((r,i)=>i===15?{...r,
 directionEvaluatedAt:r.issuedAt+1000}:r)).model,'BASELINE_SHADOW',
 'grades before their candle closes are not causal evidence');
assert.equal(select(rows,{weak:false}).model,'BASELINE_SHADOW',
 'weak and candidate regimes must never leak into one another');
assert.equal(select(rows,{pattern:'SWEEP_REJECTION'}).model,'BASELINE_SHADOW',
 'reversal patterns and momentum are separate');
assert.equal(select(rows.map((r,i)=>i===0?{...r,
 chartSource:'OTHER_PROVIDER'}:r)).model,'BASELINE_SHADOW',
 'source mixing must never license quick inversion');
assert.equal(select(rows,{issuedAt:T+150*60000})
 .model,'BASELINE_SHADOW','old market regime evidence must expire');
assert.equal(select([...rows,{...rows[0],
 issuedAt:signal.issuedAt+60000,directionEvaluatedAt:signal.issuedAt+120000,
 directionObserved:'BUY'}]).side,'SELL',
 'future outcomes cannot repaint an existing frozen shadow decision');
const audit=auditM1ShadowExpert([
 {...rows[0],shadowSide:'SELL',shadowModel:'REVERSAL_SHADOW'},
 {...rows[1],shadowSide:'SELL',shadowModel:'REVERSAL_SHADOW'},
 {...rows[2],shadowSide:'BUY',shadowModel:'BASELINE_SHADOW'},
 {...rows[3],shadowSide:'SELL',shadowModel:'REVERSAL_SHADOW',
  directionObserved:'UNKNOWN'},
 {...rows[4],shadowSide:'SELL',shadowModel:'REVERSAL_SHADOW',
  directionObserved:null},
 {...rows[5],shadowSide:undefined,shadowModel:undefined}
]);
assert.equal(audit.issued,5);
assert.equal(audit.proposedFlips,4);
assert.equal(audit.all.graded,3);
assert.equal(audit.all.shadowHits,2);
assert.equal(audit.all.liveHits,0);
assert.equal(audit.flipped.graded,2);
assert.equal(audit.flipped.shadowHits,2);
assert.equal(audit.unknown,1);
assert.equal(audit.waiting,1);
const engine=fs.readFileSync('lib/scalp-every-candle.ts','utf8');
assert.match(engine,/chooseM1ShadowExpert\(signal,history,chartSource\)/);
assert.match(engine,/shadowSide:shadow\.side,shadowModel:shadow\.model/);
assert.match(engine,/shadowExpert=auditM1ShadowExpert\(hist\)/);
assert.match(engine,/const proposed=online\.side/);
assert.doesNotMatch(engine,/const proposed=shadow\.side/,
 'shadow challenger cannot override paper Limit direction');
const page=fs.readFileSync('app/scalp/page.tsx','utf8');
assert.match(page,/نموذج عكسي منافس/);
assert.match(page,/data\?\.learning\?\.shadowExpert\?\.flipped\?\.graded/);
const tape=fs.readFileSync('components/SniperM1CandleTape.tsx','utf8');
assert.match(tape,/إعادة اختبار تاريخية، مش توقعات LIVE/);
console.log('PASS: fast M1 8+8 shadow learner stays prospective, source-safe, OOS-uncertified and never alters Limit execution');
