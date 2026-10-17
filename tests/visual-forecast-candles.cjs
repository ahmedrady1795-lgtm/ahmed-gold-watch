const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/visual-forecast-candles.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:mod,exports:mod.exports,require},{filename:'lib/visual-forecast-candles.ts'});
const {buildVisualFuture:build,selectCandleAnalogue:select,rankCandleAnalogues:rank,auditCandleAnalogueDirection:audit}=mod.exports;
const start=Date.parse('2026-10-16T03:00:00Z');
let price=100;
const candles=Array.from({length:220},(_,i)=>{
 // Synthetic historical data for tests only: not a fitted or future market path.
 const open=price,body=.37*Math.sin(i*.87)+.28*Math.cos(i*.31)+(i%13===0?.8:0);
 const close=Math.max(40,open+body);
 const high=Math.max(open,close)+.14+.45*Math.abs(Math.sin(i*.49));
 const low=Math.min(open,close)-.12-.55*Math.abs(Math.cos(i*.61));
 price=close;
 return {time:start+i*60000,open,high,low,close};
});
const last=candles.at(-1),atr=1;
const base={candles,forecast:{mode:'RANGE',atr,side:'WAIT',candles:[]},side:'WAIT'};
const model=build(base),again=build(base);
assert.equal(model.length,18,'18 integrated forecast candles shown by default');
assert.equal(JSON.stringify(model),JSON.stringify(again),'same input must produce same forecast artwork');
assert.equal(model[0].time,last.time+60000);
assert.ok(model.every((c,i)=>[c.open,c.high,c.low,c.close].every(Number.isFinite)&&
 c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)&&
 c.low>0&&(i===0?c.open===last.close:c.open===model[i-1].close)));
assert.ok(model.some(c=>c.close>c.open)&&model.some(c=>c.close<c.open),
 'real-history analogues have both red and green candles');
assert.ok(new Set(model.map(c=>(c.close-c.open).toFixed(4))).size>=7,
 'not a staircase of repeated equal-size fake bars');
assert.ok(new Set(model.map(c=>(c.high-Math.max(c.close,c.open)).toFixed(4))).size>=6,
 'upper wicks inherit different real historical shapes');
assert.ok(new Set(model.map(c=>(Math.min(c.open,c.close)-c.low).toFixed(4))).size>=6,
 'lower wicks inherit different real historical shapes');
assert.ok(model.every(c=>Math.abs(c.close-last.close)<=atr*7+.00001),
 'no fabricated thousand-dollar target ladders');
assert.ok(model.every(c=>c.scenarioShape===false),'candles are not forced H4 target path');
assert.ok(model.some(c=>c.analogue),'actual historical analogue candidate was selected');
assert.equal(select(candles,18,atr)>=0,true);
const top=rank(candles,18,atr,5);
assert.equal(top.length,5,'compare five independent historical OHLC sequences');
assert.ok(top.every((x,i)=>i===0||top[i-1].distance<=x.distance));
assert.ok(top.every(x=>x.start+18<=candles.length-8),
 'candidate outcomes have an eight-bar embargo before current context');
assert.ok(top.some(x=>x.start===select(candles,18,atr)),
 'choose a robust central neighbour from the five best patterns');
const report=audit(candles,atr);
assert.ok(report.samples>=5,'chronological forward-test has historical folds');
assert.ok(report.samples<=Math.ceil((candles.length-65)/4),
 'evaluation folds are disjoint');
assert.ok(report.hits>=0&&report.hits<=report.samples);
assert.ok(report.baselineHits>=0&&report.baselineHits<=report.samples);
assert.equal(report.edgeSupported,false,'single session never establishes profitable forecast edge');
assert.equal(audit(candles.slice(0,100),atr).edgeSupported,false,
 'no promotion on minimal test data');
const historicalGap=[...candles];historicalGap[32]={...historicalGap[32],time:historicalGap[32].time+60000};
assert.ok(rank(historicalGap,18,atr).every(x=>x.start>38||x.start+18<32),
 'gapped history may not be used as an analogue');
const distant=build({...base,scenarioPath:[{price:last.close},{price:10,key:'TP1'},{price:1,key:'TP3'}],side:'SELL'});
assert.equal(JSON.stringify(distant),JSON.stringify(model),'far targets never rewrite M1 candle shape');
assert.equal(build({...base,forecast:{...base.forecast,mode:'OFF'}}).length,0,'stale data must hide simulation');
const gap=[...candles];gap[205]={...gap[205],time:gap[205].time+60000};
assert.equal(build({...base,candles:gap}).length,0,'closed source M1 gaps disable simulation');
const short=build({...base,count:12});
assert.equal(short.length,12,'custom horizon supported');
const first=Array.from({length:3},(_,i)=>({time:last.time+(i+1)*60000,
 open:last.close+i*.2,close:last.close+(i+1)*.2,
 high:last.close+(i+1)*.2+.13,low:last.close+i*.2-.12}));
const certified=build({...base,forecast:{mode:'CANDLES',atr,side:'BUY',candles:first}});
assert.equal(certified.length,18);
assert.ok(certified.slice(0,3).every((c,i)=>c.validatedShape&&c.close===first[i].close));
assert.ok(certified.slice(3).every(c=>!c.validatedShape));
assert.ok(certified.slice(3).some(c=>c.close<c.open));
const ui=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
assert.match(ui,/visualCandles\.map\(\(c,i\)=>/);
assert.match(ui,/futureWidth/,'forecast must use proportional real-style candle bodies');
assert.match(ui,/أنماط تاريخية/,'honest label for illustrative replay');
assert.match(ui,/غير مؤهلة لتحديد اتجاه تداول/,'walk-forward results cannot imply proven trade edge');
assert.doesNotMatch(ui,/scenarioPath:planVisible/,'never attach far target price path');
console.log('PASS: 18 varied empirical OHLC candles, historical analogue geometry, gap and safety gates');
