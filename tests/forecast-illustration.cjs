const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
function read(path,customRequire){
  const module={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
  }).outputText,{module,exports:module.exports,require:customRequire||require},{filename:path});
  return module.exports;
}
const next=read('lib/next-move-view.ts');
const long=read('lib/long-range-targets.ts');
const {frames}=require('./long-range-fixture.cjs');
const sniper=read('lib/sniper-outlook.ts',p=>p==='./next-move-view'?next:p==='./long-range-targets'?long:require(p));
const watch=read('lib/structural-watch.ts',p=>p==='./long-range-targets'?long:require(p));
const {buildForecastIllustration:build}=read('lib/forecast-illustration.ts',
  p=>p==='./sniper-outlook'?sniper:p==='./structural-watch'?watch:require(p));
const now=Date.parse('2026-10-11T10:00:00Z');
const candles=Array.from({length:46},(_,i)=>{
  const price=99+i*.02;
  return {time:now-(46-i)*60000,open:price,high:price+.18,low:price-.16,
    close:price+.08,volume:i+1};
});
const base={
  livePulse:{price:100,sourceTime:now-1500},
  chartCandles:candles,
  chartHigherFrames:frames(now),
  forwardMove:{side:'BUY',confidence:70,targets:{
    t1:{price:102,low:101.8,high:102.2,quality:85},
    t2:{price:103,low:102.9,high:103.1,quality:75},
    invalidation:98.8},windowSeconds:{min:120,max:600}},
  forecastValidation15m:{global:{hits:70,fails:30,accuracy:70}},
  huntForecast:{zoneForecast:{support:{low:99,high:99.5},
    pathForecast:{reboundZone:{low:99.6,high:99.8}}}},
  accumulation:{ok:true,side:'BUY',phase:'ACCUMULATING',breakoutReadiness:71}
};
let m=build('GOLD',base,null,now,now-10000);
assert.equal(m.ready,true);
assert.equal(m.historyFresh,true);
assert.equal(m.candles.length,46);
assert.ok(m.projected.length>=2&&m.projected.length<=4);
assert.equal(m.projected[0].price,100);
assert.equal(m.bands.some(b=>b.key==='TP1'&&b.price>100.5),true);
assert.equal(m.bands.some(b=>b.kind==='STOP'&&b.price===98.8),true);
assert.equal(m.bands.some(b=>b.kind==='REBOUND'),true);
assert.ok(m.upper>101&&m.lower<98.8);
m=build('GOLD',{...base,chartCandles:candles.map(c=>({...c,time:c.time-600000}))},null,now,now-10000);
assert.equal(m.ready,false,'stale candles must veto a projected arrow');
assert.equal(m.projected.length,0);
assert.equal(m.bands.some(b=>b.kind==='TARGET'),false);
m=build('GOLD',{...base,livePulse:{price:100,sourceTime:now-30000}},null,now,now-10000);
assert.equal(m.ready,false,'stale current price must not project');
assert.equal(m.projected.length,0);
m=build('GOLD',{...base,forwardMove:{side:'WAIT'}},null,now,now-10000);
assert.equal(m.ready,false,'no directional target must not draw a projected path');
m=build('GOLD',{...base,chartCandles:[{time:now-60000,open:1,close:20,low:2,high:10},...candles]},null,now,now-10000);
assert.equal(m.candles.length,46,'malformed price candle is rejected');
assert.equal(m.candles.at(-1).time,now-60000);

m=build('GOLD',base,null,now,now-10000,null,true);
assert.equal(m.ready,false,'audited entry must never exist without an ACTIVE ledger record');
assert.equal(m.watchReady,true,'live qualified levels should still be visible as non-tradable watch');
assert.equal(m.projected.length>=2,true);
const archived={side:'BUY',startPrice:100,invalidation:101,confidence:82,
  targets:[{stage:1,price:999,low:998,high:999,quality:85,kind:'STRUCTURAL',reached:false}],
  capturedAt:now-100000,modelAt:now-100000,expiresAt:now-20000,
  lastConfirmedAt:now-30000,state:'INVALIDATED',message:'Archived invalidation'};
m=build('GOLD',base,null,now,now-10000,archived,true);
assert.equal(m.ready,false,'invalidated ledger cannot activate');
assert.equal(m.watchReady,true,'a distinct live market watch remains separate from prior ledger');
assert.ok(m.displayTargets.every(t=>t.price!==999),'old target never reused as current');
assert.ok(m.displayStop!==101,'old invalid stop never reused');
m=build('GOLD',{...base,livePulse:{price:100,sourceTime:now-30000}},
  null,now,now-10000,archived,true);
assert.equal(m.watchReady,false,'price staleness vetoes watch even with an archived record');
assert.equal(m.displayTargets.length,0,'stale archives stay off main price chart');
console.log('PASS: real candles, numeric targets, rebound, stop, freshness and no imaginary arrows');
