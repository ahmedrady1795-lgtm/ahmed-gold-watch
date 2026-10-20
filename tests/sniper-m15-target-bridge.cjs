const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const moduleRef={exports:{}};
const src=fs.readFileSync('lib/sniper-m15-target-bridge.ts','utf8');
vm.runInNewContext(ts.transpileModule(src,{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS
}}).outputText,{module:moduleRef,exports:moduleRef.exports});
const extend=moduleRef.exports.extendIllustrativeM15ToTargets;
const analog=Array.from({length:12},(_,i)=>{
 const open=100+i*.24,close=open+.24;
 return {open,high:close+.35,low:open-.35,close};
});
const frozen=JSON.stringify(analog);
const goals=[{stage:1,price:107},{stage:2,price:113},{stage:3,price:119}];
let result=extend({model:analog,goals,side:'BUY',atr:2,stop:94});
assert.equal(result.complete,true);
assert.equal(JSON.stringify(analog),frozen,'never mutate frozen model candles');
assert.equal(JSON.stringify(result.bars.slice(0,12)),frozen,
 "first 12 frozen M15 forward candles must stay identical");
assert.ok(result.added>0&&result.added<72);
assert.equal(result.connectedStages.join(','),'1,2,3');
for(const goal of goals){
 assert.ok(result.bars.some(b=>b.low<=goal.price&&b.high>=goal.price));
}
for(let i=0;i<result.bars.length;i++){
 const b=result.bars[i];
 assert.ok(b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close)&&b.low>94);
 if(i>0)assert.ok(Math.abs(b.open-result.bars[i-1].close)<1e-7);
}
const mirrored=analog.map(b=>({
 open:200-(b.open-100),high:200-(b.low-100),
 low:200-(b.high-100),close:200-(b.close-100)
}));
result=extend({model:mirrored,goals:[{stage:1,price:194},{stage:2,price:187}],
 side:'SELL',atr:2,stop:210});
assert.equal(result.complete,true);
assert.ok(result.bars.every(b=>b.high<210));
assert.ok(result.bars.some(b=>b.low<=187&&b.high>=187));
result=extend({model:analog,goals:[{stage:1,price:1000}],side:'BUY',
 atr:1,stop:94,maxCandles:32});
assert.equal(result.complete,false,'do not fabricate a huge candle to reach distant levels');
assert.equal(result.added,0);
assert.equal(result.bars.length,12);
console.log('PASS: visually complete buy/sell conditional bodies reach fixed targets; frozen scored candles stay unchanged');
