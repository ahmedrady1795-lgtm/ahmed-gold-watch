const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/hunt-forecast.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:mod,exports:mod.exports,require:()=>({commitDirection(){}}),console});
const {stabilizeZoneForecast:run}=mod.exports;
const at=Date.parse('2026-10-18T12:00:00Z');
const zone=(side,confidence=66)=>({side,confidence,decisionReady:true,
  origin:{low:90,high:110,strength:70},target:{low:side==='BUY'?120:80,high:side==='BUY'?122:82,mid:side==='BUY'?121:81,strength:70}});
for(const side of ['BUY','SELL']){
  const key='frequency-'+side,other=side==='BUY'?'SELL':'BUY';
  run(key,zone(side),100,1,at,at);
  for(let i=1;i<50;i++){
    const x=run(key,zone(other,80),100,1,at+i*1000,at);
    assert.equal(x.side,side,'repeated snapshots cannot reverse an intact zone');
    assert.equal(x.decisionReady,false,'held contradictory zone is never ready');
    assert.equal(x.stability.confirmedBars,0);
  }
  let x=run(key,zone(other,80),100,1,at+60000,at+60000);
  assert.equal(x.side,side);assert.equal(x.stability.confirmedBars,1);
  x=run(key,zone(other,80),100,1,at+61000,at+60000);
  assert.equal(x.stability.confirmedBars,1);
  x=run(key,zone(other,80),100,1,at+120000,at+120000);
  assert.equal(x.side,other);assert.equal(x.decisionReady,true);
}
run('gap',zone('BUY'),100,1,at,at);
run('gap',zone('SELL',80),100,1,at+60000,at+60000);
assert.equal(run('gap',zone('SELL',80),100,1,at+180000,at+180000).side,'BUY','missing close resets streak');
run('weak',zone('BUY'),100,1,at,at);
assert.equal(run('weak',{...zone('WAIT'),decisionReady:false},100,1,at+1000,at).decisionReady,false,'weak grace period cannot inherit readiness');
run('missing',zone('BUY'),100,1,at,at);
assert.equal(run('missing',zone('SELL',90),100,1,at+60000).side,'BUY','missing candle evidence cannot confirm reversal');
console.log('PASS: zone reversal uses distinct adjacent M1 closes; held/weak maps cannot retain readiness');
assert.equal(run('missing',zone('SELL',90),100,1,at+360000).side,'WAIT','expired maps cannot freeze the old direction indefinitely');
run('broken',zone('BUY'),100,1,at,at);
run('broken',{side:'WAIT',decisionReady:false},80,1,at+1000,at);
assert.equal(run('broken',zone('SELL'),100,1,at+2000,at).side,'SELL','broken map must not revive after price retraces');
