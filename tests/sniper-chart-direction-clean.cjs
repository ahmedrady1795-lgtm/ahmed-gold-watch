const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/conditional-target-candles.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:mod,exports:mod.exports});
const build=mod.exports.buildConditionalTargetCandles;
const now=Date.parse('2026-10-19T09:00:00Z'),hist=[];
let last=1000;
for(let i=0;i<155;i++){
 const open=last,close=open-.45-.05*Math.sin(i*.73);
 hist.push({time:now-(155-i)*60000,open,close,high:open+.1,
   low:close-.12});
 last=close;
}
const bad=build({history:hist,now,quote:last,priceFresh:true,side:'BUY',
 targets:[{stage:1,price:last+5}],invalidation:last-50,count:96});
assert.equal(bad.ready,false,'a bullish TP must NOT present an all-bearish replay as a bullish scenario');
assert.equal(bad.bars.length,0);
const ui=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
assert.doesNotMatch(ui,/أدوات إضافية|sniper-more-chart-tools"><summary>/,
 'extra tools must be removed from Qannas');
assert.doesNotMatch(ui,/aria-label="فحص أول شمعة في السيناريو"/,
 'remove first candle verbose status panel');
assert.doesNotMatch(ui,/اسحب الرسم أفقيًا لمتابعة المسار/,
 'do not put instructional paragraphs below first scenario bar');
assert.match(ui,/candleWidth=clamp\(stride\*\.46,3,9\)/,
 'compact TradingView/MT5 candle geometry');
assert.match(ui,/illustrative:\[\.\.\.visualCandles\.slice\(0,18\)/,
 '96 distant illustrative bars cannot crush live candle scale');
assert.match(ui,/targetRoute\.outcome==='ACTIVE'/,
 'a stop-hit historical replay cannot masquerade as a route to TP');
assert.match(ui,/\(conditionalRouteGoals\.length>0\|\|watchTargets\.length>0\)\?\[\]/,
 'when structural TP direction is known, do not draw unrelated bearish/neutral candle pattern');
assert.match(ui,/className="sniper-sampled-live-candle"/);
assert.match(ui,/className="sniper-ai-next-candle"/);
const server=fs.readFileSync('lib/sniper-audit-store.ts','utf8');
assert.match(server,/if\(nextM1\.edgeSupported&&nextM1\.side!=='WAIT'/,
 'only demonstrated heldout opposing M1 edge may veto a paper sniper');
assert.doesNotMatch(server,/if\(nextM1\.side===v\.side\)/,
 'an unvalidated strategy must NOT promote trades');
console.log('PASS: clean compact chart, honest directional TP paths, independent LIVE/NEXT and qualified paper-entry veto');
