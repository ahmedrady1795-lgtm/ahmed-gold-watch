const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const exportsObject={};
const source=fs.readFileSync('lib/scalp-learning.ts','utf8')+'\nexport const testHooks={evaluate,planFrom};';
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsObject});
const {trainScalpLearner,testHooks:{evaluate,planFrom}}=exportsObject;
const now=Date.parse('2026-10-08T20:00:00Z');
const candles=Array.from({length:760},(_,i)=>({time:now-(760-i)*60000,open:2000+i*.1,close:2000+i*.1+.08,high:2000+i*.1+.2,low:2000+i*.1-.1}));
assert.equal(trainScalpLearner(candles,now,1.5).costAtr,1.5,'Costs greater than .28 ATR must not be discounted');
for(const cost of [NaN,Infinity,-1])assert.match(trainScalpLearner(candles,now,cost).reasons[0],/تكلفة/);
for(const bad of [candles.filter((_,i)=>i!==740),[...candles.slice(0,-1),candles.at(-2)],candles.map((c,i)=>i===759?{...c,high:NaN}:c),candles.map(c=>({...c,time:c.time-180000})),[...candles,{...candles.at(-1),time:now+60000}]]){
 const r=trainScalpLearner(bad,now,.1);assert.equal(r.ok,false);assert.equal(r.side,'WAIT');assert.equal(r.sampleCount,0);
}
const model={means:[0],sds:[1],weights:[1],threshold:.2};
const rows=Array.from({length:10},(_,i)=>({entryAt:i*60000,exitAt:(i+5)*60000,x:[1],fwdAtr:1,mfeAtr:2,maeAtr:-.1}));
assert.equal(evaluate(rows,model,.1).used,2,'Five-minute labels cannot count overlapping positions as independent outcomes');
assert.ok(evaluate(rows,model,1.5).netEdgeAtr<0,'High real costs must turn a gross winner into a net loss');
assert.ok(planFrom(rows,5,.04,'BUY').takeAtr>planFrom(rows,5,.04,'SELL').takeAtr,'Sell target must not use future upside as its favorable excursion');
assert.ok(planFrom(rows,5,.04,'SELL').stopAtr>planFrom(rows,5,.04,'BUY').stopAtr,'Sell risk must use upside adversity');
console.log('PASS: learner cost integrity, invalid/stale/gapped data, nonoverlapping evaluation, directional exit geometry');
const costExports={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/scalp-cost.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:costExports});
const cost=costExports.learnerCostAtr;
assert.equal(cost('BTC',80000,20,1,{}),5.65,'BTC costs include round-trip fees and slippage, not just spread');
assert.equal(cost('BTC',80000,20,1,{SCALP_BTC_FEE_BPS:'0',SCALP_BTC_SLIPPAGE_BPS:'0'}),.05);
assert.ok(Number.isNaN(cost('BTC',80000,20,1,{SCALP_BTC_FEE_BPS:'bad'})));
console.log('PASS: analysis includes venue costs and rejects invalid cost configuration');
