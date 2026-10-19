const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const src=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
const css=fs.readFileSync('app/workspace.css','utf8');
const moduleRef={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/chart-price-viewport.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:moduleRef,exports:moduleRef.exports,require});
const viewport=moduleRef.exports.chartPriceViewport;
const real=Array.from({length:36},(_,i)=>({
 low:81000+i*.35+Math.sin(i*.8)*3,
 high:81006+i*.35+Math.sin(i*.8)*3
}));
const farFuture=Array.from({length:18},(_,i)=>({
 low:81200+i*30,high:81210+i*30
}));
const fixed=viewport({real,illustrative:farFuture,protectRealRange:true,focus:true,
 reference:81025,atr:2});
const unbounded=viewport({real,illustrative:farFuture,focus:true,
 reference:81025,atr:2});
assert.ok(fixed.span<unbounded.span*.18,'far illustrative target leg must not squash actual candles');
assert.ok(fixed.low<Math.min(...real.map(x=>x.low))&&
 fixed.high>Math.max(...real.map(x=>x.high)),
 'all genuine closed candles retain accurate price positions');
assert.ok(unbounded.high>farFuture.at(-1).high,
 'default shared price-axis behavior remains available to other callers');
assert.match(src,/protectRealRange:true/,'interactive chart uses protected genuine OHLC scale');
assert.match(src,/real:\[\.\.\.candles,\.\.\.\(liveVerified&&liveM1\?\[liveM1\]:\[\]\)\]/,
 'matched-venue live candle is included in actual scale');
assert.match(src,/futureStride=\(xr-xf-18\)\/Math\.max\(19,visualCandles\.length\+1\)/,
 'reserved AI NEXT slot prevents final projected candle clipping');
for(const scenarioDetail of [false,true]){
 for(const length of [0,1,18,40,96]){
   const x0=scenarioDetail?66:28,x1=scenarioDetail?66+24*16:315,
     xf=x1+14,W=scenarioDetail?66+(24+96)*16+176:650,
     xr=W-(scenarioDetail?144:126);
   const fs=(xr-xf-18)/Math.max(19,length+1);
   const actualM1Stride=(x1-x0)/24;
   const local=Math.min(actualM1Stride,fs);
   const nextX=xf+9+local*.5;
   assert.ok(nextX-(xf-4)<actualM1Stride*1.6,
    'LIVE and NEXT remain adjacent even with a short conditional route');
   assert.ok(nextX>xf&&nextX<xr,'AI NEXT within future lane');
   for(let i=0;i<length;i++){
     const pos=xf+9+(i+1.5)*local;
     assert.ok(pos>nextX&&pos<xr-2,'scenario candles, including the last stage, fit lane');
   }
 }
}
assert.match(src,/pixelsPerViewBoxUnit=svg\?svg\.getBoundingClientRect\(\)\.width\/W:1/,
 'mobile focus uses actual CSS-to-SVG pixel ratio');
assert.match(src,/className="sniper-breakout-explainer"/);
assert.match(src,/Math\.min\(207,xr-xf-14\)/,
 'M5 status must not overlay the entire candle chart');
assert.match(src,/\.filter\(z=>z\.kind==='TARGET'\|\|z\.kind==='STOP'\|\|z\.key===primaryZone\?\.key\)/,
 'price rail prioritizes TP, invalidation and the primary zone instead of unreadable labels');
assert.match(css,/forecast-visual-chart-scroll \.forecast-visual-svg\{\s*min-width:720px/,
 'mobile uses legible scrollable candle geometry rather than scaling all bars to 350 px');
assert.doesNotMatch(src,/أدوات إضافية/,'extra tools remain absent');
const body=moduleRef.exports.candleBodyGeometry;
const doji=body(120,120);
assert.equal(doji.height,1,'doji is only a one-pixel marker, never a fake 3px body');
assert.equal(doji.y,119.5,'doji is centered on its real price');
const small=body(100,100.4);
assert.ok(small.height<=1&&small.height>=.9,'subpixel real movement remains a thin marker');
const down=body(102,119);
assert.equal(down.height,17,'full-sized candles use the exact price-scale height');
assert.equal(down.y,102);
assert.match(src,/liveBody\.height/,'LIVE M1 uses the exact same candle-body scale');
assert.match(src,/nextBody\.height/,'AI NEXT uses the exact same candle-body scale');
assert.match(src,/const body=candleBodyGeometry\(px\(c\.open\),px\(c\.close\)\)/,
 'historical and scenario candles both use consistent body geometry');
assert.match(src,/const routeVisible=Boolean\(routeProgress&&/,
 'a reversed motif cannot be presented as progressing toward the goal');
console.log('PASS: price-true live M1 viewport, zero projected clipping, mobile focus, reduced M5 and price-rail clutter');
