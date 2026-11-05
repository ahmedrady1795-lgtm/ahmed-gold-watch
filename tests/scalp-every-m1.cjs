const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('typescript'),cache=new Map();
function load(file){
 file=path.resolve(file);if(cache.has(file))return cache.get(file);
 const out={};cache.set(file,out);
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{
   target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true
 }}).outputText;
 vm.runInNewContext(js,{exports:out,require:name=>name.startsWith('.')?
    load(path.resolve(path.dirname(file),name+'.ts')):require(name),
   console,Date,Math,Number,globalThis:{},process:{env:{}},setTimeout,clearTimeout},
   {filename:file});return out;
}
const {everyM1Direction}=load('lib/sniper-m1-every-direction.ts');
const {priceEveryM1Limit,EVERY_M1_EDGE_V3,EVERY_M1_MIN_NET_R}=
 load('lib/scalp-every-m1-economics.ts');
const {advanceEveryM1}=load('lib/scalp-every-candle.ts');
const {buildM1CandleTape}=load('lib/sniper-m1-candle-tape.ts');
const T=Date.parse('2026-11-05T11:00:00Z');
const bars=Array.from({length:43},(_,i)=>{
 const o=100+i*.06,close=o+.035;
 return {time:T+i*60000,open:o,high:close+.05,low:o-.05,close};
});
const issue=bars.at(-1).time+60000;
const guess=everyM1Direction(bars,issue+100);
assert.ok(guess,'fresh latest closed M1 should get a direction');
assert.equal(guess.side,'BUY');
assert.equal(guess.issuedAt,issue);
const weakBars=Array.from({length:43},(_,i)=>({
 time:T+i*60000,open:100,close:100,high:100.1,low:99.9
}));
const weak=everyM1Direction(weakBars,issue+100);
assert.ok(weak,'flat/weak M1 should still get a direction');
assert.equal(weak.weak,true,'label zero-edge prediction as weak, not certified');
assert.ok(['BUY','SELL'].includes(weak.side));
assert.equal(everyM1Direction(bars.slice(0,19),issue+100),null,'missing candle history must not forge a signal');
assert.equal(everyM1Direction(bars,issue+60001),null,'old candle cannot become a fresh new minute');
const q=(bid,ask,at,source='TEST-MT5')=>({price:(bid+ask)/2,bid,ask,at,source});
const first=q(102.5,102.6,issue+100);
let data={version:1,history:[]};
data=advanceEveryM1(data,bars,first,issue+100,.15);
assert.equal(data.history.length,1,'always propose one per new minute');
assert.equal(data.history.filter(t=>t.entry!=null).length,1,
 'with a valid quote one nonmarketable LIMIT is created, distinct from a fill');
const a=data.history[0];
assert.equal(a.state,'PENDING','weakness or 1.25R trading gate must not discard shadow attempt');
assert.equal(a.limitType,'BUY_LIMIT');
assert.ok(a.entry<first.bid,'BUY LIMIT must be lower than current bid');
assert.equal(a.filledAt,null,'never market-fill on creation');
assert.ok(a.extraCost!=null&&Math.abs(a.extraCost-.05)<.001,
  'bid/ask at entry and exit already charge spread; only fees/slippage remain');
assert.ok(a.tp>a.entry+a.extraCost,
  'micro target must still leave a positive gain after extra execution cost');
assert.equal(a.strategyVersion,EVERY_M1_EDGE_V3,
 'adaptive direction change must start a new future-only proof cohort');
const risk=Math.abs(a.entry-a.stop);
const reward=a.tp-a.entry-a.extraCost;
assert.ok(reward/(risk+a.extraCost)>=EVERY_M1_MIN_NET_R-1e-8,
 'tiny paper gains must not promise 0.25R while taking 1R losses');
assert.ok(a.tp-a.entry<=guess.atr*1.35+.02,
 'quick target remains bounded by observed true range');
const start=a.entry;
data=advanceEveryM1(data,bars,first,issue+500,.15);
assert.equal(data.history.length,1,'same minute and quote never duplicate attempt');
const later=q(start-.04,start-.01,issue+1100);
data=advanceEveryM1(data,bars,later,issue+1200,.15);
assert.equal(data.history[0].state,'ACTIVE','later ask crossing frozen BUY limit activates reference paper');
assert.equal(data.history[0].filledAt,issue+1100);
assert.equal(data.history[0].entry,start,'do not chase a new market entry');
const crossedStop=advanceEveryM1({version:1,history:[{
 ...a,state:'PENDING',lastExecutable:first.ask,lastQuoteAt:issue+100
}]},bars,q(start-.4,start-.01,issue+1100),issue+1200,.15).history[0];
assert.equal(crossedStop.state,'UNKNOWN',
 'a BUY Limit can be touched at ask while its bid is already beyond stop');
const target=data.history[0].tp;
data=advanceEveryM1(data,bars,q(target+.04,target+.08,issue+2200),issue+2300,.15);
assert.equal(data.history[0].state,'QUICK_TP','later executable BID touching TP closes paper attempt');
assert.ok(data.history[0].netR>0,'document cost-adjusted positive outcome');
const again=advanceEveryM1(data,bars,q(target+.08,target+.12,issue+3200),issue+3300,.15);
assert.equal(again.history.length,1,'no target reused as new candle');
const second=[...bars,{time:issue,open:bars.at(-1).close,
 high:bars.at(-1).close+.03,low:bars.at(-1).close-.07,
 close:bars.at(-1).close-.04}];
const after=issue+60000;
data=advanceEveryM1(data,second,q(102.6,102.7,after+100),after+100,.15);
assert.equal(data.history.length,2,'next closed candle gets a distinct fresh attempt');
const down=data.history[1];
assert.ok(down.side==='BUY'||down.side==='SELL');
assert.equal(down.state,'PENDING');
assert.ok(down.side==='BUY'?down.entry<102.6:down.entry>102.7);
data=advanceEveryM1(data,second,q(102.6,102.7,after+60100),after+60100,.15);
assert.equal(data.history[1].state,'UNKNOWN',
 'without intervening quotes an apparently unfilled LIMIT has unknown outcome, never assumed non-fill');
const noBook={price:102,at:issue+100,source:'TEST-MT5'};
let absent=advanceEveryM1({version:1,history:[]},bars,noBook,issue+100,.15);
assert.equal(absent.history.length,1,'forecast still appears when broker quote is incomplete');
assert.equal(absent.history[0].state,'AWAIT_QUOTE',
 'missing bid/ask must not permanently discard a valid candle before the minute ends');
assert.equal(absent.history[0].filledAt,null);
absent=advanceEveryM1(absent,bars,q(102.50,102.60,issue+2100),
 issue+2200,.15);
assert.equal(absent.history[0].state,'PENDING',
 'later valid bid/ask must create the original-minute pending LIMIT');
assert.equal(absent.history[0].issuedAt,issue);
assert.equal(absent.history[0].filledAt,null,
 'first valid quote places a LIMIT, does not immediately fill it');
const artificialActive={
 ...a,state:'ACTIVE',filledAt:issue+1100,lastQuoteAt:issue+59000,
 lastExitAt:issue+59000,lastExitPrice:a.entry+.10
};
const expiry=issue+1100+60000;
const lateQuote=q(a.entry+4,a.entry+4.1,expiry+1300);
const timeExit=advanceEveryM1({version:1,history:[{...artificialActive}]},
 bars,lateQuote,expiry+1500,.15).history[0];
assert.equal(timeExit.state,'TIME_EXIT');
assert.equal(timeExit.exit,artificialActive.lastExitPrice,
 'a late positive quote cannot replace the last real pre-expiry exit');
const staleExpiry=advanceEveryM1({version:1,history:[{
 ...artificialActive,lastExitAt:issue+51000,lastQuoteAt:issue+51000
}]},bars,lateQuote,expiry+1500,.15).history[0];
assert.equal(staleExpiry.state,'UNKNOWN',
 'late price must not forge a target or positive TIME_EXIT without 5s prior evidence');

let expensive=advanceEveryM1({version:1,history:[]},bars,first,issue+100,1.2);
assert.equal(expensive.history[0].state,'COST_UNVIABLE',
  'cost higher than typical M1 move must be logged, not paper-traded');
assert.equal(expensive.history[0].filledAt,null);
const beforeIssued=q(102.5,102.6,issue-1000);
const temporal=advanceEveryM1({version:1,history:[]},bars,beforeIssued,issue+100,.15);
assert.equal(temporal.history[0].state,'AWAIT_QUOTE',
  'quote from before the signal must await the first post-signal quote');
const delayed=advanceEveryM1(temporal,bars,q(102.5,102.6,issue+1800),
 issue+1900,.15);
assert.equal(delayed.history[0].state,'PENDING',
 'an up-to-10-second fresh but pre-signal quote must not eat the whole candle');
assert.equal(delayed.history.length,1,
 'deferred order creation must never double count a candle');
const deferredLimit=delayed.history[0].entry;
const unchanged=advanceEveryM1(delayed,bars,
 q(102.5,102.6,issue+1800),issue+2500,.15);
assert.equal(unchanged.history[0].state,'PENDING',
 'a stale repetition of the staging quote cannot instantly fill the limit');
assert.equal(unchanged.history[0].entry,deferredLimit);
const never=advanceEveryM1({version:1,history:[]},bars,
 beforeIssued,issue+100,.15);
advanceEveryM1(never,bars,beforeIssued,issue+61000,.15);
assert.equal(never.history[0].state,'NO_BID_ASK',
 'only after the full minute without a usable post-signal price is the opportunity missed');
assert.equal(never.history[0].filledAt,null);
const gapBars=bars.map((b,i)=>i===39?{...b,time:b.time-60000}:b);
assert.equal(everyM1Direction(gapBars,issue+100),null,
  'missing M1 history cannot be used as contiguous evidence');

const tape=buildM1CandleTape(bars,issue+100,9);
assert.equal(tape.marks.length,9);
assert.equal(tape.graded,9,'direction offered each of 9 past nonflat candles');
// A prior high sweep followed by a closed bearish rejection should beat
// lagging positive EMA momentum, without peeking at the following bar.
const high=Math.max(...bars.slice(-7,-1).map(b=>b.high));
const rejection=bars.map(b=>({...b}));
rejection[rejection.length-1]={...rejection.at(-1),
  open:high-.02,close:high-.08,high:high+.20,low:high-.18};
const sweepSell=everyM1Direction(rejection,issue+100);
assert.equal(sweepSell.side,'SELL','bearish close back inside previous high prioritizes SELL');
assert.equal(sweepSell.pattern,'SWEEP_REJECTION');
assert.equal(sweepSell.weak,true,'counter-momentum reversal is labeled weak evidence');
const inverse=rejection.map(b=>({...b,open:200-b.open,close:200-b.close,
  high:200-b.low,low:200-b.high}));
const sweepBuy=everyM1Direction(inverse,issue+100);
assert.equal(sweepBuy.side,'BUY','bullish low rejection prioritizes BUY');
assert.equal(sweepBuy.pattern,'SWEEP_REJECTION');
const weakTape=buildM1CandleTape(weakBars,issue+100,9);
assert.equal(weakTape.marks.length,9);
assert.equal(weakTape.graded,0,'flat outcomes do not count as correct directional guesses');
assert.ok(weakTape.marks.every(x=>x.weak),'unqualified weak forecasts are visible and count toward coverage');
const source=fs.readFileSync('lib/scalp-every-candle.ts','utf8');
assert.match(source,/limitsIssued,awaitingQuote,missedMinutes/,
 'honestly report LIMIT creation, quote wait and missed server-observation minutes');
assert.match(source,/q\.at!<t\.issuedAt/,
 'never backdate a pending LIMIT before its prediction timestamp');
const page=fs.readFileSync('app/scalp/page.tsx','utf8');
assert.match(page,/GoldEveryCandle data=\{desk\?\.gold\?\.everyCandle\}/);
const desk=fs.readFileSync('lib/scalp-desk.ts','utf8');
assert.match(desk,/observeEveryM1\(input\.c1,quote,at/);
assert.match(desk,/const qualityGates=plans\.map/,
 'the strict execution-ready path remains separate from shadow each-candle');
const economic=priceEveryM1Limit({side:'SELL',bid:99.7,ask:99.8,
 atr:.55,cost:.17,previousOpen:99.8,previousClose:99.55});
assert.ok(economic&&economic.entry>99.8,'SELL Limit always sits above ask');
assert.ok(economic.netRewardR>=EVERY_M1_MIN_NET_R);
assert.ok(economic.breakEvenWinPct>65&&economic.breakEvenWinPct<70,
 'do not pretend that a 0.45R payoff can win at a 50% hit rate');
assert.equal(priceEveryM1Limit({side:'BUY',bid:100.2,ask:100.3,
 atr:.20,cost:1.2,previousOpen:100.1,previousClose:100.2}),null,
 'when spread/fees dominate the minute, record an unviable forecast, not a fake trade');
const panel=fs.readFileSync('components/SniperM1CandleHunter.tsx','utf8');
assert.match(panel,/everyM1Direction\(p\.history,p\.now\)/);
assert.match(panel,/توقع الشمعة الحالية/);
console.log('PASS: prediction every valid closed M1, weak predictions counted, per-candle limit lifecycle, no market entries or fake broker wins');
