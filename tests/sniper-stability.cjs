const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const exportsObject={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/sniper-stability.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{exports:exportsObject});
const {stabilizeSniperBias:stabilize}=exportsObject;
const start=Date.parse('2026-10-11T12:00:00Z');
const a=(side,period=start)=>({
  side,status:'LIVE',label:side,reason:'structural observation',active:true,
  agreement:3,opposition:false,lastClosedAt:period,
  m15ClosedAt:period,votes:{m5:side,m15:side,h1:side,h4:side},
  targets:side==='WAIT'?[]:[{stage:1,price:side==='BUY'?105:95,
    low:side==='BUY'?105:95,high:side==='BUY'?105:95,quality:85,
    kind:'STRUCTURAL',source:'H4 · قمة/قاع مؤكد',distanceAtr:4}],
  invalidation:side==='BUY'?98:102,rangeBound:side==='WAIT'
});
let response=stabilize(null,a('BUY'),100,start);
assert.equal(response.bias.side,'BUY');
assert.equal(response.bias.targets[0].price,105);
const initial=response.state;
const drift={...a('WAIT',start+300000),votes:{
  m5:'WAIT',m15:'WAIT',h1:'BUY',h4:'BUY'}};
response=stabilize(initial,drift,100.1,start+300000);
assert.equal(response.bias.side,'BUY','one undecided lower-frame close must not erase long bias');
assert.equal(response.held,true);
assert.equal(response.bias.targets[0].price,105);
const reverse=(ts)=>({...a('SELL',ts),votes:{
  m5:'SELL',m15:'SELL',h1:'SELL',h4:'BUY'}});
response=stabilize(initial,reverse(start+900000),100,start+900000);
assert.equal(response.bias.side,'BUY','first contrary M15 close only warns');
assert.equal(response.state.oppositeBars,1);
let next=stabilize(response.state,reverse(start+900000),100,start+900000+10000);
assert.equal(next.bias.side,'BUY','repeating the SAME M15 bar is NOT a second confirmation');
assert.equal(next.state.oppositeBars,1);
next=stabilize(next.state,reverse(start+1800000),100,start+1800000);
assert.equal(next.bias.side,'SELL','second distinct opposing M15 closure confirms reversal');
assert.equal(next.bias.targets[0].price,95);
const noHighConfirmation={...reverse(start+2700000),
  votes:{m5:'SELL',m15:'SELL',h1:'BUY',h4:'BUY'}};
response=stabilize(initial,noHighConfirmation,100,start+2700000);
assert.equal(response.bias.side,'BUY','H1/H4 disagreement blocks shallow reversal');
assert.equal(response.state.oppositeBars,0);
const breached=stabilize(initial,a('WAIT',start+300000),97.9,start+300000);
assert.equal(breached.bias.side,'WAIT','historical invalidation vetoes held bias without lag');
assert.equal(breached.bias.targets.length,0);
assert.equal(breached.state,null);
const stale=stabilize(initial,{...a('SELL',start+900000),active:false,status:'PAUSED'},
  100,start+900000);
assert.equal(stale.bias.status,'PAUSED');
assert.equal(stale.bias.active,false);
assert.equal(stale.bias.targets.length,0,'stale data must not revive active targets');
assert.equal(stale.bias.side,'BUY','old orientation must be labeled as historical only');
const reached=stabilize(initial,a('BUY',start+900000),106,start+900000);
assert.equal(reached.bias.targets.length,0,'a passed historical target must not remain ahead');
console.log('PASS: hysteresis, distinct M15 confirmations, higher-timeframe guard, breaching stop, no stale or crossed targets');
