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
const refBody=Math.max(...ref.map(b=>Math.abs(b.close-b.open)));
const refRange=Math.max(...ref.map(b=>b.high-b.low));
assert.ok(z.bars.every((b,i)=>b.low>0&&b.high>=Math.max(b.open,b.close)&&
 b.low<=Math.min(b.open,b.close)&&Math.abs(b.close-b.open)<=refBody+1e-8&&
 b.high-b.low<=refRange+1e-8&&(i===0?b.open===quote:b.open===z.bars[i-1].close)),
 'all synthetic bodies and wicks are bounded by actual closed OHLC geometry');
assert.ok(z.bars.some(b=>b.close<b.open),'pullback bars prevent an implausible straight ascent');
assert.ok(new Set(z.bars.map(b=>(b.close-b.open).toFixed(4))).size>7,'varied real-market-like bodies');
assert.ok(z.bars.at(-1).close<quote+500,'far target remains actually far away');
const mobile=build({...common,visibleCount:24,targets:[{stage:1,price:quote+1.1}]});
assert.equal(mobile.ready,true,mobile.reason);
const shown=history.slice(-24);
const mobileBodyMax=Math.max(...shown.map(b=>Math.abs(b.close-b.open)));
const mobileRangeMax=Math.max(...shown.map(b=>b.high-b.low));
assert.ok(mobile.bars.every(b=>Math.abs(b.close-b.open)<=mobileBodyMax+1e-8&&
 b.high-b.low<=mobileRangeMax+1e-8),
 'mobile scenario cannot exceed geometry of 24 actually visible real candles');
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
assert.match(chart,/frozenVisualLevels=useMemo\(/,'target ladder is locked to a closed M1 scenario revision');
assert.match(chart,/quote:routeAnchor/,'scenario starts from a closed M1 quote-independent anchor');
assert.match(chart,/frozenRouteWaypoints=useMemo\(/,'structural milestones are stable between ticks');
assert.doesNotMatch(chart,/history:m\.candles,now,quote:m\.price/,
 'intrabar quote must not reshape historical-analogue scenario bars');
assert.match(chart,/futureWidth=candleWidth/,'scenario and historical candles have exactly the same rendered width');
assert.match(chart,/visibleCount:candles\.length/,
 'dynamic candle sizing uses the actual 24/36 displayed real candle reference');
assert.match(chart,/targetRoute!\.touches\.map/,'show TP stage near the real price actually reached by route');
assert.match(chart,/routeVisible\?targetRoute!\.bars/,'target route takes precedence over neutral unrelated sketches');
assert.match(chart,/routeVisible\?'S'/,'route is marked as stages, not 18 invented minutes');
assert.match(chart,/!routeVisible&&btcScenario!\.destinationMid/,'do not overlap giant legacy direction arrow and conditional OHLC');
assert.match(chart,/المراحل ليست دقائق/);
console.log('PASS: target-following up/down realistic OHLC bounded by real body/range, TP stages and far-target honesty');

// No TP, milestone or stop may drag the actual-scale OHLC sequence toward it.
const alternativeTargets=build({...common,
 targets:[{stage:1,price:quote+7},{stage:2,price:quote+20}],
 invalidation:quote-25});
assert.equal(JSON.stringify(alternativeTargets.bars),JSON.stringify(z.bars),
 'changing target prices must NOT rewrite a single candle body or wick');
for(const hit of z.touches){
 const bar=z.bars[hit.index];
 assert.ok(bar.low<=hit.price+1e-8&&bar.high>=hit.price-1e-8,
   'a TP must be marked only when a replayed OHLC wick actually touches it');
}
assert.ok(z.bars.some((b,i)=>i>z.touches[1].index&&Math.abs(b.close-b.open)>.01),
 'candles must continue naturally after TP2, not flatten out at the destination');
// An unreachable target remains a real horizontal level, not a forced landing.
const unrealistic=build({...common,targets:[{stage:1,price:quote+900}],
 invalidation:quote-25});
assert.equal(unrealistic.ready,true,unrealistic.reason);
assert.equal(unrealistic.touches.length,0);
assert.deepEqual(Array.from(unrealistic.pendingStages),[1]);
assert.equal(JSON.stringify(unrealistic.bars),JSON.stringify(z.bars));

const routePoints=[{key:'BREAK',label:'break',price:quote+.8},
 {key:'HOLD',label:'hold',price:quote+1.5},
 {key:'RETEST',label:'retest',price:quote+.6}];
const detailed=build({...common,count:96,waypoints:routePoints,
 targets:[{stage:1,price:quote+3},{stage:2,price:quote+8},{stage:3,price:quote+12}],invalidation:quote-5});
assert.equal(detailed.ready,true,detailed.reason);
assert.equal(detailed.bars.length,96);
assert.ok(detailed.bars.every(b=>Math.abs(b.close-b.open)<=refBody+1e-8&&
 b.high-b.low<=refRange+1e-8),'even an extended route retains real visible M1 geometry');
for(const hit of detailed.touches){
 const bar=detailed.bars[hit.index];
 assert.ok(bar.low<=hit.price+1e-8&&bar.high>=hit.price-1e-8,
   'extended TP touches must be genuinely inside each replayed wick');
}
for(const milestone of detailed.milestones){
 const bar=detailed.bars[milestone.index];
 assert.ok(bar.low<=milestone.price+1e-8&&bar.high>=milestone.price-1e-8,
   'a break/retest is NEVER manufactured by moving candle close to the level');
}
const shortRoute=build({...common,waypoints:routePoints,
 targets:[{stage:1,price:quote+3},{stage:2,price:quote+8},{stage:3,price:quote+12}],invalidation:quote-5});
assert.equal(JSON.stringify(shortRoute.bars),JSON.stringify(detailed.bars.slice(0,18)),
 'expanding to 96 stages must preserve the original first 18 real-history analogue bars');
for(const price of [NaN,quote-6,quote+20])
 assert.equal(build({...common,waypoints:[{key:'BAD',label:'bad',price}],
   targets:[{stage:1,price:quote+12}],invalidation:quote-5}).ready,false);
const downward=build({...common,count:96,history:reflected,quote:3000-quote,side:'SELL',
 waypoints:routePoints.map(w=>({...w,price:3000-w.price})),
 targets:[{stage:1,price:3000-quote-12}],invalidation:3000-quote+5});
assert.equal(downward.ready,true,downward.reason);
assert.equal(downward.bars.length,detailed.bars.length);
assert.ok(downward.bars.some(b=>b.close>b.open),'bearish history includes authentic upward pullbacks');
console.log('PASS: causal OHLC analogue, untouched server TP levels, genuine touches, 96-stage zoom, BUY/SELL symmetry');
