const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const ctx={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/long-range-targets.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,ctx);
const {buildLongRangeTargets:build}=ctx.exports;
const {frames}=require('./long-range-fixture.cjs');
const now=Date.parse('2026-10-11T10:00:00Z');
const arg={asset:'GOLD',side:'BUY',price:100,now,frames:frames(now),
  forecast:{targets:{t1:{price:100.05,kind:'PROJECTION'},
    t2:{price:100.20,kind:'PROJECTION'}}}};
const r=build(arg);
assert.ok(r.atr15>0,'ATR measured from genuine candles');
assert.ok(r.targets.length>=1&&r.targets.length<=3,'use only structural candidates');
assert.ok(r.targets[0].price-arg.price>=r.minDistance,'reject microtargets');
assert.ok(r.targets.every(t=>t.kind==='STRUCTURAL'&&t.price>arg.price));
assert.ok(r.targets.every(t=>t.source!=='ATR projection'));
assert.ok(r.targets.every((t,i)=>i===0||t.price>r.targets[i-1].price));
assert.equal(build({...arg,frames:{...arg.frames,m15:[]}}).targets.length,0,'no M15 history, no target');
assert.equal(build({...arg,frames:{...arg.frames,h1:[]}}).targets.length,0,'no H1 history, no target');
assert.equal(build({...arg,side:'WAIT'}).targets.length,0,'no directional consensus');
assert.equal(build({...arg,frames:{...arg.frames,m15:arg.frames.m15.map(c=>({...c,time:c.time-3600000}))}}).targets.length,0,'stale high timeframe must not be traded');
// Soft forecast zones or M5-only wicks cannot invent H1/M15 sniper objectives.
const flat=Object.fromEntries(Object.entries(arg.frames).map(([name,rows])=>[name,
  rows.map(c=>({...c,open:100,close:100,low:99.9,high:100.1}))]));
const unsupported={...arg,frames:flat,
  h4:{resistance:{low:100.8,high:101}},
  hunt:{zoneForecast:{pathForecast:{destination:{low:100.9,high:101.1},
    upperLiquidity:{low:100.8,high:101}}}},
  forecast:{targets:{t2:{price:100.85,kind:'STRUCTURAL'},
    t3:{price:101.1,kind:'LIQUIDITY'}}}};
assert.equal(build(unsupported).targets.length,0,
  'forecast/h4 zone without observed structural highs must not create sniper targets');
assert.equal(build({...unsupported,frames:{...flat,m5:arg.frames.m5}}).targets.length,0,
  'M5-only moves may corroborate H1/M15 but are not distant structural targets');
assert.ok(build(arg).targets.length>0,'trusted historical candles still yield targets');
console.log('PASS: long targets use authentic M15/H1 swings, filter microlevels and stale inputs');
