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
 'the underlying M15 historical guide still computes watch states');
assert.match(panel,/split=215,end=422/,
 'the liquidity map keeps a dedicated pane even when M15 has no qualified plan');
assert.match(panel,/<SniperLiquidityDecisionMap watch=\{watchMap\}/,
 'M15 projects observed highs/lows instead of two artificial OHLC branches');
assert.match(panel,/const projected=aligned\?\.scenario\?\?noScenario/,
 'retrospective immutable scenarios remain available for forward scoring');
assert.doesNotMatch(panel,/className="sniper-m15-watch-guide"|<SniperM15HuntOverlay/,
 'the historical ATR watch route does not paint fake future candles');
assert.doesNotMatch(panel,/sniper-minute-audit-strip/);
assert.match(summary,/sniper-m15-unavailable-details/,
 'historical forecast detail remains accessible in a disclosure');
console.log('PASS: closed-bar M15 two-path chart, tick stability, source gaps, historical-only expiry and no false trade authorization');
