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
const sniper=read('lib/sniper-outlook.ts',p=>p==='./next-move-view'?next:require(p));
const {buildForecastIllustration:build}=read('lib/forecast-illustration.ts',
  p=>p==='./sniper-outlook'?sniper:require(p));
const now=Date.parse('2026-10-11T10:00:00Z');
const candles=Array.from({length:46},(_,i)=>{
  const price=99+i*.02;
  return {time:now-(46-i)*60000,open:price,high:price+.18,low:price-.16,
    close:price+.08,volume:i+1};
});
const base={
  livePulse:{price:100,sourceTime:now-1500},
  chartCandles:candles,
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
assert.equal(m.projected.length,3);
assert.equal(m.projected[0].price,100);
assert.equal(m.bands.some(b=>b.key==='TP1'&&b.price===102),true);
assert.equal(m.bands.some(b=>b.kind==='STOP'&&b.price===98.8),true);
assert.equal(m.bands.some(b=>b.kind==='REBOUND'),true);
assert.ok(m.upper>103&&m.lower<98.8);
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
console.log('PASS: real candles, numeric targets, rebound, stop, freshness and no imaginary arrows');
