const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const e={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/sniper-scorecard.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{exports:e});
const {startScenario:start,advanceScenario:advance,scorecard:stats}=e;
const at=Date.parse('2026-10-11T10:00:00Z');
const base={asset:'BTC',side:'BUY',at,modelAt:at,price:100,stop:99,
  confidence:77,targets:[{stage:1,price:102,low:101.8,high:102.2,quality:80,kind:'STRUCTURAL'},
    {stage:2,price:104,low:103.9,high:104.1,quality:74,kind:'STRUCTURAL'}]};
const candle=(minutes,lo,hi)=>({time:at+minutes*60000,open:100,high:hi,low:lo,close:101});
assert.equal(start({...base,targets:[{...base.targets[0],price:100.5}]}),null,
  'reject target whose reward is less than 1.35x stop distance');
let r=start(base);
assert.equal(r.status,'ACTIVE');
r=advance(r,[candle(1,99.5,102.1)],at+2*60000);
assert.equal(r.targets[0].reachedAt,at+2*60000);
assert.equal(r.targets[1].reachedAt,null);
assert.equal(r.status,'ACTIVE');
r=advance(r,[candle(1,99.5,102.1),candle(2,100,104.2)],at+3*60000);
assert.equal(r.status,'COMPLETED');
assert.equal(r.targets[1].reachedAt,at+3*60000);
const again=advance(r,[candle(3,95,110)],at+4*60000);
assert.equal(again.status,'COMPLETED','settled score cannot reverse later');
let amb=start(base);
amb=advance(amb,[candle(1,98.7,104.5)],at+2*60000);
assert.equal(amb.status,'AMBIGUOUS');
assert.equal(amb.targets.every(t=>t.reachedAt===null),true);
let stop=start(base);
stop=advance(stop,[candle(1,98.9,101)],at+2*60000);
assert.equal(stop.status,'STOPPED');
let gap=start(base);
gap=advance(gap,[candle(1,100,101)],at+2*60000);
gap=advance(gap,[candle(3,100,102.2)],at+4*60000);
assert.equal(gap.status,'UNOBSERVED');
let expiry=start({...base,durationMs:30*60000});
expiry=advance(expiry,[],at+31*60000);
assert.equal(expiry.status,'UNOBSERVED','gaps cannot be scored as a trading failure');
const v=stats([r,amb,stop,gap,expiry],'BTC');
assert.equal(v.observed,2,'ambiguous and unobserved excluded from denominator');
assert.equal(v.targets[0].hits,1);
assert.equal(v.targets[0].observedPct,50);
assert.equal(v.ambiguous,1);
assert.equal(v.unobserved,2);
assert.equal(v.status,'COLLECTING','do not call very small sample calibrated');
console.log('PASS: record only observed closed-bar outcomes; conservative ambiguity, stops, gaps and small-sample guard');
assert.equal(v.targets[0].avgMinutes,2);
assert.equal(v.targets[0].medianMinutes,2);
assert.equal(v.targets[1].avgMinutes,3);
assert.equal(v.targets[1].medianMinutes,3);
assert.equal(v.medianResolutionMinutes,2.5,'resolution time includes both completed and invalidated outcomes');
const pendingPartial=advance(start(base),[candle(1,99.5,102.1)],at+2*60000);
assert.equal(stats([pendingPartial],'BTC').targets[0].samples,0,'pending winners do not inflate completed-cohort reach rates');

const exchange=start({...base,marketSource:'Coinbase BTC-USD'});
assert.equal(exchange.marketSource,'Coinbase BTC-USD');
const changed=advance(exchange,[candle(1,100,104.5)],at+2*60000,'Kraken XBT/USD');
assert.equal(changed.status,'UNOBSERVED','exchanges cannot be merged into one TP result');
assert.equal(changed.targets[0].reachedAt,null);
assert.equal(stats([changed],'BTC').observed,0,'source-change result excluded from TP reach denominator');
const sameExchange=advance(exchange,[candle(1,99.5,102.1)],at+2*60000,'Coinbase BTC-USD');
assert.equal(sameExchange.targets[0].reachedAt,at+2*60000);
assert.ok(v.targets[0].lower95Pct>=0&&v.targets[0].upper95Pct<=100,
 '95% confidence interval bounded even with only two outcomes');
const intrabar=start({...base,at:at+30000,modelAt:at+30000});
const oldCandle=advance(intrabar,[candle(0,99,105)],at+60000);
assert.equal(oldCandle.status,'ACTIVE','no backdated pre-entry candle can hit SL or TP');
console.log('PASS: source-bound TP scorecards, observed samples/uncertainty and no pre-signal OHLC leakage');
