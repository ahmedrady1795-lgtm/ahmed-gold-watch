const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const compile=(file)=>{
  const x={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
  }).outputText,{exports:x,Map,Math,Number,Array,Boolean});
  return x;
};
const {detectLiquiditySweeps:detect,activeConfirmedSweep:active}=compile('lib/liquidity-sweep.ts');
const {detectScalpStrategies:strategies}=compile('lib/scalp-strategies.ts');
const base=Date.parse('2026-10-15T07:00:00Z'),now=base+60*60000;
const ordinary=()=>Array.from({length:60},(_,i)=>({
  time:base+i*60000,open:100,high:100.5,low:99.5,close:100,volume:12
}));
const buy=ordinary();
buy[58]={...buy[58],open:100,high:100.4,low:98.4,close:100.15,volume:24};
buy[59]={...buy[59],open:100.17,high:100.55,low:99.8,close:100.4};
const observed=detect(buy,now);
assert.equal(observed.ok,true);
const b=observed.events.find(e=>e.side==='BUY'&&e.sweepAt===buy[58].time);
assert.ok(b,'pierce of prior closed M1 low and an explicit wick reclaim');
assert.equal(b.status,'CONFIRMED');
assert.equal(b.level,99.5);
assert.equal(b.extreme,98.4);
assert.ok(b.invalidation<98.4,'a BUY stop must be below the swept wick');
assert.equal(b.confirmedAt,now,'confirmation must be at the NEXT completed M1 close');
assert.equal(active(observed,now)?.id,b.id);
assert.equal(active(observed,now+181000),null,'a stale sweep cannot justify a current paper entry');
const unconfirmed=detect(buy.slice(0,-1),now-60000);
const u=unconfirmed.events.find(e=>e.side==='BUY'&&e.sweepAt===buy[58].time);
assert.equal(u?.status,'PENDING');
assert.equal(active(unconfirmed,now-60000),null);
const trap=buy.map(x=>({...x}));
trap[59]={...trap[59],open:99.7,high:100,low:98.9,close:99.1};
const t=detect(trap,now).events.find(e=>e.side==='BUY'&&e.sweepAt===buy[58].time);
assert.equal(t?.status,'TRAP','non-confirming follow-up close must not masquerade as valid sweep');
assert.equal(active(detect(trap,now),now),null);
const sell=ordinary().map(x=>({
  ...x,open:200-x.open,close:200-x.close,high:200-x.low,low:200-x.high
}));
sell[58]={...sell[58],high:101.6,low:99.6,open:100,close:99.85,volume:24};
sell[59]={...sell[59],open:99.83,high:100.2,low:99.45,close:99.6};
const sellEvidence=active(detect(sell,now),now);
assert.equal(sellEvidence?.side,'SELL','opposite-side geometry must be symmetric');
assert.ok(sellEvidence.invalidation>sellEvidence.extreme);
// Regression: a confirmed sweep must be revoked when a later, fully
// closed M1 breaches the ORIGINAL invalidation wick. The forming M1 does not count.
const buyRevoked=[...buy,{time:now,open:100.4,high:100.55,low:98.1,close:99.6}];
const invalidated=detect(buyRevoked,now+60000).events.find(e=>e.sweepAt===buy[58].time&&e.side==='BUY');
assert.equal(invalidated?.status,'TRAP');
assert.equal(active(detect(buyRevoked,now+60000),now+60000),null);
const buyForming=detect(buyRevoked,now);
assert.equal(buyForming.events.find(e=>e.sweepAt===buy[58].time&&e.side==='BUY')?.status,'CONFIRMED');
const sellRevoked=[...sell,{time:now,open:99.6,high:101.9,low:99.3,close:100.9}];
assert.equal(detect(sellRevoked,now+60000).events.find(e=>e.sweepAt===sell[58].time&&e.side==='SELL')?.status,'TRAP');
const bad=buy.map(c=>({...c}));bad.splice(-4,1);
assert.equal(detect(bad,now).reason,'M1_GAP');
assert.equal(detect(buy,now+4*60000).reason,'STALE_M1');
const future=[...buy,{time:now,open:100,high:400,low:1,close:399}];
assert.equal(detect(future,now).events.find(e=>e.side==='BUY'&&e.sweepAt===buy[58].time)?.status,'CONFIRMED',
  'forming future bar must be ignored, not used to overwrite confirmation');
const ctx={last:buy[58],prev:buy[57],high:100.5,low:99.5,atr:1,body:.1,
  trend1:'WAIT',trend5:'WAIT',f9:100,old9:100,mom:0,efficiency:0.2};
assert.equal(strategies({...ctx,sweepEvidence:null}).filter(x=>x.setup==='SWEEP').length,0,
  'production engine must never trade an unconfirmed same-bar wick');
const accepted=strategies({...ctx,sweepEvidence:b});
assert.equal(accepted.find(x=>x.setup==='SWEEP')?.anchor,98.4,
  'confirmed sweep stop geometry anchors to actual wick rather than a later candle');
const chart=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
const scalp=fs.readFileSync('lib/scalp-opportunities.ts','utf8');
assert.match(chart,/detectLiquiditySweeps\(m\.candles,now\)/);
assert.match(chart,/sniper-confirmed-sweep/);
assert.match(chart,/sweep\.status==='CONFIRMED'|event\.status==='CONFIRMED'/);
assert.match(chart,/recentSweeps/);
assert.match(scalp,/activeConfirmedSweep\(sweepScan,now,90000\)/);
assert.match(scalp,/sweepEvidence:confirmedSweep/);
assert.match(scalp,/سحب السيولة يحتاج استردادًا وتأكيدًا بشمعة دقيقة مغلقة مستقلة/);
console.log('PASS: closed M1 BUY/SELL liquidity sweeps, reclaim confirmation, trap/pending, wick stops, no lookahead, no stale/gap promotions');
