const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const out={};vm.runInNewContext(ts.transpileModule(
  fs.readFileSync('lib/spot-radar.ts','utf8'),
  {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}
).outputText,{exports:out});
const now=Date.parse('2026-10-21T14:00:00Z'),minute=60000;
const raw=Array.from({length:71},(_,i)=>{
  const t=now-(71-i)*minute,p=100+i*.008;
  const vol=i>=66?6500:1000;
  const taker=i>=66?vol*.71:vol*.5;
  return [t,String(p),String(p+.08),String(p-.06),String(p+.04),'5',
    t+minute-1,String(vol),55,'3',String(taker),'0'];
});
const closed=out.parseKlines(raw,now-30000);
assert.equal(closed.length,70,'Current unclosed bar must not enter scoring');
assert.equal(closed.at(-1).time,now-2*minute);
const parsed=out.parseKlines(raw,now);
assert.equal(parsed.length,71,'Fully closed minute may be analyzed');
const book=out.parseBook({bids:[['100.52','500'],['100.51','400']],asks:[['100.63','100'],['100.64','100']]},100.57);
assert.ok(book&&book.bidShare>.75);
assert.ok(book.spreadBps>0);
const scored=out.scoreCoin('TESTUSDT',2.1,12000000,parsed,.03,book,now);
assert.ok(scored,'Valid complete candles generate observation');
assert.ok(scored.volumeImpulse>3);
assert.ok(scored.buyShare>.6);
assert.ok(scored.candles.length>=60,'Detail re-scoring requires full history');
assert.ok(scored.invalidation<scored.price);
assert.ok(scored.estimatedCostPct>=.25,'Round-trip fee and slip are never silently free');
assert.ok(Number.isFinite(scored.netRR),'Net reward/risk is finite');
assert.ok(scored.netRR<((scored.target1-scored.price)/(scored.price-scored.invalidation)),
  'Cost-adjusted reward/risk must be lower than gross');

assert.ok(scored.target1>scored.price&&scored.target2>scored.target1);
const noBook=out.scoreCoin('TESTUSDT',2.1,12000000,parsed,.03,null,now);
assert.notEqual(noBook.phase,'EARLY','An EARLY signal requires valid depth');
const broken=parsed.map(c=>({...c}));broken[31].time+=5000;
assert.equal(out.scoreCoin('TESTUSDT',2,12000000,broken,.03,book,now),null,'Gaps fail closed');
assert.equal(out.scoreCoin('TESTUSDT',2,12000000,parsed,.03,book,now+600000),null,'Stale candles fail closed');
assert.equal(out.scoreCoin('TESTUSDT',20,12000000,parsed,.03,book,now)?.phase,'EXTENDED','Do not chase pumped coins');
assert.equal(out.parseBook({bids:[],asks:[]},100),null);
assert.ok(scored.flowDelta5m>0,'Signed executed flow must be positive when taker buys dominate');
assert.ok(scored.flowShiftPct>10,'Increase in taker buy participation is detected');
const quiet=out.scoreCoin('QUIETUSDT',-1,12000000,
  out.parseKlines(raw.map((row,i)=>i>=66?
    row.map((v,j)=>j===7?'1000':j===10?'430':v):row),now),.03,null,now);
assert.ok(quiet&&quiet.score<scored.score,'Low buying impulse cannot outrank strong flow');
const riskBars=parsed.map((bar,i)=>i>=parsed.length-5?
  {...bar,high:bar.close+2}:bar);
const trap=out.scoreCoin('TRAPUSDT',2,12000000,riskBars,.03,book,now);
assert.equal(trap.trapRisk,true,'Upper-wick absorption/distribution risk detected');
assert.notEqual(trap.phase,'EARLY','Trap suspect must never be early confirmed');
assert.equal(out.parseKlines([[now-60000,'NaN','1','1','1','1',now-1,'12','1','1','10','0']],now).length,0);

// Deterministic seven-minute sell impulse, with five closed-minute buyer recovery.
// The selling was REAL taker volume; price did not break while market sells dominated.
const absorptionBars=Array.from({length:70},(_,i)=>{
  const t=now-(70-i)*minute;
  const x={time:t,open:100,high:100.10,low:99.90,close:100,
    quoteVolume:1000,buyQuote:500};
  if(i>=58&&i<65)Object.assign(x,{open:100,high:100.11,low:99.85,close:99.96,
    quoteVolume:2300,buyQuote:460});
  if(i>=65)Object.assign(x,{open:100,close:100.08+(i-65)*.04,
    high:100.11+(i-65)*.04,low:99.94,
    quoteVolume:1600,buyQuote:1168});
  return x;
});
const absorption=out.detectAbsorption(absorptionBars);
assert.equal(absorption.state,'BUY_RECLAIM',
  'A high-volume seller impulse with resilient price plus renewed buyers is a reclaim');
assert.ok(absorption.sellShare>=.75);
assert.ok(absorption.pressureRatio>=2);
assert.ok(absorption.reclaimBuyShare>.7);
const candidateAbs=out.scoreCoin('ABSUSDT',1,20000000,absorptionBars,.01,book,now);
assert.ok(candidateAbs&&candidateAbs.absorption.state==='BUY_RECLAIM');
assert.ok(candidateAbs.reasons.some(x=>x.includes('امتصاص بيع')));
const pendingBars=absorptionBars.map((x,i)=>i>=65?{...x,buyQuote:720,
  close:99.97,open:99.96,high:100.00,low:99.91}:x);
assert.equal(out.detectAbsorption(pendingBars).state,'SELL_ABSORPTION',
  'Seller exhaustion without buyer reclaim is only a watch');
const rejectedDump=absorptionBars.map((x,i)=>i>=58&&i<65?{...x,close:98.6,low:98.4}:x);
assert.equal(out.detectAbsorption(rejectedDump).state,'NONE',
  'Heavy selling WITH large downside is not absorption');
const bogusBuys=absorptionBars.map((x,i)=>i>=58&&i<65?{...x,buyQuote:1700}:x);
assert.equal(out.detectAbsorption(bogusBuys).state,'NONE',
  'Price stability without aggressive sell dominance must not qualify');
const rejectionWicks=absorptionBars.map((x,i)=>i>=65?{...x,high:103}:x);
assert.equal(out.detectAbsorption(rejectionWicks).state,'SELL_ABSORPTION',
  'Large upper wicks prevent a buyer-reclaim confirmation');
console.log('PASS: Spot absorption detection including confirmed rebound, pending case, dumping, no selling, upper-wick trap.');
// Prevent full-market response timeouts seen on Render (October 21, 2026).
const serverRoute=fs.readFileSync('app/api/spot-radar/route.ts','utf8');
const browserFallback=fs.readFileSync('lib/client-spot-radar.ts','utf8');
for(const source of [serverRoute,browserFallback]){
  assert.ok(source.includes('exchangeInfo?symbols='),
    'Exchange metadata must be queried in bounded symbol batches');
  assert.ok(source.includes('ticker/24hr?symbols='),
    '24hr statistics must be queried in bounded batches');
  assert.ok(!source.includes("getJson('/api/v3/exchangeInfo',"),
    'Full unbounded exchangeInfo should not block the scanner');
  assert.ok(!source.includes("request(host,'/api/v3/exchangeInfo',"),
    'Client should not request unbounded exchangeInfo');
}
console.log('PASS: bounded Binance metadata/ticker request guards; no unbounded full-market blocking fetch.');


const hour=3600000;
const hourlyRaw=Array.from({length:72},(_,i)=>{
  const t=now-(72-i)*hour,p=100+i*.008,vol=i>=48?1600000:1000000;
  const buy=vol*(i>=60?.61:.5);
  return [t,String(p),String(p+.10),String(p-.08),String(p+.025),'0',
    t+hour-1,String(vol),'0','0',String(buy),'0'];
});
const completeHours=out.parseHourlyKlines(hourlyRaw,now);
assert.equal(completeHours.length,72,'All 72 settled 1h bars should parse');
const unclosedHour=[...hourlyRaw,[now,'100','101','99','100','0',now+hour-1,
  '2500000','0','0','1250000','0']];
assert.equal(out.parseHourlyKlines(unclosedHour,now).length,72,
  'Current, unfinished 1h candle must never inform the 24h ranking');
const outlook=out.score24hOutlook(scored,completeHours,0,now);
assert.ok(outlook,'Hourly 24h evidence must be available for verified bars');
assert.ok(outlook.rankScore>=0&&outlook.rankScore<=100,
  '24h rank is bounded evidence score, not a probability');
assert.ok(['HIGH','POSSIBLE'].includes(outlook.state),'Supportive hourly case qualifies');
assert.equal(outlook.freshAt,now,'Ranking uses last CLOSED hourly source timestamp');
const riskyHour=completeHours.map(x=>({...x}));
riskyHour[riskyHour.length-25].close=scored.price/1.18;
const extendedOutlook=out.score24hOutlook(scored,riskyHour,0,now);
assert.equal(extendedOutlook.state,'AVOID',
  'Already-pumped +18 percent hourly price must be excluded');
assert.equal(out.score24hOutlook({...scored,trapRisk:true},completeHours,0,now).state,
  'AVOID','Distribution trap cannot be promoted for next 24h');
assert.equal(out.score24hOutlook(scored,completeHours,0,now+4*hour),null,
  'Stale hourly market evidence must not be promoted');
const brokenHour=completeHours.map(x=>({...x}));
brokenHour[brokenHour.length-6].time+=hour/2;
assert.equal(out.score24hOutlook(scored,brokenHour,0,now),null,
  'Gap in closed hourly history invalidates 24h rank');
const rankingUI=fs.readFileSync('app/spot/page.tsx','utf8');
assert.ok(rankingUI.includes('للصعود خلال 24 ساعة'));
assert.ok(rankingUI.includes('spot-simple-list'));
assert.ok(!rankingUI.includes('CandleChart')&&!rankingUI.includes('spot-detail-panel'));
assert.ok(!rankingUI.includes('spot-filters'),'Large detail pane and options must stay hidden');
console.log('PASS: ranked 24h hourly model, no unfinished bars, anti-chase, trap, stale/gap and clean list.');

console.log('PASS: closed candles, signed executed flow, depth, liquidity impulse, fakeout risk, targets, gaps, stale feed. Not a profitability test.');
