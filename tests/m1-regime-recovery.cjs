const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const e={};vm.runInNewContext(ts.transpileModule(
 fs.readFileSync('lib/sniper-m1-regime-recovery.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
 }).outputText,{exports:e});
const decide=e.selectM1RegimeRecovery;
const same=(observed,pressure='SELL')=>({
 pressure,bodyFollow:'BUY',bodyFade:'SELL',threeClose:'BUY',observed
});
const win=Array.from({length:8},(_,i)=>same(i===7?'SELL':'BUY'));
const loss=Array.from({length:8},(_,i)=>same(i<5?'SELL':'BUY'));
const selected=decide(win,win);
assert.equal(selected.model,'BODY_FOLLOW');
assert.equal(selected.trainN,8);
assert.equal(selected.checkN,8);
assert.equal(selected.pressureTrain,1);
assert.equal(selected.challengerCheck,7);
assert.equal(decide(win,win.slice(0,7)).model,null,'not 8 later outcomes');
assert.equal(decide(win,loss).model,null,'failing later window cancels change');
assert.equal(decide(loss,win).model,null,'older training must support change');
assert.equal(decide(Array.from({length:8},()=>same('SELL')),
 win).model,null,'do not flip a healthy existing pressure model');
const s=fs.readFileSync('lib/sniper-m1-every-direction.ts','utf8');
assert.match(s,/const recovery=adaptive\.improved\|\|reversal!=null\?null:recoverRecentM1\(rows\)/);
assert.match(s,/const weak=applyRecovery\|\|applyConflict\?true/);
assert.match(s,/const side=alternative\?\?\(applyRecovery\?/);
const ledger=fs.readFileSync('lib/scalp-every-candle.ts','utf8');
assert.match(ledger,/signal\.recentRecovery\?\.applied/);
console.log('PASS: causal 8+8 pressure failure recovery; no one-window flip, weak-only research, frozen model provenance');
