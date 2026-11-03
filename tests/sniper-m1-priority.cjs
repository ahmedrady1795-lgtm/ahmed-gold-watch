const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
function load(path,dependencies={}){
 const m={exports:{}},src=fs.readFileSync(path,'utf8');
 const js=ts.transpileModule(src,{compilerOptions:{
   target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS
 }}).outputText;
 vm.runInNewContext(js,{module:m,exports:m.exports,require:(id)=>{
   if(!(id in dependencies))throw Error('Unexpected dependency '+id);
   return dependencies[id];
 }},{filename:path});
 return m.exports;
}
const mt5=load('lib/sniper-mt5-m1.ts');
const hunter=load('lib/sniper-m1-candle-hunter.ts',{'./sniper-mt5-m1':mt5});
const directional=load('lib/sniper-m1-priority.ts',{
 './sniper-mt5-m1':mt5,'./sniper-m1-candle-hunter':hunter
});
const base=Date.parse('2026-11-03T08:00:00Z');
const ascending=Array.from({length:52},(_,i)=>{
 const open=100+i*.08,close=open+.06;
 return {time:base+i*60000,open,close,high:close+.055,low:open-.055};
});
const descending=Array.from({length:52},(_,i)=>{
 const open=130-i*.08,close=open-.06;
 return {time:base+i*60000,open,close,high:open+.055,low:close-.055};
});
const now=ascending.at(-1).time+60000;
const bullish=directional.assessM1DirectionalPriority(ascending,now);
const bearish=directional.assessM1DirectionalPriority(descending,now);
assert.equal(bullish.ready,true,bullish.reason);
assert.equal(bullish.side,'BUY','closed M1 uptrend prioritizes upper stop as WATCH only');
assert.equal(bearish.side,'SELL','closed M1 downtrend prioritizes lower stop as WATCH only');
assert.ok(bullish.pressureScore>=0&&bullish.pressureScore<=100);
assert.equal(bullish.anchorTime,ascending.at(-1).time);
const adjusted=ascending.map(x=>({...x}));
adjusted[adjusted.length-1].close-=.025;
assert.notEqual(directional.assessM1DirectionalPriority(adjusted,now).closeLocation,bullish.closeLocation,
 'new closed OHLC must change analysis even with the same time');
assert.equal(directional.assessM1DirectionalPriority(ascending,now+15000).side,'BUY',
 'new quotes within an M1 minute cannot repaint a closed-bar priority');
assert.equal(directional.assessM1DirectionalPriority(ascending,now+61000).ready,false,
 'expired M1 window must never be represented as a live preferred order');
const gap=ascending.map(x=>({...x}));
gap[gap.length-4].time+=1000;
assert.equal(directional.assessM1DirectionalPriority(gap,now).ready,false,
 'gapped or malformed closed-bar history cannot create a priority');
assert.equal(directional.assessM1DirectionalPriority(ascending.slice(-15),now).ready,false);
const plan=hunter.buildCandleHunter({
 bars:ascending,now,sourceReady:true,marketOpen:true
});
assert.equal(plan.ready,true);
const last=ascending.at(-1);
const next=(v)=>({
 time:now,open:last.close,high:last.high,low:last.low,close:last.close,...v
});
assert.equal(directional.scorePrioritizedNextM1(plan,'BUY',next({
 high:plan.buy.target+.05,low:last.close-.015,close:plan.buy.target-.01
})),'TARGET_TOUCHED',
 'observed single-sided target reach is a touch only, not a verified broker win');
assert.equal(directional.scorePrioritizedNextM1(plan,'BUY',next({
 high:plan.buy.trigger-.01,low:plan.sell.trigger+.01
})),'NO_TRIGGER');
assert.equal(directional.scorePrioritizedNextM1(plan,'BUY',next({
 high:plan.buy.target+.05,low:plan.sell.trigger-.01
})),'BOTH_BREAKOUTS_AMBIGUOUS',
 'grid whipsaw in same OHLC minute cannot imply an ordering');
assert.equal(directional.scorePrioritizedNextM1(plan,'BUY',next({
 high:plan.buy.target+.05,low:plan.buy.stop-.01
})),'STOP_ORDER_AMBIGUOUS',
 'stop hit before vs after entry is unknown from OHLC');
assert.equal(directional.scorePrioritizedNextM1(plan,'BUY',next({
 open:plan.buy.trigger+.01,high:plan.buy.target+.05,low:last.close
})),'GAP_UNKNOWN','gap over conditional level has no proven fill');
assert.equal(directional.scorePrioritizedNextM1(plan,'BUY',next({
 time:now+60000,high:plan.buy.target+.05
})),'UNRESOLVED','late candles must not be used to claim on-time TP');
assert.equal(directional.scorePrioritizedNextM1(plan,'SELL',next({
 high:last.close+.015,low:plan.sell.target-.05,close:plan.sell.target+.01
})),'TARGET_TOUCHED','SELL is evaluated separately without BUY-stop leakage');
const audit=directional.auditPrioritizedM1(ascending,now,32);
assert.ok(audit.observed>0&&audit.prioritized>0);
assert.equal(audit.observed,audit.prioritized+audit.balanced);
assert.equal(audit.prioritized,
 audit.targetTouches+audit.noTrigger+audit.ambiguous+audit.gapUnknown+audit.unresolved,
 'each historical observation gets one conservative outcome, never double counting');
const same=directional.auditPrioritizedM1(ascending,now+15000,32);
assert.equal(JSON.stringify(audit),JSON.stringify(same),'live quote ticks never change the closed-candle audit');
assert.ok(directional.grossBreakEvenPct()>53&&directional.grossBreakEvenPct()<54,
 '0.72 ATR TP / 0.82 ATR stop needs more than 53% wins BEFORE venue costs');
const panel=fs.readFileSync('components/SniperM1CandleHunter.tsx','utf8');
const html=fs.readFileSync('components/SniperMT5M1Chart.tsx','utf8');
assert.match(panel,/favored=liveEligible&&priority.ready&&priority.anchorTime===plan.candleTime/,
 'priority is only considered on a LIVE matching closed-candle plan');
assert.match(panel,/auditPrioritizedM1/,'backtest comparison belongs in optional M1 details');
assert.match(panel,/BUY STOP ★/,'visually distinguish only the currently favored stop');
assert.match(panel,/SELL STOP ★/,'visually distinguish favored sell');
assert.match(panel,/grossBreakEvenPct\(\)/,'show actual break-even needed before fees');
assert.match(html,/referenceOnly/,
 'expired levels remain historical only, regardless of priority');
console.log('PASS: M1 closed-bar one-side priority, data gaps/expiry, conservative OHLC audit and break-even disclosure');
