const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/chart-trading-overlay.ts','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText,{module:m,exports:m.exports});
const build=m.exports.buildChartOverlay;
const now=Date.parse('2026-10-12T12:00:00Z');
const m5=Array.from({length:28},(_,i)=>({
  time:now-(28-i)*300000,open:100+i*.02,high:100.35+i*.02,
  low:99.7+i*.02,close:100.1+i*.02
}));
const source={now,price:100.5,historyFresh:true,priceFresh:true,
 fourHour:{ready:true,phase:'تجميع محتمل',side:'BUY',sweep:'SELL_SIDE',
  rangeHigh:101.3,rangeLow:99.3,volumeBasis:'TICK'},m5,
 targets:[{stage:1,price:101},{stage:2,price:102}]};
let result=build(source);
assert.equal(result.ready,true);
assert.equal(result.phaseKind,'ACCUMULATION');
assert.equal(result.upper.high,101.3);
assert.equal(result.lower.low,99.3);
assert.ok(result.breakoutUp>result.breakoutDown);
assert.ok(result.timing[0].eta.min>0&&result.timing[0].eta.max>=result.timing[0].eta.min);
assert.match(result.evidence,/Tick/);
let invalid=build({...source,historyFresh:false});
assert.equal(invalid.ready,false);
assert.equal(invalid.breakoutUp,null);
assert.equal(invalid.upper,null);
assert.equal(invalid.timing[0].eta,null);
invalid=build({...source,fourHour:{...source.fourHour,ready:false}});
assert.equal(invalid.ready,false);
invalid=build({...source,priceFresh:false});
assert.equal(invalid.ready,false);
invalid=build({...source,now:now+2400000});
assert.equal(invalid.ready,false,'stale M5 must not produce annotations');
let dist=build({...source,fourHour:{...source.fourHour,phase:'تصريف محتمل',side:'SELL'},
 targets:[{stage:1,price:99.8}]});
assert.equal(dist.phaseKind,'DISTRIBUTION');
assert.equal(dist.preferred,'SELL');
assert.ok(dist.timing[0].eta);
dist=build({...source,fourHour:{...source.fourHour,phase:'توازن',side:'WAIT'}});
assert.equal(dist.phaseKind,'BALANCED');
assert.equal(dist.preferred,'WAIT');
assert.equal(dist.timing[0].eta,null);
let inferred=build({...source,fourHour:{...source.fourHour,phase:'توازن',side:'WAIT'},
 accumulation:{phase:'ACCUMULATING',accumulationScore:44,distributionScore:13}});
assert.equal(inferred.phaseKind,'ACCUMULATION','display informative M1/M5 accumulation beside a neutral H4');
inferred=build({...source,fourHour:{...source.fourHour,phase:'تجميع محتمل'},
 accumulation:{phase:'DISTRIBUTING',accumulationScore:10,distributionScore:76}});
assert.equal(inferred.phaseKind,'BALANCED','contradictory phase evidence must never claim confidence');
assert.equal(inferred.preferred,'WAIT');

const assess=m.exports.assessBreakoutWatch;
const freshM5=Array.from({length:22},(_,i)=>({
  time:now-(22-i)*300000,open:100,close:100,
  high:101,low:99
}));
const neutralContext={...source,price:100,m5:freshM5,
  fourHour:{...source.fourHour,phase:'توازن',side:'WAIT'}};
const breakout=build(neutralContext);
assert.equal(breakout.ready,true);
assert.ok(breakout.breakoutUp>101&&breakout.breakoutDown<99);
const m1=(a,b)=>[{
  time:now-120000,open:a,high:Math.max(a,b)+.15,low:Math.min(a,b)-.15,close:a
},{
  time:now-60000,open:b,high:Math.max(a,b)+.15,low:Math.min(a,b)-.15,close:b
}];
const watch=(changes={})=>assess({now,price:100,priceFresh:true,historyFresh:true,
  m1:m1(100,100),m5:freshM5,overlay:breakout,...changes});
assert.equal(watch().phase,'RANGE','genuine neutral bars remain inside range');
assert.equal(watch({price:breakout.breakoutUp+.3}).phase,'TESTING',
  'intraminute quote above resistance is not a confirmed close');
assert.equal(watch({price:breakout.breakoutUp+.5,
 m1:m1(breakout.breakoutUp+.25,breakout.breakoutUp+.35)}).phase,'M1_BREAK',
 'two closed M1 above resistance are observed but not M5 confirmed');
const closeM5=(last,prev)=>{
  const rows=freshM5.map(b=>({...b}));
  rows[rows.length-2]={...rows.at(-2),close:prev,
    high:Math.max(101,prev+.2),low:Math.min(99,prev-.2)};
  rows[rows.length-1]={...rows.at(-1),close:last,
    high:Math.max(101,last+.2),low:Math.min(99,last-.2)};
  return rows;
};
const up1=closeM5(breakout.breakoutUp+.35,100);
let pending=watch({m5:up1});
assert.equal(pending.phase,'M5_FIRST');
assert.equal(pending.closes,1);
assert.match(pending.detail,/1\/2/);
let qualifiedWatch=watch({m5:closeM5(breakout.breakoutUp+.6,breakout.breakoutUp+.4)});
assert.equal(qualifiedWatch.phase,'M5_CONFIRMED');
assert.equal(qualifiedWatch.closes,2);
assert.equal(qualifiedWatch.side,'BUY');
assert.match(qualifiedWatch.detail,/شروط الدخول/,'the watch must not claim an executable trade');
assert.equal(watch({m5:closeM5(breakout.breakoutDown-.6,breakout.breakoutDown-.4)}).side,'SELL',
 'sell continuation remains symmetric');
assert.equal(watch({m5:closeM5(100,breakout.breakoutUp+.4)}).phase,'REJECTED',
 'closed M5 returning inside the range is a failed prior breakout');
assert.equal(watch({price:100,priceFresh:false}).phase,'UNAVAILABLE',
 'stale real price may never present a fresh breakout');
assert.equal(watch({overlay:{...breakout,ready:false}}).phase,'UNAVAILABLE',
 'incomplete structural levels must never invent a breakout');
const brokenM5=freshM5.map(b=>({...b}));
brokenM5[brokenM5.length-2].time-=300000;
assert.equal(watch({m5:brokenM5}).phase,'UNAVAILABLE',
 'missing M5 cannot count as confirmation');
const chart=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
assert.match(chart,/assessBreakoutWatch\(/);
assert.match(chart,/breakoutWatch\.headline/);
assert.doesNotMatch(chart, /watchFresh\?'ترقب كسر'/,
 'the user-visible placeholder must never be the generic indefinite wait');

console.log('PASS: chart zones, engine+H4 liquidity, conflicts, M5 breakout gates, honest ETA and stale veto');
