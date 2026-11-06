const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('typescript'),cache=new Map();
function load(file){
  file=path.resolve(file);if(cache.has(file))return cache.get(file);
  const out={};cache.set(file,out);
  const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,
      esModuleInterop:true}
  }).outputText;
  vm.runInNewContext(js,{exports:out,require:n=>n.startsWith('.')?
    load(path.resolve(path.dirname(file),n+'.ts')):require(n),
    console,Date,Math,Number,globalThis:{},process:{env:{}},
    setTimeout,clearTimeout},{filename:file});return out;
}
const {priceEveryM1Limit,priceEveryM1NearLimit,EVERY_M1_EDGE_V6}=load('lib/scalp-every-m1-economics.ts');
const {newNearM1Shadow,advanceNearM1Shadow,auditNearM1Shadow,
 NEAR_M1_LIMIT_SHADOW_V1}=load('lib/scalp-m1-near-limit-shadow.ts');
const {advanceEveryM1}=load('lib/scalp-every-candle.ts');
const T=Date.parse('2026-11-06T08:00:00Z');
const historicalSource='Biquote · MT5 XAUUSD candles',source='Biquote · gold spot';
const q=(bid,ask,at=T+250,src=source)=>({bid,ask,at,source:src,
 price:(bid+ask)/2});
const input=(side,quote,at=quote.at+50,extras={})=>({
 side,issuedAt:T,atr:1,previousOpen:100,previousClose:100.15,
 costEstimate:.10,historicalSource,now:at,quote,...extras
});
const body=priceEveryM1Limit({side:'BUY',bid:100.50,ask:100.53,
 atr:1,cost:.10,previousOpen:100,previousClose:100.15});
const near=priceEveryM1NearLimit({side:'BUY',bid:100.50,ask:100.53,
 atr:1,cost:.10,previousOpen:100,previousClose:100.15});
assert.ok(body&&near);
assert.ok(near.entry>body.entry,'near resting BUY entry is above the body-retest BUY LIMIT');
assert.ok(near.entry<100.50,'BUY LIMIT is nonmarketable and does not buy at ask');
assert.ok(near.retestDepth<body.retestDepth);
assert.ok(near.retestDepth<=.16+.01);
assert.ok(near.netRewardR>=.55);
assert.equal(priceEveryM1NearLimit({side:'BUY',bid:100.5,ask:100.8,
 atr:1,cost:.35,previousOpen:100,previousClose:100.15}),null,'spread exceeding ATR cap is not a free fill');
const fresh=q(100.50,100.53);
let a=advanceNearM1Shadow(newNearM1Shadow('BUY',T),input('BUY',fresh));
assert.equal(a.state,'PENDING');
assert.equal(a.placedAt,T+250);
assert.equal(a.filledAt,null,'first quote never self-fills');
assert.equal(a.version,NEAR_M1_LIMIT_SHADOW_V1);
assert.equal(a.lastExecutable,100.53,'BUY touch requires ask, not mid');
const dup=advanceNearM1Shadow(a,input('BUY',fresh,T+700));
assert.equal(dup.state,'PENDING','repeated timestamp cannot touch resting order');
assert.equal(dup.filledAt,null);
const touch=q(a.entry-.05,a.entry-.02,T+1800);
a=advanceNearM1Shadow(a,input('BUY',touch,T+1850));
assert.equal(a.state,'ACTIVE','second executable quote touching LIMIT is a PAPER touch');
assert.equal(a.filledAt,T+1800);
const target=q(a.tp+.02,a.tp+.05,T+4000);
a=advanceNearM1Shadow(a,input('BUY',target,T+4100));
assert.equal(a.state,'QUICK_TP');
assert.ok(a.netR>0);
assert.equal(a.exit,target.bid,'BUY exit must use executable bid');
const unchanged=advanceNearM1Shadow(a,input('BUY',
 q(90,90.03,T+5000),T+5100));
assert.strictEqual(unchanged,a,'closed shadow outcome cannot repaint from later tick');
const gap=advanceNearM1Shadow(
 advanceNearM1Shadow(newNearM1Shadow('BUY',T),input('BUY',fresh)),
 input('BUY',q(100.3,100.33,T+17000),T+17100));
assert.equal(gap.state,'UNKNOWN','missing 15s quotes cannot forge a LIMIT touch');
const missed=advanceNearM1Shadow(newNearM1Shadow('BUY',T),
 input('BUY',q(100.5,100.53,T+13500),T+13600));
assert.equal(missed.state,'NO_EARLY_QUOTE','late first quote is not an early LIMIT');
const wrong=advanceNearM1Shadow(newNearM1Shadow('BUY',T),
 input('BUY',q(100.5,100.53,T+250,'Coinbase'),T+350));
assert.equal(wrong.state,'WATCH','foreign venue cannot stage an order');
const stale=advanceNearM1Shadow(newNearM1Shadow('BUY',T),
 input('BUY',q(100.5,100.53,T+250),T+11400));
assert.equal(stale.state,'WATCH','stale quote cannot be placed retrospectively');
const wrongSource=advanceNearM1Shadow(
 advanceNearM1Shadow(newNearM1Shadow('BUY',T),input('BUY',fresh)),
 input('BUY',q(100.45,100.48,T+1550,'Biquote · alternate'),T+1600));
assert.equal(wrongSource.state,'UNKNOWN','exact feed changes after staging invalidate touch order');
let sell=advanceNearM1Shadow(newNearM1Shadow('SELL',T),
 input('SELL',fresh));
assert.equal(sell.state,'PENDING');
assert.ok(sell.entry>fresh.ask,'SELL LIMIT is resting ABOVE current ask');
sell=advanceNearM1Shadow(sell,
 input('SELL',q(sell.entry+.02,sell.entry+.05,T+1800),T+1900));
assert.equal(sell.state,'ACTIVE');
sell=advanceNearM1Shadow(sell,
 input('SELL',q(sell.tp-.06,sell.tp-.03,T+4200),T+4250));
assert.equal(sell.state,'QUICK_TP');
assert.ok(sell.netR>0);
const sellStopBase=advanceNearM1Shadow(newNearM1Shadow('SELL',T),
 input('SELL',fresh));
const sellFilled=advanceNearM1Shadow(sellStopBase,
 input('SELL',q(sellStopBase.entry+.02,sellStopBase.entry+.05,T+1800),T+1850));
const sellStop=advanceNearM1Shadow(sellFilled,
 input('SELL',q(sellStopBase.stop+.02,sellStopBase.stop+.05,T+3800),T+3850));
assert.equal(sellStop.state,'STOP');
assert.ok(sellStop.netR<0);
const pending=advanceNearM1Shadow(newNearM1Shadow('BUY',T),input('BUY',fresh));
// Keep a known, strictly increasing quote sequence near the end; a
// 59-second blind gap must be UNKNOWN, not a provable unfilled order.
assert.equal(advanceNearM1Shadow(pending,input('BUY',
 q(100.5,100.53,T+59900),T+60100)).state,'UNKNOWN',
 'an hourglass of missing intraminute ticks cannot prove non-fill');
let continuous=pending;
for(const dt of [12000,24000,36000,48000,58000]){
 continuous=advanceNearM1Shadow(continuous,
  input('BUY',q(100.5,100.53,T+dt),T+dt+100));
 assert.equal(continuous.state,'PENDING');
}
assert.equal(advanceNearM1Shadow(continuous,input('BUY',
 q(continuous.entry-.01,continuous.entry,T+59900),T+60100)).state,'UNKNOWN',
 'a crossing only seen after expiry is NOT claimed unfilled');
assert.equal(advanceNearM1Shadow(continuous,input('BUY',
 q(100.5,100.53,T+59900),T+60100)).state,'EXPIRED',
 'continuous recent bid/ask without sampled touch can expire, not fake fill');
const closeBase=advanceNearM1Shadow(newNearM1Shadow('BUY',T),input('BUY',fresh));
const filled=advanceNearM1Shadow(closeBase,input('BUY',touch,T+1850));
const cutoff=filled.filledAt+60000;
// Do not invent a clean last-second TP after 59s without observed quotes.
assert.equal(advanceNearM1Shadow(filled,input('BUY',
 q(filled.tp+.02,filled.tp+.05,cutoff-900),cutoff+100)).state,'UNKNOWN',
 'a last-minute quote with an unobserved 59-second path cannot prove TP');
let liveUntilExpiry=filled;
for(const dt of [13000,25000,37000,49000,60000]){
  liveUntilExpiry=advanceNearM1Shadow(liveUntilExpiry,input('BUY',
   q(filled.entry+.01,filled.entry+.04,T+dt),T+dt+100));
  assert.equal(liveUntilExpiry.state,'ACTIVE');
}
const atLimit=q(filled.tp+.02,filled.tp+.05,cutoff-900);
const nearEnd=advanceNearM1Shadow(liveUntilExpiry,
 input('BUY',atLimit,cutoff+100));
assert.equal(nearEnd.state,'QUICK_TP',
 'a genuine continuously observed pre-cutoff TP cannot be mislabeled TIME_EXIT');
const lateUntrusted=advanceNearM1Shadow(filled,
 input('BUY',q(filled.tp+.04,filled.tp+.08,cutoff+200),cutoff+300));
assert.equal(lateUntrusted.state,'UNKNOWN',
 'quote AFTER expiry may not fabricate a winning pre-expiry trade');
const audited=auditNearM1Shadow([
 {strategyVersion:EVERY_M1_EDGE_V6,state:'STOP',netR:-1.295,
  nearLimitShadow:{...a,netR:.59,state:'QUICK_TP'}},
 {strategyVersion:EVERY_M1_EDGE_V6,state:'NO_EDGE',netR:null,
  nearLimitShadow:{...sellStop,netR:-1.12,state:'STOP'}},
 {strategyVersion:EVERY_M1_EDGE_V6,state:'QUICK_TP',netR:.5,
  nearLimitShadow:{...pending}},
 {strategyVersion:'V4',state:'STOP',netR:-2,
  nearLimitShadow:{...sellStop}},
 ]);
assert.equal(audited.issued,3);
assert.equal(audited.placed,3);
assert.equal(audited.touched,2);
assert.equal(audited.resolved,2);
assert.equal(audited.sameCohort.resolved,1);
assert.equal(audited.sameCohort.nearNetR,.59);
assert.equal(audited.sameCohort.originalNetR,-1.295);
assert.equal(audited.sameCohort.nearMinusOriginalR,1.885);
// End-to-end: low pressure V6 still waits for proof, but a separate
// early LIMIT can be staged from the first same-venue quote.
const bars=Array.from({length:44},(_,i)=>({
 time:T-44*60000+i*60000,open:100,close:100,high:100.1,low:99.9
}));
const minute=bars.at(-1).time+60000;
const quote=(bid,ask,at)=>({bid,ask,at,source,price:(bid+ask)/2});
const first=advanceEveryM1({version:1,history:[]},bars,
 quote(100,100.01,minute+100),minute+150,.015,historicalSource);
const firstAttempt=first.history[0];
assert.equal(firstAttempt.state,'CONFIRMING',
 'real V6 weak minute still uses its original conservative confirmation');
assert.equal(firstAttempt.entry,null);
assert.equal(firstAttempt.nearLimitShadow.state,'PENDING',
 'near shadow stages a resting LIMIT early without changing real V6');
assert.equal(firstAttempt.nearLimitShadow.filledAt,null);
assert.equal(firstAttempt.limitType,firstAttempt.side==='BUY'?'BUY_LIMIT':'SELL_LIMIT');
const side=firstAttempt.side;
const later=side==='BUY'?quote(99.965,99.975,minute+1200):
 quote(100.035,100.045,minute+1200);
const next=advanceEveryM1(first,bars,later,minute+1250,.015,historicalSource);
assert.equal(next.history[0].state,'NO_EDGE',
 'a counter tick still rejects weak V6, rather than secretly placing a Limit');
assert.equal(next.history[0].filledAt,null);
assert.equal(next.history[0].nearLimitShadow.state,'ACTIVE',
 'separate near shadow may observe a touch without changing base V6');
assert.equal(next.history[0].nearLimitShadow.filledAt,minute+1200);
const engine=fs.readFileSync('lib/scalp-every-candle.ts','utf8');
assert.match(engine,/advanceNearM1Shadow\(t\.nearLimitShadow/);
assert.match(engine,/nearLimitShadow:newNearM1Shadow\(proposed,signal\.issuedAt\)/);
assert.match(engine,/const proposed=online\.side/);
assert.match(engine,/nearLimitShadow=auditNearM1Shadow\(hist,EVERY_M1_EDGE_V6\)/);
assert.doesNotMatch(engine,/const proposed=near/);
const page=fs.readFileSync('app/scalp/page.tsx','utf8');
assert.match(page,/اختبار الدخول المبكر/);
console.log('PASS: first-12s near LIMIT remains nonmarketable, bid/ask causal, venue-safe, separate from V6 and cost-accounted');
