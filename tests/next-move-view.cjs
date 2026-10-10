const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const exports_={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/next-move-view.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{exports:exports_});
const {buildNextMoveView:read}=exports_;
const now=Date.parse('2026-10-11T10:00:00Z');
const x={
  livePulse:{price:100,sourceTime:now-5000},
  forwardMove:{side:'BUY',confidence:72,targets:{
    t1:{price:102},invalidation:99}},
  forecastValidation15m:{global:{hits:80,fails:20,accuracy:80}},
  movementEnvelope:{m15:{status:'READY',lowerPrice:97,upperPrice:103,
    walkForward:{rangeQuality:'IN_RANGE'}}}
};
const view=(asset='GOLD',a=x,t=now,q=null,produced=now-15000)=>
  read(asset,a,q,t,produced);
let v=view();
assert.equal(v.side,'BUY');
assert.equal(v.priceFresh,true);
assert.equal(v.target,102);
assert.equal(v.invalidation,99);
assert.equal(v.targetDistancePct,2);
assert.equal(v.riskDistancePct,1);
assert.equal(v.hasHistoricalBand,true);
assert.equal(v.bandLower,97);
v=view('GOLD',{...x,livePulse:{price:100,sourceTime:now-20001}});
assert.equal(v.side,'WAIT','21-second quote is not a real-time trading forecast');
assert.equal(v.target,null);
v=view('GOLD',{...x,livePulse:{price:100,sourceTime:now-5000}},now,
  {ok:true,price:101,sourceTime:now-2000});
assert.equal(v.price,101,'Fresh broker quote overrides older market pulse');
v=view('GOLD',x,now,null,now-90001);
assert.equal(v.side,'WAIT','Expired analysis cannot accompany a fresh quote');
v=view('GOLD',{...x,forwardMove:{side:'BUY',targets:{t1:{price:98},invalidation:99}}});
assert.equal(v.side,'WAIT','Upside target below price must not be actionable');
v=view('GOLD',{...x,forwardMove:{side:'BUY',targets:{t1:{price:102},invalidation:101}}});
assert.equal(v.side,'WAIT','Stop on wrong side of entry must not be actionable');
v=view('GOLD',{...x,forecastValidation15m:{
  global:{hits:245,fails:237,accuracy:50.8}}});
assert.equal(v.side,'WAIT','Near-chance validated gold directions are unqualified');
assert.equal(v.quality,'UNQUALIFIED');
v=view('BTC',{...x,forwardMove:{side:'SELL',confidence:68,targets:{
  t1:{price:98},invalidation:101}}});
assert.equal(v.side,'SELL','Fresh downside with logical target and stop shows SELL');
v=view('BTC',{...x,movementEnvelope:{m15:{status:'READY',
  lowerPrice:97,upperPrice:103,walkForward:{rangeQuality:'MIS_CALIBRATED'}}}});
assert.equal(v.hasHistoricalBand,false,'Poorly calibrated intervals must not be displayed');
v=view('GOLD',{...x,livePulse:{price:100,sourceTime:now+60000}});
assert.equal(v.side,'WAIT','Future quotes cannot establish current price');
console.log('PASS: next move freshness, side/target/stop, near-chance veto, forecast horizon and calibrated range');
