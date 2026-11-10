const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const f='lib/sniper-m15-watch-guide.ts',mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(f,'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:mod,exports:mod.exports},{filename:f});
const {buildM15WatchGuide}=mod.exports;
const M15=900000,base=Date.parse('2026-11-03T06:00:00.000Z');
const bars=Array.from({length:30},(_,i)=>{
 const open=3900+i*.18,close=open+.11;
 return {time:base+i*M15,open,close,high:close+.22,low:open-.21};
});
const now=bars.at(-1).time+M15+3000;
const a=buildM15WatchGuide(bars,now);
assert.equal(a.ready,true,a.reason);
assert.equal(a.referenceOnly,false);
assert.equal(a.bias,'BUY','observed M15 momentum is observation only');
assert.equal(a.anchor,bars.at(-1).close);
assert.equal(a.anchorTime,bars.at(-1).time);
assert.equal(a.up.length,3);
assert.equal(a.down.length,3);
assert.ok(a.upperTrigger>bars.at(-1).high);
assert.ok(a.lowerTrigger<bars.at(-1).low);
assert.ok(a.up[0]>a.anchor&&a.up[1]>a.up[0]&&a.up[2]>a.up[1]);
assert.ok(a.down[0]<a.anchor&&a.down[1]<a.down[0]&&a.down[2]<a.down[1]);
assert.equal(buildM15WatchGuide(bars,now+30000).up.join(','),
  a.up.join(','),'current quote ticks cannot repaint a closed-M15 conditional guide');
const falling=bars.map((x,i)=>{
 const open=4000-i*.18,close=open-.11;
 return {...x,open,close,high:open+.22,low:close-.21};
});
assert.equal(buildM15WatchGuide(falling,now).bias,'SELL');
const gapped=bars.map(x=>({...x}));
gapped[gapped.length-3].time+=60000;
assert.equal(buildM15WatchGuide(gapped,now).ready,false,
  'M15 gaps cannot be interpolated into directional price ranges');
// Whole-slot gaps do not erase observational levels. Never call them a
// qualified signal or fill the missing bars with fabricated OHLC.
const omitted=bars.filter((_,i)=>i!==bars.length-5);
const partialWatch=buildM15WatchGuide(omitted,now);
assert.equal(partialWatch.ready,true,partialWatch.reason);
assert.equal(partialWatch.referenceOnly,true);
assert.equal(partialWatch.bias,'WAIT');
assert.match(partialWatch.reason,/فجوات M15/);
const huntMod={exports:{}};
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync('lib/sniper-m15-hunt-preview.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:huntMod,exports:huntMod.exports});
const sparseHunt=huntMod.exports.buildM15HuntPreview(omitted,partialWatch,now);
assert.equal(sparseHunt.ready,true,sparseHunt.reason);
assert.equal(sparseHunt.referenceOnly,true);
assert.equal(sparseHunt.preferred,'WAIT');
assert.equal(sparseHunt.strength,0);
assert.equal(sparseHunt.observation,undefined);
assert.equal(sparseHunt.buy.length,6);
assert.equal(sparseHunt.sell.length,6);
const overlay=fs.readFileSync('components/SniperM15HuntOverlay.tsx','utf8');
assert.match(overlay,/M15 · GAP WATCH/);
const partial=bars.map(x=>({...x}));
partial[partial.length-1].time+=M15;
assert.equal(buildM15WatchGuide(partial,now).ready,false,
  'unfinished/future M15 candles must not enter the guide');
assert.equal(buildM15WatchGuide(bars.slice(-15),now).ready,false,
  'no unconditional guides from an insufficient M15 window');
const historical=buildM15WatchGuide(bars,now+2*3600000);
assert.equal(historical.ready,true);
assert.equal(historical.referenceOnly,true,
  'older M15 branches are historical-only');
assert.equal(buildM15WatchGuide(bars,now+4*3600000).ready,false,
  'very stale data cannot remain a current scenario');
const panel=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const summary=fs.readFileSync('components/SniperM15Summary.tsx','utf8');
assert.match(panel,/showWatchGuide=!projected.ready&&watchGuide.ready/,
  'watch-only analysis is independent of frozen/qualified trade signals');
assert.match(panel,/split=projected.ready\|\|showWatchGuide\?215:422/,
  'M15 actual chart reserves a genuine watch pane when no trade forecast exists');
assert.match(panel,/className="sniper-m15-watch-guide"/,
  'actual M15 chart renders two branches rather than hiding the scenario');
assert.match(panel,/const projected=aligned\?\.scenario\?\?noScenario/,
  'strict pre-event ML predictions and forward scoring remain separate');
assert.doesNotMatch(panel,/sniper-minute-audit-strip/,
  'duplicate M1 stat strip is removed from the main chart entirely');
assert.match(summary,/sniper-m15-watch-summary/,
  'conditional up/down M15 ranges are explicitly labeled read-only');
assert.match(summary,/sniper-m15-unavailable-details/,
  'trade-forecast blockers are still accessible but collapsed');
console.log('PASS: closed-bar M15 two-path chart, tick stability, source gaps, historical-only expiry and no false trade authorization');
