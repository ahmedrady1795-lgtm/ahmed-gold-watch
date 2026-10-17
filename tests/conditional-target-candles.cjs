const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/conditional-target-candles.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:mod,exports:mod.exports});
const build=mod.exports.buildConditionalTargetCandles;
const start=Date.parse('2026-10-17T07:00:00Z');
let p=1000;
const history=Array.from({length:120},(_,i)=>{
 const open=p,body=(i%6===3?-.26:.43)+(i%4)*.065;
 const close=open+body,high=Math.max(open,close)+.14+(i%3)*.09,
 low=Math.min(open,close)-.12-(i%4)*.065;
 p=close;
 return {time:start+i*60000,open,high,low,close};
});
const now=history.at(-1).time+90000,quote=history.at(-1).close+.16;
const common={history,now,quote,priceFresh:true,side:'BUY',count:18};
let z=build({...common,targets:[{stage:1,price:quote+1.1},{stage:2,price:quote+2.5},
 {stage:3,price:quote+500}],invalidation:quote-25});
assert.equal(z.ready,true,z.reason);
assert.equal(z.bars.length,18);
assert.equal(z.touches[0]?.stage,1,'closest real TP gets a labelled candle touch');
assert.equal(z.touches[1]?.stage,2,'second TP should be reached by gradual realistic candles');
assert.deepEqual(Array.from(z.pendingStages),[3],'distant TP3 must not be reached by stretching candles');
const ref=history.slice(-36);
const refBody=ref.map(b=>Math.abs(b.close-b.open)).sort((a,b)=>a-b)[Math.floor((36-1)*.75)];
const refRange=Math.max(...ref.map(b=>b.high-b.low));
assert.ok(z.bars.every((b,i)=>b.low>0&&b.high>=Math.max(b.open,b.close)&&
 b.low<=Math.min(b.open,b.close)&&Math.abs(b.close-b.open)<=refBody+1e-8&&
 b.high-b.low<=refRange+1e-8&&(i===0?b.open===quote:b.open===z.bars[i-1].close)),
 'all synthetic bodies and wicks are bounded by actual closed OHLC geometry');
assert.ok(z.bars.some(b=>b.close<b.open),'pullback bars prevent an implausible straight ascent');
assert.ok(new Set(z.bars.map(b=>(b.close-b.open).toFixed(4))).size>7,'varied real-market-like bodies');
assert.ok(z.bars.at(-1).close<quote+500,'far target remains actually far away');
assert.equal(JSON.stringify(build({...common,targets:[{stage:1,price:quote+1.1},
 {stage:2,price:quote+2.5},{stage:3,price:quote+500}],invalidation:quote-25})),
 JSON.stringify(z),'same real candles and targets produce stable output');
const reflected=history.map(b=>({time:b.time,open:3000-b.open,
 close:3000-b.close,high:3000-b.low,low:3000-b.high}));
const sells=build({...common,history:reflected,quote:3000-quote,side:'SELL',
 targets:[{stage:1,price:3000-quote-1.1},{stage:2,price:3000-quote-2.5}],
 invalidation:3000-quote+25});
assert.equal(sells.ready,true,sells.reason);
assert.equal(sells.touches[0]?.stage,1,'conditional SELL moves toward real sellside targets');
assert.ok(sells.bars.some(b=>b.close>b.open),'SELL can have small upward retest candles');
for(const patch of [{priceFresh:false},{quote:null},{now:now+180000},
 {history:history.slice(0,-5)},{targets:[{stage:1,price:quote-1}]},
 {invalidation:quote+5}]){
 const result=build({...common,targets:[{stage:1,price:quote+1}],...patch});
 assert.equal(result.ready,false,'stale, partial, invalidated or wrong-side targets cannot be rendered');
 assert.equal(result.bars.length,0);
}
const gap=history.map(c=>({...c}));
gap[gap.length-8].time+=5000;
assert.equal(build({...common,history:gap,targets:[{stage:1,price:quote+1}]}).ready,false);
const chart=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
assert.match(chart,/buildConditionalTargetCandles\(/,'route is integrated into SVG');
assert.match(chart,/futureWidth=Math\.min\(candleWidth/,'scenario body cannot be wider than real candles');
assert.match(chart,/targetRoute!\.touches\.map/,'show TP stage near the real price actually reached by route');
assert.match(chart,/routeVisible\?targetRoute!\.bars/,'target route takes precedence over neutral unrelated sketches');
assert.match(chart,/routeVisible\?'S'/,'route is marked as stages, not 18 invented minutes');
assert.match(chart,/!routeVisible&&btcScenario!\.destinationMid/,'do not overlap giant legacy direction arrow and conditional OHLC');
assert.match(chart,/المراحل ليست دقائق/);
console.log('PASS: target-following up/down realistic OHLC bounded by real body/range, TP stages and far-target honesty');
