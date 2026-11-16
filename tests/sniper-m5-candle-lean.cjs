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
console.log('PASS: real M5 open/end signals from prior M1, no-lookahead, recording, future-only scoring and legacy retention');

const delayed=run({...data,m1:m1.slice(0,17).concat([]),now:start+30000});
assert.equal(delayed.phase,'WAIT','still requires sufficient contiguous history');
const extra={...history[0],time:history[0].time-minute};
const oneMinuteLate=run({...data,now:start+30000,m1:[extra,...history.slice(0,-1)]});
assert.equal(oneMinuteLate.phase,'OPEN','one delayed publication is not an internal gap');
assert.match(oneMinuteLate.reason,/متأخر/);
assert.equal(run({...data,now:start+89000,m1:[extra,...history.slice(0,-1)]}).phase,
 'WAIT','evidence older than two minutes is stale');
const follow=run({...data,now:start+125000,m1:m1.slice(0,20)});
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
const reverseBuy=run({...data,m1:[...reversalBase,bullishSweep]});
const reverseSell=run({...data,m1:[...reversalBase,bearishSweep]});
assert.equal(reverseBuy.side,'BUY','rejection after sweep of prior lows');
assert.equal(reverseSell.side,'SELL','rejection after sweep of prior highs');
assert.match(reverseBuy.reason,/انعكاس محتمل/);
assert.match(reverseSell.reason,/انعكاس محتمل/);
const stillPrior=run({...data,m1:[...reversalBase,bullishSweep,
 {time:start,open:99,high:105,low:98,close:104}]});
assert.equal(stillPrior.side,'BUY','current unfinished candle cannot flip prior reversal');
console.log('PASS: pre-move sweep rejection BUY/SELL on closed M1 only');
