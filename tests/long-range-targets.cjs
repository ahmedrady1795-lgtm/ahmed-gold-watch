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
console.log('PASS: long targets use authentic M15/H1 swings, filter microlevels and stale inputs');
