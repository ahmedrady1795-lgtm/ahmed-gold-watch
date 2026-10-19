const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const module_={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/chart-observation-radar.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:module_,exports:module_.exports,require},{filename:'chart-observation-radar'});
const {assessChartObservation:radar,observedStructuralTargets:targets}=module_.exports;
const now=Date.parse('2026-10-17T12:00:00.000Z');
function history(n,ms,fall=true){
 return Array.from({length:n},(_,i)=>{
  const base=1000+(fall?-1:1)*i*.9;
  return {time:now-(n-i)*ms,open:base,high:base+2.2+(i%5)*.21,
   low:base-2.3-(i%4)*.12,close:base+(fall?-.35:.35)};
 });
}
const m1=history(60,60000),m5=history(36,300000),
  m15=history(50,900000),h1=history(50,3600000);
const input={now,priceFresh:true,historyFresh:true,marketOpen:true,m1,m5};
let state=radar(input);
assert.equal(state.status,'ALIGNED','real bearish bars align without needing a trade entry');
assert.equal(state.m1Side,'SELL');assert.equal(state.m5Side,'SELL');
assert.equal(state.actionable,false,'observation must never be an executable signal');
assert.equal(radar({...input,priceFresh:false}).status,'UNAVAILABLE','stale quote cannot promote a direction');
assert.equal(radar({...input,marketOpen:false}).status,'UNAVAILABLE','closed session cannot promote a direction');
const gap=[...m1];gap[53]={...gap[53],time:gap[53].time+60000};
assert.equal(radar({...input,m1:gap}).status,'M5_ONLY',
 'a single corrupt M1 must not hide independently healthy M5 market analysis');
assert.equal(radar({...input,historyFresh:false}).status,'M5_ONLY',
 'M5 remains a read-only observation if the M1 archive is gapped');
assert.equal(radar({...input,historyFresh:false}).m1Side,'WAIT',
 'M1 cannot vote when its history is unverified');
const flipped=history(60,60000,false);
assert.equal(radar({...input,m1:flipped}).status,'CONFLICT','opposed M1/M5 must be displayed as conflict');
const levels=targets({now,price:1000,side:'SELL',priceFresh:true,historyFresh:true,m15,h1});
assert.ok(levels.length>0&&levels.length<=3,'observed historical structures can produce up to three targets');
assert.ok(levels.every(t=>t.price<1000&&t.kind==='OBSERVED'&&
  [...m15,...h1].some(b=>Math.abs(b.low-t.price)<.006)),
 'each target is an actual observed low from a closed M15 or H1 candle');
assert.ok(levels.every((t,i)=>t.stage===i+1&&(i===0||t.price<levels[i-1].price)),
 'SELL targets are naturally in order away from current price');
assert.equal(targets({now,price:1000,side:'WAIT',priceFresh:true,historyFresh:true,m15,h1}).length,0);
assert.equal(targets({now,price:1000,side:'SELL',priceFresh:false,historyFresh:true,m15,h1}).length,0);
assert.equal(targets({now,price:1000,side:'SELL',priceFresh:true,historyFresh:false,m15,h1}).length,0);
const drifted=h1.map(b=>({...b,time:b.time-25*3600000}));
assert.equal(targets({now,price:1000,side:'SELL',priceFresh:true,historyFresh:true,m15:[],h1:drifted}).length,0,
 'old H1 records cannot be repackaged as live watch objectives');
const chart=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
assert.doesNotMatch(chart,/downloadActualChartPng|chartSvgRef|📷 صورة فعلية/,
 'user requested complete removal of screenshot button and capture code');
assert.match(chart,/watchTargets\.map\(t=>/,'conditional TP chips remain visible independently of trade eligibility');
assert.match(chart,/assessBreakoutWatch/,'breakout progression remains');
assert.match(chart,/primaryLiquidityZone/,'liquidity map remains');
assert.match(chart,/assessChartObservation/,'read-only technical observations remain');
assert.match(chart,/const watchTargets=!planVisible\?observedStructuralTargets\(/,
 'structural watch TP must only be derived outside a qualified trade plan');
console.log('PASS: M1/M5 observation, no stale entries, historic TP levels, breakout, liquidity and removed PNG control');
