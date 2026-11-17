const assert=require('node:assert/strict'),fs=require('node:fs'),
 ts=require('typescript'),vm=require('node:vm');
function load(path){
 const mod={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
 }).outputText,{module:mod,exports:mod.exports});
 return mod.exports;
}
const run=load('lib/sniper-m5-candle-lean.ts').assessM5CandleLean;
const m5Context=load('lib/sniper-m5-candle-lean.ts').observeClosedM5Trend;
const {advanceMovementProof:step,movementProofScore:stats,safeMovementProof:safe}=
 load('lib/sniper-movement-proof.ts');
const start=Date.parse('2026-11-16T10:00:00Z');
const minute=60000,five=300000;
const m1=Array.from({length:23},(_,i)=>{
 const time=start-(18-i)*minute;
 const open=100+i*.16;
 return {time,open,close:open+.12,high:open+.22,low:open-.1};
});
const history=m1.slice(0,18);
const m5=[3,2,1].map((n,i)=>({
 time:start-n*five,open:99+i*.5,
 close:99.6+i*.5,high:99.9+i*.5,low:98.8+i*.5
}));
const data={now:start+5000,price:102.9,sourceReady:true,
 m1:history,m5};
const opened=run(data);
assert.equal(opened.phase,'OPEN');
assert.equal(opened.side,'BUY');
assert.equal(opened.issuedFor,start);
assert.equal(opened.tradeEligible,false);
assert.ok(opened.strength>0);
assert.equal(run({...data,m1:[...history,{
 time:start,open:102.9,high:103.5,low:99,close:99.5}]}).side,
 'BUY','unfinished future bar cannot change candle-open prediction');
assert.equal(run({...data,now:start+110000}).phase,'FOLLOW',
 'mid-candle arrival is labeled FOLLOW, never backdated to OPEN');
assert.equal(run({...data,m1:history.slice(0,17)}).phase,'WAIT',
 'missing latest M1 close cannot be substituted');
assert.equal(run({...data,sourceReady:false}).phase,'WAIT');
const gap=history.filter((_,i)=>i!==7);
assert.equal(run({...data,m1:gap}).phase,'WAIT');
const reversing=Array.from({length:4},(_,i)=>{
 const open=103.4-i*.48;
 return {time:start+i*minute,open,close:open-.4,
 high:open+.08,low:open-.48};
});
const nearEnd=run({...data,now:start+251000,m1:[...history,...reversing],
 price:101.9});
assert.equal(nearEnd.phase,'CLOSE');
assert.equal(nearEnd.side,'SELL',
 'end-minute reading may reverse prior opening bias based on subsequent closes');
const idle={phase:'WATCH',side:'WAIT',sourceAt:null,
 trigger:null,invalidation:null,targets:[]};
const base={prior:[],now:start+5000,asset:'GOLD',source:'single-venue',
 price:102.9,signal:idle,bars:[],m5Bars:[]};
const recorded=step({...base,candleLean:opened});
assert.equal(recorded.length,1);
assert.equal(recorded[0].kind,'OPEN');
assert.equal(recorded[0].status,'NO_TARGET');
assert.equal(recorded[0].m5Outcome,'PENDING');
assert.equal(step({...base,prior:recorded,candleLean:opened}),recorded,
 'a browser quote refresh cannot create duplicate BUY/SELL markers');
const final=step({...base,now:start+251000,price:101.9,
 prior:recorded,candleLean:nearEnd});
assert.equal(final.length,2);
assert.equal(final[1].kind,'CLOSE');
const completed={time:start,open:102.9,high:104,
 low:101.7,close:101.8};
const settled=step({...base,now:start+five+1000,price:101.8,
 prior:final,candleLean:{phase:'WAIT',side:'WAIT',issuedFor:null},
 m5Bars:[completed]});
assert.equal(settled[0].m5Outcome,'WRONG');
assert.equal(settled[1].m5Outcome,'CORRECT');
assert.equal(stats(settled,'GOLD').openingScored,1);
assert.equal(stats(settled,'GOLD').openingHits,0);
assert.equal(stats(settled,'GOLD').closingHits,1);
assert.equal(safe(settled).length,2,'M5 issued records survive browser persistence');
const legacy={...recorded[0],kind:'BREAK',m5Outcome:undefined};
const noHindsight=step({...base,now:start+five+1000,price:101.8,
 prior:[legacy],candleLean:{phase:'WAIT',side:'WAIT',issuedFor:null},
 m5Bars:[completed]});
assert.equal(noHindsight[0].m5Outcome,undefined,
 'old records never gain fabricated retroactive directional grades');
// Missing contiguous M1 must not make an otherwise valid M5 observer go
// silent. The fallback uses CLOSED M5 only; it never creates a BUY/SELL order.
const downM5=Array.from({length:5},(_,i)=>{
 const open=104-i*.8;
 return {time:start-(5-i)*five,open,close:open-.55,
   high:open+.14,low:open-.72};
});
const downWatch=m5Context({now:start+5000,price:100.2,
 sourceReady:true,m5:downM5});
assert.equal(downWatch.side,'SELL');
assert.equal(downWatch.ready,true);
assert.match(downWatch.reason,/ليست ترقب بيع مبكر/);
const upM5=downM5.map((_,i)=>{
 const open=99+i*.8;
 return {time:start-(5-i)*five,open,close:open+.55,
   high:open+.72,low:open-.14};
});
assert.equal(m5Context({now:start+5000,price:102.5,
 sourceReady:true,m5:upM5}).side,'BUY','upside M5 fallback must be symmetric');
assert.equal(m5Context({now:start+5000,price:100.2,
 sourceReady:true,m5:[...downM5,{
 time:start,open:88,close:125,high:126,low:87}]}).side,'SELL',
 'forming five-minute candle must NEVER reverse the previous closed observation');
assert.equal(m5Context({now:start+5000,price:100.2,
 sourceReady:true,m5:downM5.filter((_,i)=>i!==2)}).ready,false,
 'internal M5 candle gap is not silently interpolated');
assert.equal(m5Context({now:start+6*minute,price:100.2,
 sourceReady:true,m5:downM5}).side,'WAIT','old completed M5 cannot claim to be live');
assert.equal(m5Context({now:start+5000,price:100.2,
 sourceReady:false,m5:downM5}).side,'WAIT',
 'disconnected price source cannot feed M5 direction');
const statusPanel=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
assert.match(statusPanel,/hasM5Fallback\?'متابعة '/,
 'historical closed-M5 fallback appears directly in chart headline');
assert.match(statusPanel,/closedM5Context\.reason/,
 'stale M1 is reported honestly instead of an endless generic market-update badge');
assert.doesNotMatch(statusPanel,/candleLean:hasM5Fallback/,
 'a slow M5 fallback never becomes an entry signal or early-signal journal row');
console.log('PASS: real M5 open/end signals from prior M1, no-lookahead, recording, future-only scoring and legacy retention');

const delayed=run({...data,m1:m1.slice(0,17).concat([]),now:start+30000});
assert.equal(delayed.phase,'WAIT','still requires sufficient contiguous history');
const extra={...history[0],time:history[0].time-minute};
const oneMinuteLate=run({...data,now:start+30000,m1:[extra,...history.slice(0,-1)]});
assert.equal(oneMinuteLate.phase,'OPEN','one delayed publication is not an internal gap');
assert.match(oneMinuteLate.reason,/متأخر/);
assert.equal(run({...data,now:start+89000,m1:[extra,...history.slice(0,-1)]}).phase,
 'WAIT','evidence older than two minutes is stale');
const follow=run({...data,now:start+125000,price:m1[19].close,m1:m1.slice(0,20)});
assert.equal(follow.phase,'FOLLOW');
const followed=step({...base,now:start+125000,candleLean:follow});
assert.equal(followed[0].kind,'FOLLOW');
assert.equal(followed[0].issuedAt,start+125000,'never backdate middle-of-candle signals');
assert.equal(safe(followed).length,1,'FOLLOW survives persistence');
assert.equal(step({...base,now:start+126000,prior:followed,candleLean:follow}),followed,
 'FOLLOW is frozen once per M5 and does not repaint');
const followScored=step({...base,now:start+five+5000,prior:followed,
 m5Bars:[{time:start,open:102,high:104,low:101,close:103.5}]});
assert.equal(followScored[0].m5Outcome,'CORRECT');
assert.equal(stats(followScored,'GOLD').followingHits,1);
console.log('PASS: bounded provider lag, mid-candle issuance, persistence and forward-only scoring');

const reversalBase=Array.from({length:17},(_,i)=>({
 time:start-(18-i)*minute,open:100,close:100.04,
 high:100.35,low:99.65
}));
const bullishSweep={time:start-minute,open:99.9,high:100.1,
 low:99.2,close:99.85};
const bearishSweep={time:start-minute,open:100.1,high:100.8,
 low:99.9,close:100.15};
const reverseBuy=run({...data,m1:[...reversalBase,bullishSweep],price:99.85});
const reverseSell=run({...data,m1:[...reversalBase,bearishSweep],price:100.15});
assert.equal(reverseBuy.side,'BUY','rejection after sweep of prior lows');
assert.equal(reverseSell.side,'SELL','rejection after sweep of prior highs');
assert.match(reverseBuy.reason,/انعكاس محتمل/);
assert.match(reverseSell.reason,/انعكاس محتمل/);
const stillPrior=run({...data,m1:[...reversalBase,bullishSweep,
 {time:start,open:99,high:105,low:98,close:104}],price:99.85});
assert.equal(stillPrior.side,'BUY','current unfinished candle cannot flip prior reversal');
// Regression: a bullish M1+M15 context does not turn one upper wick
// into a SELL watch; an invalidated upper wick cannot be sold retroactively.
const risingFrames=run({...data,m1:[...reversalBase,bearishSweep],
 price:100.15,m1Side:'BUY',m15Side:'BUY'});
assert.notEqual(risingFrames.side,'SELL',
 'one upper wick cannot outvote aligned bullish M1 and M15');
const breachedWick=run({...data,m1:[...reversalBase,bearishSweep],
 price:100.95,m1Side:'WAIT',m15Side:'WAIT'});
assert.notEqual(breachedWick.side,'SELL',
 'a quote past the swept wick invalidates a previous reversal');
const fallingFrames=run({...data,m1:[...reversalBase,bullishSweep],
 price:99.85,m1Side:'SELL',m15Side:'SELL'});
assert.notEqual(fallingFrames.side,'BUY',
 'one lower wick cannot outvote aligned bearish M1 and M15');
assert.equal(run({...data,m1:[...reversalBase,bearishSweep],
 price:100.15,m1Side:'SELL',m15Side:'SELL'}).side,'SELL',
 'matched higher frames may still observe a genuine same-way rejection');
console.log('PASS: countertrend M5 wick rejection, live breach, and M1/M15 agreement');
console.log('PASS: pre-move sweep rejection BUY/SELL on closed M1 only');

const firstNewMinute={...bearishSweep,time:start};
const freshMinute=run({...data,now:start+61000,m1:[...reversalBase,bullishSweep,firstNewMinute],price:100.15});
assert.equal(freshMinute.phase,'FOLLOW');
assert.equal(freshMinute.issuedFor,start+60000);
assert.equal(freshMinute.side,'SELL','new closed M1 sweep is read before 90-second boundary');
const continuing=step({...base,now:start+125000,candleLean:{...follow,reason:'استمرار محتمل'}});
const reversingLater=step({...base,now:start+185000,prior:continuing,
 candleLean:{...follow,issuedFor:start+180000,side:'SELL',reason:'انعكاس محتمل'}});
assert.equal(reversingLater.length,2,'continuation does not hide later same-phase reversal');
assert.equal(reversingLater[0].id,continuing[0].id);
assert.equal(reversingLater[0].side,continuing[0].side,'prior observation is never rewritten');
assert.equal(reversingLater[1].issuedAt,start+185000,'reversal timestamp is observation time');
assert.equal(step({...base,now:start+186000,prior:reversingLater,
 candleLean:{...follow,issuedFor:start+180000,side:'SELL',reason:'انعكاس محتمل'}}),reversingLater,'no duplicate reversal');
const legacyReversal={...continuing[0],setupType:'REVERSAL',side:'SELL'};
assert.equal(step({...base,now:start+186000,prior:[legacyReversal],
 candleLean:{...follow,issuedFor:start+180000,side:'SELL',reason:'انعكاس محتمل'}}).length,1,'legacy reversal stays deduplicated');
console.log('PASS: immediate closed-minute evidence, independent reversal recording, frozen history');
