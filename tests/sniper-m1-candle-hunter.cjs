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
const base=Date.parse('2026-11-02T08:00:00Z');
const bars=Array.from({length:44},(_,i)=>{
  const open=100+i*.025,close=open+.075;
  return {time:base+i*60000,open,close,high:close+.14,low:open-.12};
});
const last=bars.at(-1),issuedAt=last.time+60000;
const args={bars,now:issuedAt+50,marketOpen:true,sourceReady:true};
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
assert.match(css,/\.sniper-m1-hunter-orders/);
assert.match(layout,/m1-candle-hunter\.css/);
console.log('PASS: one-closed-M1 conditional stops/targets, expiry, conservative outcomes, dual chart modes and safe UI');
