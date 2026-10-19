const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(
 fs.readFileSync('lib/chart-price-viewport.ts','utf8'),
 {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}
).outputText,{module:mod,exports:mod.exports,require});
const viewport=mod.exports.chartPriceViewport;
const history=Array.from({length:24},(_,i)=>{
 const center=81475+Math.sin(i*.66)*14+(i-12)*.28;
 return {low:center-2.4,high:center+3.1};
});
const future=Array.from({length:18},(_,i)=>{
 const center=81470+Math.sin(i*.81)*8;
 return {low:center-1.8,high:center+3.2};
});
const close=history.at(-1).high;
const targetPrices=[80951.2,80705.4,80405.4];
const local=viewport({real:history,illustrative:future,focus:true,reference:close,atr:3});
const broad=viewport({real:history,illustrative:future,focus:false,reference:close,atr:3});
assert.ok(local.high>Math.max(...[...history,...future].map(x=>x.high)));
assert.ok(local.low<Math.min(...[...history,...future].map(x=>x.low)));
assert.ok(local.span<100,'M1 OHLC retains visible height near BTC 81,475');
assert.ok(broad.span<130,'wide-view toggle cannot compress candles against remote H4 goals');
assert.ok(broad.span>local.span);
assert.ok(targetPrices.every(x=>x<local.low&&x<broad.low),
 'distant objectives are offscreen exact-price labels, never viewport inputs');
const page=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
assert.match(page,/proposedViewport=chartPriceViewport\(/);
assert.match(page,/protectRealRange:true/,'actual M1 candle geometry stays legible around remote hypothetical legs');
assert.match(page,/real:\[\.\.\.candles,/,'genuine closed and observed LIVE candle are used for scale');
assert.match(page,/const scaleLow=candleViewport.low/);
assert.match(page,/outsideLevels\.map\(/);
assert.doesNotMatch(page,/const scaleLow=focusCandles\?/,
 'changing zoom cannot include all distant price bands');
assert.match(page,/futureWidth=candleWidth/,'historical and future candle widths match');
const upper=viewport({real:[{low:90,high:100}],illustrative:[{low:95,high:110}],atr:1,reference:99});
assert.ok(upper.low<90&&upper.high>110,'actual and proposed OHLC use identical unclipped Y axis');
const flat=viewport({real:[{low:100,high:100}],illustrative:[],atr:0,reference:100});
assert.ok(flat.high>flat.low&&flat.span<1,'doji-only market stays finite and readable');
console.log('PASS: exact common M1 price axis, wide and zoomed ranges reject distant TP compression');
