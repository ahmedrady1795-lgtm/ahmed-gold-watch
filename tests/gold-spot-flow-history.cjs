const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const exports_={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/gold-liquidity-meter.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:exports_});
const combine=exports_.combineGoldLiquidity,now=1700000000000;
const source='Kraken PAXG/USD proxy';
const token={source,side:'NEUTRAL',observedAt:now,tradeAt:now-1000,count:30,tradeDeltaPct:80,
 executionHistory:{source,asOf:now-1000,count:40,spanSeconds:50,buy60s:20,sell60s:80}};
const a=combine(null,token,now,true);
assert.equal(a.fastBuyPct,90);assert.equal(a.buyPct,34);
assert.equal(a.stableSources,1);assert.equal(a.historyReady,true);
assert.equal(a.strongSide,'WAIT','one proxy cannot become a strong signal');
assert.equal(combine(null,{...token,executionHistory:{...token.executionHistory,source:'wrong'}},now,true).buyPct,90);
assert.equal(combine(null,token,now+15000,true).buyPct,null);
console.log('PASS: independent 60s spot history, fast tape, freshness and source isolation');
