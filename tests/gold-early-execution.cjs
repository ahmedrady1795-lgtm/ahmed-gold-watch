const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path,imports={}){
 const ex={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
 }).outputText,{exports:ex,require:id=>{
  if(!(id in imports))throw Error('Unexpected runtime import '+id);
  return imports[id];
 }});return ex;
}
const select=load('lib/scalp-selection.ts');
const {detectGoldEarlyLead:detect}=load('lib/gold-early-execution.ts',{
 './scalp-selection':select});
const at=Date.parse('2026-11-23T12:32:08Z'),min=Math.floor(at/60000)*60000;
const candles=(side)=>{
 const base=side==='BUY'?99.5:100.5;
 return Array.from({length:80},(_,i)=>({
  time:min-(80-i)*60000,open:base,close:base,
  high:side==='SELL'&&i===79?101.05:100.8,
  low:side==='BUY'&&i===79?98.95:99.2,tickVolume:3
 }));
};
const book={
 available:true,reason:'broker quoted depth only',status:'OBSERVING',
 symbol:'XAUUSDm',asOf:at-1200,samples:4,spanMs:12000,
 bidDepthLots:120,askDepthLots:85,imbalancePct:24,
 bidWall:99.2,askWall:null,bidPersistent:true,askPersistent:false,
 possibleBidWithdrawal:false,possibleAskWithdrawal:false,
 source:'MT5_BROKER_DOM',actionable:false,executionAuthority:false
};
const q=(side)=>({price:side==='BUY'?99.5:100.5,
 bid:side==='BUY'?99.44:100.44,ask:side==='BUY'?99.56:100.56,
 at:at-500,source:'Exness/MT5 · XAUUSDm'});
const input=(side)=>({
 c1:candles(side),candleSource:'Exness/MT5 · XAUUSDm',
 quote:q(side),dom:side==='BUY'?book:{...book,
  bidPersistent:false,askPersistent:true,imbalancePct:-24,
  bidWall:null,askWall:100.8},now:at,marketOpen:true,
 estimatedRoundTripCost:.09
});
for(const side of ['BUY','SELL']){
 const arg=input(side),r=detect(arg);
 assert.equal(r.status,'ENTRY_CANDIDATE',side+' '+r.reason+' '+r.blockers);
 assert.equal(r.side,side);
 assert.equal(r.setup,'SWEEP_RECLAIM');
 assert.equal(r.researchOnly,true);
 assert.equal(r.brokerExecutionVerified,false);
 assert.equal(r.flowIsExecutedTrades,false);
 assert.equal(r.evidenceClass,'MT5_BROKER_DISPLAYED_DEPTH');
 assert.ok(r.score>=60&&r.score<100);
 assert.equal(r.entryType,side+'_LIMIT');
 assert.equal(r.issuedFromClosedM1At,min);
 assert.ok(side==='BUY'?r.entry<=arg.quote.bid:r.entry>=arg.quote.ask,
  'the LIMIT must be passive, never chased across quoted spread');
 assert.ok(side==='BUY'?r.stop<r.entry&&r.entry<r.target:
  r.target<r.entry&&r.entry<r.stop,'directional stop/target geometry');
 assert.ok(r.netR>=1.25,'net economic R after round-trip cost');
 const costBlocked=detect({...arg,estimatedRoundTripCost:3});
 assert.equal(costBlocked.status,'COST_BLOCKED');
 assert.equal(costBlocked.brokerExecutionVerified,false);
 assert.equal(costBlocked.target,null);
 const w=detect({...arg,dom:null});
 assert.equal(w.status,'EARLY_WATCH','gold price-only scout stays visible, never executable');
 assert.equal(w.side,side);
 assert.equal(w.entry,null);
 assert.equal(w.entryType,null);
 assert.equal(w.flowIsExecutedTrades,false);
 const noPrice=detect({...arg,quote:{...arg.quote,
  source:'Biquote · MT5 XAUUSD'}});
 assert.equal(noPrice.status,'STALE','do not mix Exness candles and Biquote quote');
 const incorrectSymbol=detect({...arg,dom:{...arg.dom,symbol:'XAUUSD'}});
 assert.equal(incorrectSymbol.status,'EARLY_WATCH','wrong broker symbol must not grant DOM authority');
 const withdrawn=detect({...arg,dom:{...arg.dom,status:'POSSIBLE_WITHDRAWAL',
  possibleBidWithdrawal:true}});
 assert.equal(withdrawn.status,'EARLY_WATCH','suspected withdrawn liquidity must not enable gold paper entry');
 const missingSamples=detect({...arg,dom:{...arg.dom,samples:1,spanMs:0,status:'WARMUP'}});
 assert.equal(missingSamples.status,'EARLY_WATCH');
 const delayed=detect({...arg,dom:{...arg.dom,asOf:at-15000}});
 assert.equal(delayed.status,'EARLY_WATCH');
 const closed=detect({...arg,marketOpen:false});
 assert.equal(closed.status,'STALE');
 assert.equal(closed.side,'WAIT');
 const late=detect({...arg,quote:{...arg.quote,
  price:arg.quote.price+(side==='BUY'?2:-2),
  bid:arg.quote.bid+(side==='BUY'?2:-2),
  ask:arg.quote.ask+(side==='BUY'?2:-2)}});
 assert.equal(late.status,'LATE','do not chase a candle already moved');
 const stale=detect({...arg,quote:{...arg.quote,at:at-9000}});
 assert.equal(stale.status,'STALE');
 const staleBars=detect({...arg,c1:arg.c1.map((x,i)=>
  i===78?{...x,time:x.time-60000}:x)});
 assert.equal(staleBars.status,'STALE','M1 gaps cannot be bridged with future candles');
}
const source=fs.readFileSync('lib/scalp-desk.ts','utf8');
const ui=fs.readFileSync('components/ScalpDesk.tsx','utf8');
assert.match(source,/detectGoldEarlyLead\(\{/);
assert.match(source,/getMt5GoldDomReading\(at\)/);
assert.match(source,/GOLD_EARLY_M1/);
assert.match(ui,/desk\?\.asset==='GOLD'\?'رادار الذهب المبكر'/);
assert.match(ui,/earlyExecutionAudit\.earlyGold/);
console.log('PASS: Exness gold M1 early sweep BUY/SELL, displayed-DOM-only economics, source/session/gap checks, nonbroker paper LIMIT and missing-DOM watch');
