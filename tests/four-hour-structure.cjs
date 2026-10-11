const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const module={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/four-hour-structure.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module,exports:module.exports});
const {analyzeFourHours:analyze}=module.exports;
const now=Date.parse('2026-10-11T12:00:00Z');
const m1=Array.from({length:240},(_,i)=>{
  const price=100+i*.012+Math.sin(i*.22)*.13;
  return {time:now-(240-i)*60000,open:price,high:price+.21,low:price-.22,
    close:price+.05,volume:20+i*.05,volumeBasis:'TICK'};
});
const m5=Array.from({length:55},(_,i)=>{
  const price=100+i*.05+Math.sin(i*.4)*.22;
  return {time:now-(55-i)*300000,open:price-.04,high:price+.19,
    low:price-.21,close:price+.04};
});
let x=analyze({asset:'BTC',candles:m1,frames:{m5},now,source:'Coinbase',referencePrice:m1.at(-1).close});
assert.equal(x.ready,true,'four hour lookback requires closed continuous bars');
assert.equal(x.bars,240);
assert.equal(x.volumeBasis,'TICK','tick volume cannot be called real traded volume');
assert.ok(x.vwap>100&&x.vwap<105);
assert.ok(x.rangeHigh>x.rangeLow);
assert.ok(x.changePct>0);
assert.ok(x.zones.every(z=>z.confirmedAt<=now&&z.low<=z.high));
let stale=analyze({asset:'BTC',candles:m1.slice(0,-5),frames:{m5},now});
assert.equal(stale.ready,false,'stale stream must not assert live liquidity');
let gapped=analyze({asset:'BTC',candles:m1.filter(c=>c.time!==m1[125].time&&c.time!==m1[126].time),frames:{m5},now});
assert.equal(gapped.ready,false,'missing M1 candles must veto precision');
let misleading=analyze({asset:'BTC',candles:m1,frames:{m5},now,referencePrice:150});
assert.equal(misleading.ready,false,'divergent broker/source quotes must not be fused');
let noVolume=analyze({asset:'GOLD',candles:m1.map(c=>({...c,volume:0,volumeBasis:'NONE'})),frames:{m5},now});
assert.equal(noVolume.ready,true);
assert.equal(noVolume.vwap,null,'no synthetic price-only VWAP');
assert.equal(noVolume.volumeBasis,'NONE');
let partial=analyze({asset:'BTC',candles:m1.slice(-50),frames:{m5},now});
assert.equal(partial.ready,false,'last 52 candles cannot claim four hours');
console.log('PASS: 4h closed-candle coverage, nonfake volume, structural zones, gaps, stale price and cross-feed guards');
