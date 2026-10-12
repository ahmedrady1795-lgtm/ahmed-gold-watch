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
console.log('PASS: chart zones, M5 breakout gates, neutral phases, honest volatility ETA and stale feed veto');
