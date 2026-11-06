const assert=require('node:assert/strict'),fs=require('node:fs'),
  ts=require('typescript'),vm=require('node:vm');
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync('lib/scalp-m1-forward-quality.ts','utf8'),
  {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}
).outputText,{module:m,exports:m.exports});
const {assessM1ForwardQuality:assess}=m.exports;
const issue=Date.parse('2026-11-06T17:00:00Z');
const signal={issuedAt:issue,pattern:'MOMENTUM',weak:false};
const make=(hits,n=48,source='MT5',offset=0)=>Array.from({length:n},(_,i)=>{
 const issuedAt=issue-(n-i+offset)*60000;
 return {issuedAt,side:'BUY',originalSide:'BUY',
  pattern:'MOMENTUM',weak:false,chartSource:source,
  directionObserved:i<hits?'BUY':'SELL',
  directionEvaluatedAt:issuedAt+60050};
});
const bad=assess(signal,make(6), 'MT5');
assert.equal(bad.status,'NO_EDGE','low historical accuracy cannot certify a signal');
assert.equal(bad.sample,48);assert.equal(bad.hits,6);
assert.equal(bad.tradeApproved,false);
assert.equal(bad.pastOnly,true);
const good=assess(signal,make(45), 'MT5');
assert.equal(good.status,'PROMISING','historic evidence can be labeled promising, never executable');
assert.ok(good.lower95Pct>50);
assert.equal(good.tradeApproved,false);
const mixed=assess(signal,make(25),'MT5');
assert.equal(mixed.status,'UNPROVEN');
const sparse=assess(signal,make(8,12),'MT5');
assert.equal(sparse.status,'COLLECTING');
const contaminated=[
 ...make(6),...make(48,48,'UNRELATED',80),
 {...make(6)[0],issuedAt:issue+60000,directionEvaluatedAt:issue+120000},
 {...make(6)[0],directionEvaluatedAt:issue+1},
 {...make(6)[1],directionObserved:'BUY'}
];
const clean=assess(signal,contaminated,'MT5');
assert.equal(clean.sample,48);
assert.equal(clean.hits,6,'cross-source/future/unfinished/duplicates never boost a result');
const unknown=make(6).map((row,i)=>i<15?{...row,directionObserved:'UNKNOWN'}:row);
const unsure=assess(signal,unknown,'MT5');
assert.equal(unsure.sample,33);
assert.equal(unsure.unknown,15);
assert.equal(unsure.status,'COLLECTING','unknown observations do not count as misses or wins');
const after=assess({...signal,issuedAt:issue+120000},
 [...make(6),{...make(6)[0],issuedAt:issue+60000,
  directionEvaluatedAt:issue+130000,directionObserved:'BUY'}],'MT5');
assert.equal(after.hits,6,'a result graded after signal issuance is unavailable');
const source=fs.readFileSync('lib/scalp-every-candle.ts','utf8');
assert.match(source,/const forwardQuality=assessM1ForwardQuality\(signal,history,chartSource\)/);
assert.match(source,/weak:signal\.weak,state:'AWAIT_QUOTE'/,
 'stored research grouping must not be changed by a later reliability flag');
assert.match(source,/t\.forwardQuality\?\.status==='NO_EDGE'/);
assert.match(source,/latestForwardQuality:/);
const view=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
assert.match(view,/M15 · SIM \/ WATCH|showWatchGuide/);
console.log('PASS: past-only M1 forward quality, source/time isolation, unbiased raw cohorts, independent quote gate, legacy scenario retained');
