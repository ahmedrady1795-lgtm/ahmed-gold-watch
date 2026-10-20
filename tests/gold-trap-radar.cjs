const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
const mod={exports:{}};
const compiled=ts.transpileModule(fs.readFileSync('lib/gold-trap-radar.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText;
vm.runInNewContext(compiled,{module:mod,exports:mod.exports},{filename:'gold-trap-radar.ts'});
const {buildGoldTrapRadar:build}=mod.exports;
const now=Date.parse('2026-10-20T10:00:00Z');
const base=Array.from({length:55},(_,i)=>({
  time:now-(55-i)*60000,open:3400,high:3404,low:3396,close:3400
}));
const c5=Array.from({length:14},(_,i)=>({
  time:now-(14-i)*300000,open:3400,high:3404,low:3396,close:3400
}));
const args={c1:base,c5,price:3400,quoteAt:now-1000,quoteStatus:'live',now,candleSource:'Biquote XAUUSD'};
let r=build(args);
assert.equal(r.ok,true);
assert.equal(r.side,'WAIT');
assert.equal(r.source,'CANDLE_PROXY');
assert.equal(r.target,null);
assert.equal(r.score,0,'a flat price series cannot fabricate an early trade');
assert.ok(r.warnings.some(x=>x.includes('ليس أوامر فعلية')));

const buy=[...base];buy[54]={...buy[54],open:3398,high:3403,low:3393,close:3401};
r=build({...args,c1:buy,price:3401});
assert.equal(r.state,'SWEEP_RECLAIM');
assert.equal(r.side,'BUY');
assert.equal(r.trap,'LOWER_SWEEP');
assert.equal(r.lowerLiquidity,3396);
assert.equal(r.target,3404);
assert.ok(r.invalidation<3393);
assert.ok(r.score<90,'strength is not a claimed probability');

const sell=[...base];sell[54]={...sell[54],open:3402,high:3407,low:3396,close:3399};
r=build({...args,c1:sell,price:3399});
assert.equal(r.state,'SWEEP_RECLAIM');
assert.equal(r.side,'SELL');
assert.equal(r.upperLiquidity,3404);
assert.equal(r.target,3396);
assert.ok(r.invalidation>3407);

r=build({...args,c1:buy,price:3401,quoteAt:now-28000});
assert.equal(r.state,'OFFLINE');
assert.equal(r.side,'WAIT');

r=build({...args,c1:buy,price:3401,quoteStatus:'delayed'});
assert.equal(r.state,'OFFLINE');

r=build({...args,c1:buy,price:3420});
assert.equal(r.state,'OFFLINE','mismatched spot and candle source must fail closed');

const incomplete=[...base,{...buy[54],time:now-20000}];
r=build({...args,c1:incomplete});
assert.equal(r.side,'WAIT','an unfinished sweep cannot be confirmed');
assert.equal(r.trap,'NONE');

r=build({...args,c1:buy,price:3401,mt5Fast:{ok:true,side:'BUY',samples:8,
  receivedAt:now-900,bookImbalance:18,pressureChange:8,
  bidDepthChangePct:14,askDepthChangePct:-8,persistence:75}});
assert.equal(r.source,'MT5_BROKER_DOM');
assert.ok(r.evidence.some(x=>x.includes('DOM')));

r=build({...args,c1:buy,price:3401,mt5Fast:{ok:true,side:'BUY',samples:8,
  receivedAt:now-20000,bookImbalance:18,pressureChange:8}});
assert.equal(r.source,'CANDLE_PROXY','stale DOM may not inflate credibility');
console.log('PASS: gold trap radar sweeps, target/invalidation, live-source gates, unfinished candles, broker DOM');
