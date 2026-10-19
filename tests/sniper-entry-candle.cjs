const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path){
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{
   compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
 }).outputText,{module,exports:module.exports,require},{filename:path});
 return module.exports;
}
const {assessSniperEntryCandle:assess}=load('lib/sniper-entry-candle.ts');
const {buildLongRangeTargets:targets}=load('lib/long-range-targets.ts');
const {frames}=require('./long-range-fixture.cjs');
const now=Date.parse('2026-10-19T08:00:00Z');
const m1=Array.from({length:90},(_,i)=>{
 const open=100+i*.03,close=open+.07;
 return {time:now-(90-i)*60000,open,close,high:close+.03,low:open-.04};
});
const base={history:m1,now,side:'BUY',price:m1.at(-1).close,sourceReady:true};
const good=assess(base);
assert.equal(good.qualified,true,good.reason);
assert.equal(good.executionAuthority,false,'not executable');
assert.equal(good.status,'CONFIRMED');
assert.ok(good.bodyAtr>=.12&&good.closePosition>=.57);
assert.equal(good.lastClosedAt,now,'decision uses completed candle');
const sell=m1.map((b,i)=>{const open=120-i*.03,close=open-.07;return {
 time:b.time,open,close,low:close-.03,high:open+.04};});
assert.equal(assess({...base,history:sell,side:'SELL',price:sell.at(-1).close}).qualified,true,
 'BUY and SELL symmetric');
const oppose=m1.map(x=>({...x}));const last=oppose.at(-1);
last.close=last.open-.045;last.low=last.close-.02;
assert.equal(assess({...base,history:oppose,price:last.close}).qualified,false,
 'opposite M1 body cannot qualify first candle');
const wick=m1.map(x=>({...x}));wick.at(-1).high+=.1;
assert.equal(assess({...base,history:wick,price:wick.at(-1).close}).qualified,false,
 'strong rejection wick makes close location too weak');
const spike=m1.map(x=>({...x}));spike.at(-1).high+=10;
assert.equal(assess({...base,history:spike}).qualified,false,'volatility shock rejects entry');
assert.equal(assess({...base,price:base.price+.25}).qualified,false,'no quote chase beyond ATR');
const gap=m1.map(x=>({...x}));gap[78].time+=30000;
assert.equal(assess({...base,history:gap}).qualified,false,'gapped M1 is not usable');
assert.equal(assess({...base,sourceReady:false}).qualified,false,'stale market blocks qualification');
assert.equal(assess({...base,side:'WAIT'}).qualified,false);
const future={time:now,open:10,close:1000,high:1000,low:10};
assert.deepEqual(assess({...base,history:[...m1,future]}),good,
 'future or live forming bar may not improve qualification');
const duplicateConflict={...m1.at(-1),close:m1.at(-1).close+.5,
 high:m1.at(-1).high+.5};
assert.equal(assess({...base,history:[...m1,duplicateConflict]}).qualified,false,
 'conflicting OHLC sources must not supply confirmation');
const long=targets({asset:'GOLD',side:'BUY',price:100,now,frames:frames(now)});
assert.ok(long.targets.length>=1,'historical structural reference survives reachability guard');
assert.ok(long.targets[0].price-100<=Math.max(long.atr15*4.2,long.minDistance*2.8)+.02,
 'TP1 cannot skip beyond the M15 volatility reachability envelope');
assert.ok(long.targets.every(x=>x.kind==='STRUCTURAL'),'no fabricated ATR targets');
const store=fs.readFileSync('lib/sniper-audit-store.ts','utf8');
const ui=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
assert.match(store,/assessSniperEntryCandle\(\{history:x\?\.chartCandles,now/,
 'server uses closed M1 quality gate before registering a paper scenario');
assert.match(store,/if\(!entryCandle\.qualified\)blockers\.push/,
 'failed first candle is never promoted to scenario');
assert.match(ui,/className="sniper-live-next-status"/,'chart shows LIVE M1 and the next candle clearly');
assert.match(ui,/sniper-price-snapshot-target/,'real structural TP levels remain visible');
assert.doesNotMatch(ui,/آخر M1 مغلقة:/,'verbose first-candle text removed per user request');
console.log('PASS: M1 body/rejection confirmation, no chase/future/source mixing, BUY/SELL, reachable original TP1');
