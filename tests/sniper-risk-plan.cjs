const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const e={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/sniper-risk-plan.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{exports:e});
const now=Date.parse('2026-10-21T08:00:00Z');
const rows=(period,range)=>Array.from({length:60},(_,i)=>({time:now-(60-i)*period,
 open:100,close:100,low:100-range,high:100+range}));
const frames={m5:rows(300000,.6),m15:rows(900000,.7)};
frames.m5.slice(-3).forEach(b=>{b.low=98.9;});
const input={asset:'BTC',side:'BUY',price:100,now,frames,originalStop:99.99,target:102};
const build=e.buildSniperRiskPlan;
let p=build(input);
assert.equal(p.ready,true);assert.equal(p.repaired,true);
assert.ok(p.stop<99.4,'micro stop moves beyond an observed closed pullback, including buffer');
assert.ok(p.risk>=p.minRisk,'stop absorbs higher-frame noise');
assert.ok(p.rr>=1.35&&p.rr<4,'structural TP does not borrow an artificial 200R stop');
assert.equal(build({...input,originalStop:98.6}).stop,98.6,'a legitimate wider structural stop is never tightened for a better score');
const noReward=build({...input,target:100.2});
assert.equal(noReward.ready,false,'do not bring a real structural target closer or shrink the stop to force entry');
const gapped=frames.m5.filter((_,i)=>i!==52);
assert.equal(build({...input,frames:{...frames,m5:gapped}}).ready,false,'gapped volatility cannot certify risk');
const future={time:now+300000,open:100,close:500,low:1,high:999};
assert.equal(JSON.stringify(build({...input,frames:{...frames,m5:[...frames.m5,future]}})),JSON.stringify(p),
 'unseen future candles cannot change the issued risk plan');
const mirror=b=>({...b,open:200-b.open,close:200-b.close,low:200-b.high,high:200-b.low});
const mirrored={m5:frames.m5.map(mirror),m15:frames.m15.map(mirror)};
const sell=build({...input,side:'SELL',target:98,originalStop:100.01,frames:mirrored});
assert.equal(sell.ready,true);assert.ok(sell.stop>100.6&&sell.risk>=sell.minRisk);
console.log('PASS: coherent structural target/stop, volatility floor, anchored repairs, symmetric directions and no future leakage');
