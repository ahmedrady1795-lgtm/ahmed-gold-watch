const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
function load(path,requireFn){
  const mod={exports:{}};
  const compiled=ts.transpileModule(fs.readFileSync(path,'utf8'),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
  }).outputText;
  vm.runInNewContext(compiled,{module:mod,exports:mod.exports,require:requireFn||require},
    {filename:path});
  return mod.exports;
}
const next=load('lib/next-move-view.ts');
const long=load('lib/long-range-targets.ts');
const {frames}=require('./long-range-fixture.cjs');
const {buildSniperOutlook:build}=load('lib/sniper-outlook.ts',
  path=>path==='./next-move-view'?next:path==='./long-range-targets'?long:require(path));
const now=Date.parse('2026-10-11T10:00:00Z');
const base={
  chartHigherFrames:frames(now),
  livePulse:{price:100,sourceTime:now-3000},
  forwardMove:{side:'BUY',confidence:72,targets:{
    t1:{price:102,low:101.8,high:102.2,kind:'LIQUIDITY',quality:74},
    t2:{price:104,low:103.8,high:104.2,kind:'STRUCTURE',quality:64},
    t3:{price:106,low:105.8,high:106.2,kind:'PROJECTION',quality:38},
    invalidation:99},windowSeconds:{min:120,max:600},status:'PRE_MOVE'},
  forecastValidation15m:{global:{hits:80,fails:20,accuracy:80}},
  marketLead:{available:true,side:'BUY',stage:'ARMED',armed:true,sourceAt:now-2000},
  accumulation:{ok:true,phase:'ACCUMULATING',side:'BUY',breakoutReadiness:72},
  liquidity:{ok:true,checkedAt:now-3000,buy:63,sell:37,mode:'DOM'},
  huntForecast:{horizons:{
    twoMinute:{side:'BUY',confidence:75,price:100.5},
    fiveMinute:{side:'BUY',confidence:70,price:101.8},
    fifteenMinute:{side:'BUY',confidence:69,price:102.5},
    thirtyMinute:{side:'BUY',confidence:64,price:104}},
    zoneForecast:{support:{low:99,high:99.6},
      pathForecast:{reboundZone:{low:99.7,high:100}}}}
};
const view=(x=base,time=now)=>build('GOLD',x,null,time,now-10000);
let s=view();
assert.equal(s.view.side,'BUY');
assert.equal(s.stage,'ARMED');
assert.ok(s.targets.length>=1&&s.targets.length<=3);
assert.ok(s.targets[0].price>100+Number(s.longRange.minDistance||0));
assert.ok(s.targets.every(t=>t.kind==='STRUCTURAL'));
assert.equal(s.longRange.basis.includes('M15/H1'),true);
assert.equal(s.arrival?.min,24);
assert.equal(s.arrival?.max,36);
assert.equal(s.activation.min,2);
assert.equal(s.flow.buy,63);
assert.equal(s.zones.some(z=>z.label==='منطقة ارتداد'),true);
assert.equal(s.view.target,102);
s=view({...base,livePulse:{price:100,sourceTime:now-30000}});
assert.equal(s.view.side,'WAIT');
assert.equal(s.targets.length,0);
assert.equal(s.arrival,null);
assert.equal(s.flow,null);
s=view({...base,forecastValidation15m:{global:{hits:49,fails:51,accuracy:49}}});
assert.equal(s.view.side,'WAIT');
assert.equal(s.targets.length,0);
assert.equal(s.stage,'BUILDING','early setup allowed, NOT a tradable signal');
s=view({...base,huntForecast:{...base.huntForecast,horizons:{
  twoMinute:{side:'SELL',confidence:80,price:98},
  fiveMinute:{side:'WAIT',confidence:10,price:102},
  fifteenMinute:{side:'BUY',confidence:40,price:103},
  thirtyMinute:{side:'BUY',confidence:70,price:103}
}}});
assert.equal(s.arrival.min,24,'opposite/weak horizon cannot forecast early reach');
assert.equal(s.arrival.max,36);
s=view({...base,forwardMove:{...base.forwardMove,targets:{
  t1:{price:98},invalidation:99}}});
assert.equal(s.view.side,'WAIT');
assert.equal(s.targets.length,0);
console.log('PASS: distant structural sniper targets, 30m-only arrival, freshness, validation and liquidity');