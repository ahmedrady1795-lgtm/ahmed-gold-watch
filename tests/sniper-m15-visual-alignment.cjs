const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync('lib/sniper-m15-visual-alignment.ts','utf8'),
  {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}
).outputText,{module:mod,exports:mod.exports});
const gate=mod.exports.assessM15FrozenChartAlignment;
const history=Array.from({length:32},(_,i)=>({
  open:4120+i*.3,high:4120+i*.3+1.5,low:4120+i*.3-.8,close:4120+i*.3+.2
}));
const first=4130,model=Array.from({length:12},(_,i)=>({
  open:first+i*.6,close:first+(i+1)*.6,high:first+(i+1)*.6+.5,
  low:first+i*.6-.5
}));
const core={original:model,historical:history,atr:2.7,elapsedSteps:0};
assert.equal(gate({...core,live:4130.3}).reason,'ALIGNED');
assert.equal(gate({...core,live:4136.7}).reason,'MOVED_AWAY',
 'a market breakout must never make an old forecast appear attached to LIVE');
assert.equal(gate({...core,live:4132.5}).visible,true,
 'ordinary incomplete-candle movement must not dismiss fixed scenarios');
assert.equal(gate({...core,live:4134}).reason,'MOVED_AWAY',
 'a fast live move outside the frozen next candle must not appear aligned');
assert.equal(gate({...core,live:null}).reason,'NO_LIVE');
assert.equal(gate({...core,elapsedSteps:3,live:model[2].close+.2}).visible,true,
 'later M15 steps compare to their original frozen time-matched reference');
assert.equal(gate({...core,elapsedSteps:3,live:model[2].close+8}).visible,false);
assert.equal(gate({...core,live:4150}).reason,'MOVED_AWAY',
 'large 15-minute gold breakout must detach an obsolete lower forecast');
const chart=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const badge=fs.readFileSync('components/GoldRadarBadge.tsx','utf8');
assert.match(chart,/assessM15FrozenChartAlignment/);
assert.match(chart,/!detached\?stable:null/,'detach stale forecast from live candle without re-anchoring');
assert.match(chart,/const displayBars=aligned\?\.visualBars\?\.slice\(elapsedSteps\)\?\?shownBars;/);
assert.match(chart,/الشموع المتوقعة لم تتغير/,'archive remains unchanged when visual forecast is hidden');
assert.doesNotMatch(chart,/extendIllustrativeM15ToTargets|compactM15TargetDrawing/,
 'do not manufacture a route toward distant H1/H4 watch targets');
assert.match(badge,/<strong>◈ رادار الذهب<\/strong>/);
assert.ok(badge.indexOf('{expanded&&<section')<badge.indexOf('sniper-gold-radar-prices'),
 'large radar data must remain behind tap-to-expand rather than obscuring candles');
console.log('PASS: detached M15 routes hidden, frozen proof preserved, radar collapsed and targets honest');
