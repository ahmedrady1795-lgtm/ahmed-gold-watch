const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const load=(path,deps={})=>{
 const mod={exports:{}},js=ts.transpileModule(fs.readFileSync(path,'utf8'),{
   compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
 }).outputText;
 vm.runInNewContext(js,{module:mod,exports:mod.exports,require:id=>{
   if(!(id in deps))throw Error('Unexpected import '+id+' in '+path);
   return deps[id];
 }},{filename:path});
 return mod.exports;
};
const guide=load('lib/sniper-m15-watch-guide.ts');
const hunter=load('lib/sniper-m15-hunt-preview.ts');
const mt5=load('lib/sniper-mt5-m1.ts');
const scalp=load('lib/sniper-m1-candle-hunter.ts',{'./sniper-mt5-m1':mt5});
const priority=load('lib/sniper-m1-priority.ts',{
 './sniper-mt5-m1':mt5,'./sniper-m1-candle-hunter':scalp
});
const conflict=load('lib/sniper-m1-conflict-arbiter.ts');
const recovery=load('lib/sniper-m1-regime-recovery.ts');
const relative=load('lib/sniper-m1-relative-edge.ts');
const every=load('lib/sniper-m1-every-direction.ts',{
 './sniper-mt5-m1':mt5,'./sniper-m1-priority':priority,
 './sniper-m1-conflict-arbiter':conflict,
 './sniper-m1-regime-recovery':recovery,
 './sniper-m1-relative-edge':relative
});
const tape=load('lib/sniper-m1-candle-tape.ts',{
 './sniper-mt5-m1':mt5,'./sniper-m1-every-direction':every
});
const base=Date.parse('2026-11-03T00:00:00Z'),M15=900000,M1=60000;
const history=Array.from({length:24},(_,i)=>{
 const open=3900+i*.19,close=open+.11;
 return {time:base+i*M15,open,high:close+.21,low:open-.23,close};
});
const asOf=history.at(-1).time+M15;
const g=guide.buildM15WatchGuide(history,asOf);
assert.equal(g.ready,true,g.reason);
const preview=hunter.buildM15HuntPreview(history,g,asOf);
assert.equal(preview.ready,true,preview.reason);
assert.equal(preview.anchor,history.at(-1).close);
assert.equal(preview.anchorTime,history.at(-1).time);
assert.equal(preview.buy.length,6);
assert.equal(preview.sell.length,6);
assert.equal(preview.pools.length,2);
for(const side of ['buy','sell']){
 let prior=preview.anchor;
 for(const bar of preview[side]){
  assert.equal(bar.open,Number(prior.toFixed(6)),'each candle opens at prior hypothetical close');
  assert.ok(bar.high>=Math.max(bar.open,bar.close));
  assert.ok(bar.low<=Math.min(bar.open,bar.close));
  assert.ok(bar.time>asOf-1);
  assert.equal(bar.illustrative,true,'must be visibly hypothetical, not executed');
  prior=bar.close;
 }
}
assert.ok(preview.buy.at(-1).close>preview.anchor);
assert.ok(preview.sell.at(-1).close<preview.anchor);
assert.equal(
 JSON.stringify(hunter.buildM15HuntPreview(history,g,asOf+12000).buy),
 JSON.stringify(preview.buy),
 'live quote ticks cannot repaint a closed-M15 preview'
);
const gap=history.map(x=>({...x}));gap[gap.length-3].time+=60000;
assert.equal(hunter.buildM15HuntPreview(gap,g,asOf).ready,false);
assert.equal(hunter.buildM15HuntPreview(history,{...g,ready:false},asOf).ready,false);
const staleGuide=guide.buildM15WatchGuide(history,asOf+4*3600000);
assert.equal(hunter.buildM15HuntPreview(history,staleGuide,asOf+4*3600000).ready,false,
 'unqualified stale M15 data must not generate fictional candle paths');
const previousMax=Math.max(...history.slice(-13,-1).map(b=>b.high));
const rejection=history.map(x=>({...x}));
rejection[rejection.length-1]={
 ...rejection.at(-1),
 open:previousMax+.06,high:previousMax+.28,
 low:previousMax-.29,close:previousMax-.06
};
const rejectedGuide=guide.buildM15WatchGuide(rejection,asOf);
assert.equal(rejectedGuide.ready,true,rejectedGuide.reason);
const rejected=hunter.buildM15HuntPreview(rejection,rejectedGuide,asOf);
assert.equal(rejected.sweep,'HIGH_REJECTION','sweep needs a CLOSED high rejection');
assert.equal(rejected.preferred,'SELL','confirmed swing-high rejection prioritizes SELL watch');
assert.ok(rejected.strength>0&&rejected.strength<100,
 'heuristic strength is bounded, not presented as an empirical probability');
const minute=Array.from({length:42},(_,i)=>{
 const open=100+i*.08,close=open+.05;
 return {time:base+i*M1,open,close,high:close+.07,low:open-.04};
});
const minuteNow=minute.at(-1).time+M1;
const result=tape.buildM1CandleTape(minute,minuteNow,9);
assert.ok(result.marks.length>0,'at least some prior-candle predictions should be scored');
assert.equal(result.graded,result.marks.filter(m=>m.aligned!==null).length);
assert.equal(result.aligned,result.marks.filter(m=>m.aligned===true).length);
assert.ok(result.aligned<=result.graded);
for(const row of result.marks){
 assert.ok(row.time<minuteNow);
 assert.ok(['BUY','SELL','WAIT'].includes(row.predicted));
 assert.ok(row.high>=Math.max(row.open,row.close));
 assert.ok(row.low<=Math.min(row.open,row.close));
}
const tweaked=minute.map(x=>({...x}));
tweaked[tweaked.length-1].close-=.04;
const past=tape.buildM1CandleTape(tweaked,minuteNow,9);
assert.equal(
 JSON.stringify(result.marks.slice(0,-1)),
 JSON.stringify(past.marks.slice(0,-1)),
 'future last candle changes cannot rewrite earlier per-candle predictions'
);
assert.equal(
 JSON.stringify(tape.buildM1CandleTape(minute,minuteNow+18000,9)),
 JSON.stringify(result),
 'partial ticks do not change closed-candle scoring'
);
const panel=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const m1=fs.readFileSync('components/SniperM1CandleHunter.tsx','utf8');
const hud=fs.readFileSync('components/SniperHuntHUD.tsx','utf8');
const plot=fs.readFileSync('components/SniperM15HuntOverlay.tsx','utf8');
const theme=fs.readFileSync('app/smart-money-hunter.css','utf8');
const layout=fs.readFileSync('app/layout.tsx','utf8');
assert.match(panel,/buildM15HuntPreview\(actual,watchGuide,now\)/,
 'scenario overlay must use the REAL closed-M15 guide');
assert.match(panel,/<SniperM15HuntOverlay forecast=\{huntPreview\}/,
 'actual M15 chart must render the realistic conditional candles');
assert.match(panel,/<SniperHuntHUD hunt=\{huntPreview\}/,
 'liquidity and live bias appear as a compact live readout above candles');
assert.match(panel,/className="sniper-m15-watch-guide"/,
 'old conditional M15 watch region remains in the real SVG');
assert.match(panel,/className="sniper-m15-conditional-route"/,
 'audited forecast is shown as a path only');
assert.doesNotMatch(panel,/futureCandleWidth|sniper-m15-projected/,
 'no future candle bodies or wicks in the chart')
assert.match(plot,/M15 · EARLY PATH/,
 'watch preview retains dual conditional price tracks');
assert.doesNotMatch(plot,/drawCandles\(|sniper-hunt-candles/,
 'watch overlay must never render hypothetical candle bodies')
assert.match(plot,/sniper-hunt-pool/,'high/low stop clusters are visual zones, not hidden orders');
assert.match(hud,/مؤشر غير مُعاير/,
 'non-calibrated price pattern strength must not masquerade as probability');
assert.ok(m1.indexOf('<SniperMT5M1Chart')<m1.indexOf('<SniperM1CandleTape'),
 'live M1 candle chart stays above the historical replay strip');
assert.ok(m1.indexOf('<SniperMT5M1Chart')<m1.indexOf('sniper-m1-hunter-orders'),
 'verbose entry/stop cards are optional and do not block the M1 chart');
assert.match(theme,/\.sniper-hunt-hud/);
assert.match(theme,/\.sniper-candle-tape-rail/);
assert.match(layout,/smart-money-hunter\.css/,
 'the gold/black mobile layout overrides old styles');
console.log('PASS: real closed-M15 candle scenario paths, confirmed sweep, causal M1 replay and compact trading cockpit');
