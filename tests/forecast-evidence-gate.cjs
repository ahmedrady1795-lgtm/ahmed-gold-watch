const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/forecast-evidence-gate.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{exports:out});
const vote=(name,side,score=70,weight=1)=>({name,side,score,weight});
const run=(votes,extras={})=>out.assessForwardEvidence({
  side:'BUY',votes,historicalDirectional:0,oosN:0,oosAccuracy:null,walkStatus:'COLLECTING',...extras});
const correlated=run([vote('M5','BUY'),vote('M15','BUY'),vote('H4','BUY'),vote('structure','BUY'),vote('path','BUY')]);
assert.equal(correlated.supporting,1,'five technical confirmations belong to one price family');
assert.equal(correlated.independentReady,false,'correlated price votes cannot make a strong forecast');
assert.ok(correlated.confidenceCap<=54);
const independent=run([vote('M5','BUY'),vote('M15','BUY'),vote('liquidity','BUY')]);
assert.equal(independent.supporting,2);
assert.equal(independent.independentReady,true);
assert.equal(independent.validation,'COLLECTING');
assert.equal(independent.confidenceCap,68,'zero forward-tested outcomes cannot justify confidence >68');
const split=run([vote('M5','BUY'),vote('M15','BUY'),vote('liquidity','SELL')]);
assert.equal(split.independentReady,false,'an opposing liquidity family does not confirm a buy');
const poor=run([vote('M5','BUY'),vote('liquidity','BUY')],{
  historicalDirectional:70,oosN:35,oosAccuracy:46,walkStatus:'WATCH'});
assert.equal(poor.validation,'WEAK');
assert.equal(poor.confidenceCap,49);
const supported=run([vote('M5','BUY'),vote('liquidity','BUY')],{
  historicalDirectional:100,oosN:52,oosAccuracy:63,walkStatus:'PASS'});
assert.equal(supported.validation,'SUPPORTED');
assert.ok(supported.confidenceCap>68);
const drift=run([vote('M5','BUY'),vote('liquidity','BUY')],{
  historicalDirectional:100,oosN:52,oosAccuracy:63,walkStatus:'PASS',driftStatus:'DEGRADING'});
assert.equal(drift.validation,'WEAK');
assert.equal(drift.confidenceCap,52);
assert.equal(run([vote('M15','BUY'),vote('liquidity','BUY')],{
  historicalDirectional:11,oosN:2,oosAccuracy:null}).oosAccuracy,null);
assert.equal(run([vote('M15','BUY'),vote('liquidity','BUY'),vote('lead','SELL',NaN)]).independentReady,true);
const api=fs.readFileSync('app/api/ai-analysis/route.ts','utf8');
assert.match(api,/forecastEvidence=assessForwardEvidence/);
assert.match(api,/coreReadyBase&&forecastEvidence\.independentReady/);
assert.match(api,/status:'STALE_FEED'/);
assert.match(api,/if\(!livePulse\)/);
console.log('PASS: independent forecast families, conservative cold-start confidence, degrading OOS guard and stale feed lock');
