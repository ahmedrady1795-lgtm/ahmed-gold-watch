const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const load=(path)=>{
 const mod={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
 }).outputText,{module:mod,exports:mod.exports});
 return mod.exports;
};
const {frozenM15Decision}=load('lib/sniper-m15-freeze.ts');
const {sniperPhaseBadge}=load('lib/sniper-market-phase.ts');
const {observedM15Bias}=load('lib/sniper-m15-bias.ts');
const time=Date.parse('2026-10-19T16:45:00Z'),closed=time-900000;
const old={asset:'GOLD',closedTime:closed,side:'SELL',stop:4150,createdAt:time-5*60000};
const common={old,asset:'GOLD',closedTime:closed,quote:4140,
 fresh:true,marketOpen:true,now:time+1000};
assert.equal(frozenM15Decision(common),'HOLD');
assert.equal(frozenM15Decision({...common,quote:4140.36,now:time+45000}),'HOLD',
 'quote-only motion cannot repaint the forecast');
assert.equal(frozenM15Decision({...common,quote:4149.99}),'HOLD');
assert.equal(frozenM15Decision({...common,quote:4150}),'CLEAR',
 'touching stop invalidates immediately before close');
assert.equal(frozenM15Decision({...common,closedTime:closed+900000,now:time+900001}),'REBUILD',
 'a new closed M15 candle can refresh the forecast');
assert.equal(frozenM15Decision({...common,opposingBosConfirmedAt:time,
 opposingBosSide:'BUY'}),'CLEAR','opposite BOS explicitly invalidates');
assert.equal(frozenM15Decision({...common,opposingBosConfirmedAt:old.createdAt,
 opposingBosSide:'BUY'}),'HOLD','old BOS must not create lookahead invalidation');
assert.equal(frozenM15Decision({...common,opposingBosConfirmedAt:time,
 opposingBosSide:'SELL'}),'HOLD','a supportive BOS does not redraw on its own');
assert.equal(frozenM15Decision({...common,marketOpen:false}),'CLEAR');
assert.equal(frozenM15Decision({...common,fresh:false}),'CLEAR');
assert.equal(frozenM15Decision({...common,asset:'BTC'}),'REBUILD');
assert.equal(frozenM15Decision({...common,old:null}),'REBUILD');
const accumulation=sniperPhaseBadge({ready:true,contextKind:'ACCUMULATION'});
assert.equal(accumulation.label,'تجميع');
assert.equal(accumulation.confirmed,true);
assert.equal(sniperPhaseBadge({ready:true,contextKind:'DISTRIBUTION'}).label,'تصريف');
assert.equal(sniperPhaseBadge({ready:true,contextKind:'COMPRESSION'}).label,'انضغاط');
assert.equal(sniperPhaseBadge({ready:true,phase:'انضغاط / توازن'}).label,'توازن');
assert.equal(sniperPhaseBadge({ready:false,contextKind:'ACCUMULATION'}).confirmed,false,
 'never call accumulation confirmed on stale H4/M15');
const candles=(direction)=>Array.from({length:26},(_,i)=>{
 const open=100+i*.32*direction;
 const close=open+direction*.28;
 return {time:closed-(25-i)*900000,open,close,
 high:Math.max(open,close)+.13,low:Math.min(open,close)-.13};
});
assert.equal(observedM15Bias(candles(1)).side,'BUY');
assert.equal(observedM15Bias(candles(-1)).side,'SELL');
assert.equal(observedM15Bias(candles(1).slice(-10)).side,'WAIT');
const gap=candles(1);gap[21]={...gap[21],time:gap[21].time+1000};
assert.equal(observedM15Bias(gap).side,'WAIT');
assert.equal(observedM15Bias(candles(1)).actionable,false);
const chart=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
assert.match(chart,/frozenM15Decision/);
assert.match(chart,/blockedKey===candleKey/);
assert.match(chart,/lastAttempt\.current===candleKey/);
assert.match(chart,/latestBos/);
assert.match(chart,/sniper-m15-phase/);
assert.match(chart,/buildSniperM15Liquidity/);
assert.match(chart,/observedM15Bias\(actual\)/);
assert.match(chart,/fillOpacity=\{pool\?0\.11:reaction\?0\.24:0\.18\}/,
 'rebound bands must remain distinct while pool and demand opacity stay unchanged');
assert.doesNotMatch(chart,/height=\{plotBottom-plotTop\} fill="#18242d"/,
 'scenario must not be overlaid with an artificial background');
assert.doesNotMatch(chart,/fillOpacity=\{future\?/,
 'historical and simulated OHLC must have the same candle body style');
assert.match(chart,/strokeWidth="1\.05"/);
assert.match(chart,/strokeWidth="\.35"/);
console.log('PASS: tick-stable M15 forecasts, stop and BOS invalidation, no tinted candles, honest phase and directional M15 bias');
