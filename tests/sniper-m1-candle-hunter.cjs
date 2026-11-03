const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const load=(path,deps={})=>{
  const src=fs.readFileSync(path,'utf8');
  const js=ts.transpileModule(src,{compilerOptions:{
    target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS
  }}).outputText;
  const mod={exports:{}};
  vm.runInNewContext(js,{
    module:mod,exports:mod.exports,
    require:(id)=>{
      if(id==='./sniper-mt5-m1')return deps.mt5;
      throw Error('Unexpected dependency: '+id);
    }
  },{filename:path});
  return mod.exports;
};
const mt5=load('lib/sniper-mt5-m1.ts');
const hunter=load('lib/sniper-m1-candle-hunter.ts',{mt5});

const live=load('lib/sampled-live-candle.ts');
const plotLevels=[
  {label:'BUY STOP',price:100.80,kind:'TRIGGER'},
  {label:'SELL STOP',price:100.79,kind:'TRIGGER'},
  {label:'BUY TP',price:100.81,kind:'TARGET'},
  {label:'SELL TP',price:100.78,kind:'TARGET'},
  {label:'BUY SL',price:100.795,kind:'STOP'},
  {label:'SELL SL',price:100.805,kind:'STOP'}
];
const labelPositions=mt5.placeM1ChartMarkers(plotLevels,{low:100,high:101},28,622);
assert.equal(labelPositions.length,6,'both stop entries, both targets and both SLs must be visible');
for(const m of labelPositions){
  assert.ok(m.lineY>=28&&m.lineY<=622,'horizontal line stays at its true price');
  assert.ok(m.labelY>=41&&m.labelY<=616,'label must stay inside chart clip');
}
for(let i=1;i<labelPositions.length;i++)
  assert.ok(labelPositions[i].labelY-labelPositions[i-1].labelY>=14.9,
    'adjacent target/stop captions cannot overlap on mobile');
assert.equal(mt5.placeM1ChartMarkers(plotLevels,{low:1,high:1},28,622).length,0,
  'invalid chart scale never displays invented level positions');

const base=Date.parse('2026-11-02T08:00:00Z');
const bars=Array.from({length:44},(_,i)=>{
  const open=100+i*.025,close=open+.075;
  return {time:base+i*60000,open,close,high:close+.14,low:open-.12};
});
const last=bars.at(-1),issuedAt=last.time+60000;
const args={bars,now:issuedAt+50,marketOpen:true,sourceReady:true};

const freshQuote={ok:true,price:101.2,source:'Biquote · gold spot',sourceTime:issuedAt};
assert.equal(live.freshM1QuoteForWatch(freshQuote,'Biquote · MT5 XAUUSD candles',issuedAt+50,issuedAt),true);
assert.equal(live.freshM1QuoteForWatch({...freshQuote,source:'Coinbase'},'Biquote · MT5 XAUUSD candles',issuedAt+50,issuedAt),false,
  'foreign exchange venue cannot claim STOP touch');
assert.equal(live.freshM1QuoteForWatch({...freshQuote,sourceTime:issuedAt-1},'Biquote · MT5 XAUUSD candles',issuedAt+50,issuedAt),false,
  'quotes before this candle setup cannot claim a trigger');
assert.equal(live.freshM1QuoteForWatch(freshQuote,'Biquote · MT5 XAUUSD candles',issuedAt+12000,issuedAt),false,
  'stale quotes cannot claim a trigger');
assert.equal(live.freshM1QuoteForWatch({...freshQuote,ok:false},'Biquote · MT5 XAUUSD candles',issuedAt+50,issuedAt),false);

const plan=hunter.buildCandleHunter(args);
assert.equal(plan.ready,true,plan.reason);
assert.equal(plan.tradeEligible,false,'this is paper-only; no broker execution');
assert.equal(plan.candleTime,last.time);
assert.equal(plan.expiresAt,issuedAt+60000);
assert.ok(plan.buy.trigger>last.high,'buy stop is beyond the PRIOR closed high');
assert.ok(plan.sell.trigger<last.low,'sell stop is below the PRIOR closed low');
assert.ok(plan.buy.target>plan.buy.trigger&&plan.buy.stop<plan.buy.trigger);
assert.ok(plan.sell.target<plan.sell.trigger&&plan.sell.stop>plan.sell.trigger);
assert.equal(hunter.buildCandleHunter({...args,now:issuedAt+60000}).ready,false,
  'minute scalp expires exactly when next minute ends');
assert.equal(hunter.buildCandleHunter({...args,sourceReady:false}).ready,false);
assert.equal(hunter.buildCandleHunter({...args,marketOpen:false}).ready,false);
assert.equal(hunter.buildCandleHunter({...args,providerTransition:true}).ready,false);
assert.equal(hunter.buildCandleHunter({...args,bars:bars.slice(-12)}).ready,false);
const gap=bars.map(x=>({...x}));gap[gap.length-9].time+=60000;
assert.equal(hunter.buildCandleHunter({...args,bars:gap}).ready,false,
 'disconnected recent M1 bars cannot produce a new scalp');
const clock=issuedAt;
const close=(overrides)=>({time:clock,open:last.close,close:last.close,
 high:last.high,low:last.low,...overrides});
assert.equal(hunter.scoreNextClosedM1(plan,close({
  high:plan.buy.target+.02,low:last.close-.01,close:plan.buy.target-.01
})),'TARGET_TOUCHED','upper TP touched in the next closed M1 without lower stop');
assert.equal(hunter.scoreNextClosedM1(plan,close({
  high:plan.buy.trigger+.01,low:last.close-.01,close:plan.buy.trigger-.01
})),'TRIGGERED_PENDING','triggered direction without TP or stop is unresolved');
assert.equal(hunter.scoreNextClosedM1(plan,close({
  high:plan.buy.target+.02,low:plan.sell.trigger-.02
})),'AMBIGUOUS','both directional stops in one candle are NOT counted as winners');
assert.equal(hunter.scoreNextClosedM1(plan,close({
  high:plan.buy.trigger+.01,low:plan.buy.stop-.01
})),'AMBIGUOUS','stop could occur before entry within an OHLC candle');
assert.equal(hunter.scoreNextClosedM1(plan,close({
  open:plan.buy.trigger+.01,high:plan.buy.target+.02,low:last.close
})),'OPEN_GAP_UNKNOWN','gap-through cannot assume an executable fill');
assert.equal(hunter.scoreNextClosedM1(plan,close({
  high:plan.buy.trigger-.02,low:plan.sell.trigger+.02
})),'NO_TRIGGER');
assert.equal(hunter.scoreNextClosedM1(plan,close({time:clock+60000})),
 'AMBIGUOUS','only the immediate following candle can be scored');
const replay=hunter.auditCandleHunter([...bars,close({
  high:plan.buy.target+.02,low:last.close-.01,close:plan.buy.target-.01
})],issuedAt+60000,20);
assert.ok(replay.observed>0);
assert.equal(replay.observed,replay.targetTouches+replay.stopTouches+
 replay.ambiguous+replay.openGapUnknown+replay.noTrigger+replay.pending);
const panel=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const snippet=fs.readFileSync('components/SniperM1CandleHunter.tsx','utf8');
const chart=fs.readFileSync('components/SniperMT5M1Chart.tsx','utf8');
const css=fs.readFileSync('app/m1-candle-hunter.css','utf8');
const layout=fs.readFileSync('app/layout.tsx','utf8');
assert.match(panel,/chartMode,setChartMode/);
assert.match(panel,/chartMode==='M1'\?<SniperM1CandleHunter/,
 'minute scalp remains directly accessible in the visible mode switch');
assert.match(panel,/useState<\x27M1\x27\|\x27M15\x27>\(\x27M15\x27\)/,
 'actual M15 future-candle chart is the default visible scenario');
assert.match(panel,/sniper-minute-audit-strip/,
 'a concise M1 audit summary remains visible even in M15 mode');
assert.match(panel,/noForecastReason=\{!projected.ready\?lifecycle:null\}/,
 'unavailable M15 projections must disclose their gating reason');
assert.match(snippet,/sniper-m1-gross-risk/,
 'sub-1R M1 target/stop geometry is flagged before any trade claims');
assert.match(panel,/chartMode==='M15'/,
 'original M15 scenario must remain available');
assert.match(snippet,/BUY STOP/);
assert.match(snippet,/SELL STOP/);
assert.match(snippet,/auditCandleHunter/);
assert.match(chart,/sniper-mt5-m1/);
assert.match(chart,/closedM1ChartBars/);

assert.match(chart,/placeM1ChartMarkers/,'all six levels must be positioned without clipping');
assert.match(chart,/direction="ltr"/,'M1 line captions must not inherit RTL text alignment');
assert.match(chart,/bars.length\+1\)\*step/,'fixed partial-candle slot prevents tick redraw shifting closed history');
assert.match(snippet,/kind:'STOP' as const,label:'BUY SL'/,
  'buyer invalidation must be plotted instead of only shown in a card');
assert.match(snippet,/kind:'STOP' as const,label:'SELL SL'/,
  'seller invalidation must be plotted instead of only shown in a card');
assert.match(snippet,/freshM1QuoteForWatch/,
  'conditional quote notice requires source and issuance checks');

assert.match(css,/\.sniper-m1-hunter-orders/);
assert.match(layout,/m1-candle-hunter\.css/);
console.log('PASS: one-closed-M1 conditional stops/targets, expiry, conservative outcomes, dual chart modes and safe UI');
