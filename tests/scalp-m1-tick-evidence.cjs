const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('typescript'),cache=new Map();
function load(file){
 file=path.resolve(file);if(cache.has(file))return cache.get(file);
 const out={};cache.set(file,out);
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,
  esModuleInterop:true}
 }).outputText,{exports:out,require:n=>n.startsWith('.')?
  load(path.resolve(path.dirname(file),n+'.ts')):require(n),
  console,Date,Math,Number,globalThis:{},process:{env:{}},setTimeout,clearTimeout});
 return out;
}
const {advanceEveryM1}=load('lib/scalp-every-candle.ts');
const {m1BidAskEvidence,requiresM1TickConfirmation,M1_CONFIRM_WINDOW_MS}
 =load('lib/scalp-m1-tick-evidence.ts');
const {priceEveryM1Limit,EVERY_M1_EDGE_V5,EVERY_M1_MIN_NET_R}
 =load('lib/scalp-every-m1-economics.ts');
const T=Date.parse('2026-11-05T10:00:00Z');
const weakBars=Array.from({length:44},(_,i)=>({
 time:T+i*60000,open:100,close:100,high:100.1,low:99.9}));
const issued=weakBars.at(-1).time+60000;
const book=(bid,ask,at=issued+100,source='SAME_BID_ASK')=>
 ({bid,ask,at,source,price:(bid+ask)/2});
const fresh=book(100,100.01);
const base=()=>({version:1,history:[]});
const first=advanceEveryM1(base(),weakBars,fresh,issued+100,.015);
assert.equal(first.history.length,1,'all closed bars still receive a direction');
const t=first.history[0];
const clone=()=>JSON.parse(JSON.stringify(first));
assert.equal(t.weak,true);
assert.equal(t.strategyVersion,EVERY_M1_EDGE_V5);
assert.equal(t.state,'CONFIRMING','pressure 0/100 cannot immediately place resting LIMIT');
assert.equal(t.entry,null);
assert.equal(t.filledAt,null);
assert.equal(requiresM1TickConfirmation({weak:true,pressure:2,side:'BUY',atr:.2}),true);
assert.equal(requiresM1TickConfirmation({weak:false,pressure:68,side:'BUY',atr:.2}),false);
const repeated=advanceEveryM1(clone(),weakBars,fresh,issued+200,.015);
assert.equal(repeated.history[0].state,'CONFIRMING','same tick is NOT fresh confirmation');
const up=t.side==='BUY';
const favor=up?book(100.055,100.065,issued+1100):
 book(99.945,99.955,issued+1100);
const confirmed=advanceEveryM1(clone(),weakBars,favor,issued+1200,.015).history[0];
assert.equal(confirmed.state,'PENDING','short fresh favorable movement allows a frozen LIMIT');
assert.equal(confirmed.confirmedAt,issued+1100);
assert.equal(confirmed.filledAt,null,'confirming momentum does not market-fill');
assert.ok(confirmed.entry!=null);
assert.ok(up?confirmed.entry<favor.bid:confirmed.entry>favor.ask);
assert.ok(confirmed.tp!=null&&confirmed.stop!=null);
assert.ok(confirmed.targetNetR>=EVERY_M1_MIN_NET_R-.01);
assert.ok(confirmed.retestDepth<confirmed.atr*.34,
 'pending LIMIT stays within one-minute pullback distance');
const continued=advanceEveryM1({version:1,history:[confirmed]},weakBars,
 favor,issued+1500,.015).history[0];
assert.equal(continued.state,'PENDING','same quote cannot immediately fill pending LIMIT');
const invalidSource=advanceEveryM1(clone(),weakBars,
 book(100.055,100.065,issued+1100,'OTHER_PROVIDER'),issued+1200,.015);
assert.equal(invalidSource.history[0].state,'UNKNOWN','provider switches cannot certify a weak forecast');
assert.equal(invalidSource.history[0].filledAt,null);
const inverse=up?book(99.84,99.85,issued+1100):
 book(100.15,100.16,issued+1100);
const adverse=advanceEveryM1(clone(),weakBars,inverse,issued+1200,.015);
assert.equal(adverse.history[0].state,'NO_EDGE');
assert.equal(adverse.history[0].entry,null);
assert.equal(adverse.history[0].netR,null,'no-entry is not credited as a zero-size win');
const noFeed=advanceEveryM1(clone(),weakBars,fresh,
 issued+M1_CONFIRM_WINDOW_MS+1,.015);
assert.equal(noFeed.history[0].state,'UNKNOWN',
 'missing updates must be UNKNOWN, never a false NO_EDGE or a paper loss');
const quiet14=advanceEveryM1(clone(),weakBars,
 book(100,100.01,issued+14000),issued+14100,.015);
assert.equal(quiet14.history[0].state,'CONFIRMING');
const deadline=advanceEveryM1(quiet14,weakBars,
 book(100,100.01,issued+M1_CONFIRM_WINDOW_MS+90),
 issued+M1_CONFIRM_WINDOW_MS+200,.015);
assert.equal(deadline.history[0].state,'NO_EDGE',
 'fresh nonconfirming tick at the true seed-based deadline is NO_EDGE');
const lateSeed=advanceEveryM1(base(),weakBars,
 book(100,100.01,issued+9000),issued+9100,.015);
assert.equal(lateSeed.history[0].state,'CONFIRMING');
const midTick=advanceEveryM1(lateSeed,weakBars,
 book(100,100.01,issued+19000),issued+19100,.015);
assert.equal(midTick.history[0].state,'CONFIRMING');
const confirmedLate=advanceEveryM1(midTick,weakBars,
 up?book(100.055,100.065,issued+28000):
 book(99.945,99.955,issued+28000),issued+28100,.015);
assert.equal(confirmedLate.history[0].state,'PENDING',
 'first quote at +9s still gets a full causal evidence window; no old +24s cutoff');
assert.equal(confirmedLate.history[0].filledAt,null,
 'late but causally valid confirmation is a pending LIMIT only');
const sprint=up?book(100.15,100.16,issued+1000):
 book(99.85,99.86,issued+1000);
assert.equal(advanceEveryM1(clone(),weakBars,sprint,issued+1200,.015)
 .history[0].state,'NO_EDGE','fast spent impulse is not chased by a LIMIT');
const q={bid:99.9,ask:99.91,at:issued+1100,source:'SAME_BID_ASK'};
assert.equal(m1BidAskEvidence({side:'BUY',weak:true,pressure:2,atr:.2},
 {mid:100.005,at:issued+100,source:'SAME_BID_ASK'},q),'REJECT');
const feasible=priceEveryM1Limit({side:'BUY',bid:100.2,ask:100.22,
 atr:.8,cost:.05,previousOpen:100.1,previousClose:100.15});
assert.ok(feasible);
assert.ok(feasible.retestDepth<=.8*.32+.02);
assert.ok(feasible.netRewardR>=EVERY_M1_MIN_NET_R-1e-8);
assert.ok(feasible.grossTargetMove<=.8*.72+.02);
assert.ok(feasible.breakEvenWinPct>62&&feasible.breakEvenWinPct<66);
assert.equal(priceEveryM1Limit({side:'BUY',bid:100.2,ask:100.3,
 atr:.2,cost:.12,previousOpen:100.1,previousClose:100.2}),null,
 'high spread/cost cannot fund a one-candle micro-TP');
const page=fs.readFileSync('app/scalp/page.tsx','utf8');
assert.match(page,/CONFIRMING:/);
assert.match(page,/NO_EDGE:/);
assert.match(page,/V5 نتائج LIMIT محسومة/);
assert.match(page,/tickConfirmed/);
assert.match(page,/const stagedLimit=/,
 'order price card must be gated by a real staged reference LIMIT');
assert.match(page,/لم يصدر Limit/,
 'a weak pending confirmation cannot masquerade as a BUY or SELL LIMIT');
assert.doesNotMatch(page,/توقع صعود \/ BUY LIMIT/,
 'never paint phantom BUY LIMIT while no reference order was issued');
assert.match(page,/مكسب 0\.55R مقابل خسارة 1R/,
 'user-facing break-even must use the correct current V5 payoff');
console.log('PASS: M1 weak 0/100 does NOT auto-place; 24s same-source fresh-tick confirmation, no market chasing, tighter costed LIMIT, honest V4 cohort');
