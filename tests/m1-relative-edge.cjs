const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const ex={};
const code=ts.transpileModule(
 fs.readFileSync('lib/sniper-m1-relative-edge.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText;
vm.runInNewContext(code,{exports:ex,Math,Number});
const select=ex.selectM1RelativeEdge;
const rows=(pCorrect,fadeCorrect,n=12)=>Array.from({length:n},(_,i)=>{
 const actual='BUY',pressure=i<pCorrect?'BUY':'SELL';
 const bodyFade=i<fadeCorrect?'BUY':'SELL';
 return {actual,pressure,bodyFollow:'SELL',bodyFade,
  threeClose:'SELL',exhaustionFade:'SELL'};
});
const selected=select(rows(6,10),rows(7,10));
assert.equal(selected.model,'BODY_FADE',
 'stronger body-fade can replace lagging but noncatastrophic pressure');
assert.equal(selected.trainHits,10);
assert.equal(selected.trainPressureHits,6);
assert.equal(selected.checkHits,10);
assert.equal(selected.checkPressureHits,7);
assert.equal(select(rows(6,10),rows(10,5)).model,null,
 'selection from training cannot bypass weaker later verification');
assert.equal(select(rows(9,10),rows(7,10)).model,null,
 'less than two additional train wins must never change direction');
assert.equal(select(rows(6,10).slice(0,9),rows(7,10)).model,null,
 'at least ten older observations must be present');
assert.equal(select(rows(6,10),rows(7,10).slice(0,9)).model,null,
 'at least ten later independent checks must be present');
const source=fs.readFileSync('lib/sniper-m1-every-direction.ts','utf8');
const ledger=fs.readFileSync('lib/scalp-every-candle.ts','utf8');
assert.match(source,/recentRelativeEdge\(rows\)/);
assert.match(source,/const side=alternative\?\?\(applyRelative\?/);
assert.match(source,/const weak=flatCluster\|\|applyEarly\|\|applyRelative\|\|applyRecovery\|\|applyConflict\?true/,
 'historical fit is not broker authorization');
assert.match(source,/i<rows\.length-12\?older:later/,
 'two chronologically nonoverlapping windows are required');
assert.match(ledger,/signal\.relativeEdge\?\.applied/);
console.log('PASS: causal 12+12 M1 relative-edge challenger vs pressure and simple candle, no future leakage or entry authority');
