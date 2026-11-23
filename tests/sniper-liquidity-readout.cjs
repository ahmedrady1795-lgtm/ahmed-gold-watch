const assert=require('node:assert/strict'),fs=require('node:fs'),
 ts=require('typescript'),vm=require('node:vm');
const exp={};
vm.runInNewContext(ts.transpileModule(
 fs.readFileSync('lib/sniper-liquidity-readout.ts','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText,{exports:exp});
const read=exp.describeLiquidityBeforeMove;
const now=Date.parse('2026-11-24T10:10:20Z');
const pressure={ok:true,status:'CONDITIONAL_WATCH',stage:'BUILDING',
 side:'BUY',sourceAt:now-40000,trigger:100.6,invalidation:98.8,
 compression:70,sweep:'LOWER',readiness:55,reason:'price pressure'};
const base={now,price:100,marketFresh:true,context:null,preMove:pressure};
const before=read(base);
assert.equal(before.state,'ACCUMULATION');
assert.equal(before.source,'M1_M5_CLOSED');
assert.equal(before.aheadSide,'BUY');
assert.equal(before.trigger,100.6);
assert.match(before.label,/تجميع سعري محتمل/);
const sell=read({...base,preMove:{...pressure,side:'SELL',trigger:99.4,
 invalidation:101.2,sweep:'UPPER'}});
assert.equal(sell.state,'DISTRIBUTION');
assert.equal(sell.aheadSide,'SELL');
assert.match(sell.label,/تصريف سعري محتمل/);
for(const patch of [
 {marketFresh:false},{price:null},{preMove:{...pressure,sourceAt:now-120000}},
 {preMove:{...pressure,stage:'RELEASED'}},
 {preMove:{...pressure,status:'NOT_READY'}},
 {preMove:{...pressure,trigger:99.7}},
 {preMove:{...pressure,sourceAt:now+1000}}
 ])assert.notEqual(read({...base,...patch}).aheadSide,'BUY',
  'stale/crossed/future prebreak must not be promoted to current buy');
const context={label:'تجميع سعري مرصود',low:99.8,high:100.4,historical:false};
const inside=read({...base,preMove:null,context});
assert.equal(inside.state,'ACCUMULATION');
assert.equal(inside.source,'M15_CLOSED');
assert.equal(inside.aheadSide,'WAIT');
assert.equal(inside.trigger,null);
const old=read({...base,preMove:null,context:{...context,historical:true}});
assert.equal(old.state,'BALANCE');
assert.equal(old.aheadSide,'WAIT');
const conflict=read({...base,context:{...context,label:'تصريف سعري مرصود'}});
assert.equal(conflict.state,'BALANCE','opposing M15 must never be disguised as accumulation');
assert.equal(conflict.aheadSide,'WAIT');
assert.equal(read({...base,preMove:null,context:null}).state,'BALANCE');
const panel=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const css=fs.readFileSync('app/qannas-chart-focus.css','utf8');
assert.match(panel,/describeLiquidityBeforeMove\(\{/);
assert.match(panel,/data-qannas-liquidity-state=\{liquidityReadout.state\}/);
assert.match(panel,/liquidityReadout.aheadSide!=='WAIT'&&liquidityReadout.trigger!=null/);
assert.match(css,/\.sniper-chart-liquidity\.is-accumulation b/);
assert.match(css,/\.sniper-chart-liquidity\.is-distribution b/);
const ml=fs.readFileSync('lib/ml-prediction.ts','utf8');
const neural=fs.readFileSync('lib/neural-prediction.ts','utf8');
const health=fs.readFileSync('lib/ai-readiness.ts','utf8');
assert.match(ml,/setTimeout\(\(\)=>controller.abort\(\),22000\)/);
assert.match(neural,/setTimeout\(\(\)=>controller.abort\(\),22000\)/);
assert.match(health,/AbortSignal.timeout\(10000\)/);
assert.match(ml,/recordAiResponse\(url,r.status,r.headers.get\('retry-after'\)\)/);
assert.match(neural,/recordAiResponse\(url,r.status,r.headers.get\('retry-after'\)\)/);
console.log('PASS: only closed-source accumulation/distribution, prospective triggers, stale/late/conflict rejection, 429-aware extended cold-start timers');
