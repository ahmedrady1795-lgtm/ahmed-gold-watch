const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('typescript'),cache=new Map();
function load(file){
  file=path.resolve(file);if(cache.has(file))return cache.get(file);
  const ex={};cache.set(file,ex);
  const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,
      esModuleInterop:true}
  }).outputText;
  vm.runInNewContext(js,{exports:ex,require:id=>id.startsWith('.')?
    load(path.resolve(path.dirname(file),id+'.ts')):require(id),
    Date,Number,Math,console,globalThis:{},process:{env:{}}},{filename:file});
  return ex;
}
const {advanceSmartExitShadow,auditSmartExitShadow,M1_SMART_EXIT_SHADOW_V1}=load(
  'lib/scalp-m1-smart-exit-shadow.ts');
const {advanceEveryM1}=load('lib/scalp-every-candle.ts');
const T=Date.parse('2026-11-05T21:00:00Z');
const p=(side,price,at,previous=null)=>advanceSmartExitShadow({
  previous,side,entry:100,stop:side==='BUY'?99:101,
  filledAt:T,atr:1,cost:.12,extraCost:.05,executableExit:price,at:T+at
});
let s=p('BUY',99.96,0);
assert.equal(s.exitAt,null,'never exit at the same quote as a LIMIT touch');
s=p('BUY',99.6,1000,s);
assert.equal(s.exitAt,null,'loss during early grace is observation, not panic');
s=p('BUY',99.96,4900,s);
assert.equal(s.exitAt,null);
s=p('BUY',99.80,5100,s);
assert.equal(s.streak,1);
assert.equal(s.exitAt,null,'one adverse post-grace quote is insufficient');
let duplicate=p('BUY',99.5,5100,s);
assert.strictEqual(duplicate,s,'same timestamp cannot double-count confirmation');
s=p('BUY',99.78,6100,s);
assert.equal(s.exitAt,T+6100);
assert.equal(s.reason,'ADVERSE_PRESSURE');
assert.ok(s.netR<0,'closing at a real executable bid still pays costs');
assert.ok(s.netR>-1,'shadow should exit before the illustrative hard stop');
assert.strictEqual(p('BUY',100.5,7000,s),s,
 'a hypothetical exited shadow never repaints on later profits');
let gap=p('BUY',99.96,0);
gap=p('BUY',99.79,5100,gap);
gap=p('BUY',99.78,12500,gap);
assert.equal(gap.exitAt,null,'widely separated quotes are not consecutive evidence');
let recovered=p('BUY',99.96,0);
recovered=p('BUY',99.8,5100,recovered);
recovered=p('BUY',99.98,5600,recovered);
recovered=p('BUY',99.79,6100,recovered);
assert.equal(recovered.streak,1,'a recovery must reset the adverse-tick streak');
let fade=p('BUY',99.96,0);
fade=p('BUY',100.40,5100,fade);
fade=p('BUY',100.19,6100,fade);
assert.equal(fade.reason,null);
fade=p('BUY',100.17,7100,fade);
assert.equal(fade.reason,'PROFIT_FADE');
assert.ok(fade.netR>0,'shadow banked gain stays positive after fees');
let sell=p('SELL',100.04,0);
sell=p('SELL',100.21,5200,sell);
sell=p('SELL',100.23,6200,sell);
assert.equal(sell.reason,'ADVERSE_PRESSURE','sell side must be symmetric');
assert.ok(sell.netR<0);
const cmp=auditSmartExitShadow([
 {shadowVersion:M1_SMART_EXIT_SHADOW_V1,filledAt:T,state:'QUICK_TP',
   netR:.5,shadowExit:s},
 {shadowVersion:M1_SMART_EXIT_SHADOW_V1,filledAt:T,state:'STOP',
   netR:-1,shadowExit:null},
 {shadowVersion:M1_SMART_EXIT_SHADOW_V1,filledAt:T,state:'UNKNOWN',
   netR:null,shadowExit:s},
 {shadowVersion:M1_SMART_EXIT_SHADOW_V1,filledAt:null,state:'EXPIRED',
   netR:null,shadowExit:null},
 {shadowVersion:'PREVIOUS_VERSION',filledAt:T,state:'STOP',
   netR:-1,shadowExit:s}
]);
assert.equal(cmp.cohort,4);
assert.equal(cmp.filled,3);
assert.equal(cmp.comparable,2);
assert.equal(cmp.unknown,1);
assert.equal(cmp.earlyExits,1);
assert.equal(cmp.originalNetR,-.5);
assert.ok(cmp.shadowNetR<cmp.originalNetR,
 'if early exit loses instead of later TP, comparison must REPORT WORSE results');
assert.equal(cmp.enoughEvidence,false,'2 results cannot certify effectiveness');

// End-to-end shadow: stage BUY LIMIT, later tick fills paper, the two
// adverse ticks propose an early exit without closing actual TP/SL.
const bars=Array.from({length:43},(_,i)=>{
 const open=100+i*.06,close=open+.035;
 return {time:T+i*60000,open,close,high:close+.05,low:open-.05};
});
const issue=bars.at(-1).time+60000;
const q=(bid,ask,at)=>({price:(bid+ask)/2,bid,ask,at,source:'Exness/MT5'});
let ledger=advanceEveryM1({version:1,history:[]},bars,
 q(102.50,102.51,issue+100),issue+100,.015,'Exness/MT5');
assert.equal(ledger.history[0].shadowVersion,M1_SMART_EXIT_SHADOW_V1);
const entry=ledger.history[0].entry;
assert.ok(entry>0);
ledger=advanceEveryM1(ledger,bars,q(entry-.02,entry-.01,issue+1100),
 issue+1100,.015,'Exness/MT5');
assert.equal(ledger.history[0].state,'ACTIVE');
assert.equal(ledger.history[0].shadowExit.exitAt,null);
const risk=Math.abs(entry-ledger.history[0].stop);
const downside=Math.min(risk*.67,.10);
ledger=advanceEveryM1(ledger,bars,
 q(entry-downside,entry-downside+.01,issue+7500),
 issue+7500,.015,'Exness/MT5');
ledger=advanceEveryM1(ledger,bars,
 q(entry-downside-.005,entry-downside+.005,issue+8700),
 issue+8700,.015,'Exness/MT5');
assert.equal(ledger.history[0].state,'ACTIVE',
 'a counterfactual exit must never close or edit the actual research position');
assert.equal(ledger.history[0].netR,null);
assert.ok(ledger.history[0].shadowExit.exitAt,
 'two consecutive observed adverse bids generate a shadow exit');
const savedShadow=ledger.history[0].shadowExit.netR;
const tp=ledger.history[0].tp;
ledger=advanceEveryM1(ledger,bars,
 q(tp+.02,tp+.04,issue+9300),issue+9300,.015,'Exness/MT5');
assert.equal(ledger.history[0].state,'QUICK_TP',
 'the unchanged actual paper TP remains valid');
assert.ok(ledger.history[0].netR>0);
assert.equal(ledger.history[0].shadowExit.netR,savedShadow,
 'later TP must not repaint original early-exit decision');
const source=fs.readFileSync('lib/scalp-every-candle.ts','utf8');
assert.match(source,/if\(t\.state==='ACTIVE'&&t\.shadowVersion===M1_SMART_EXIT_SHADOW_V1\)/);
assert.match(source,/smartExit:auditSmartExitShadow|const smartExit=auditSmartExitShadow/);
assert.match(source,/forwardPulse,smartExit/);
const page=fs.readFileSync('app/scalp/page.tsx','utf8');
assert.match(page,/data\?\.smartExit\?\.deltaNetR/);
console.log('PASS: M1 two-tick grace exit shadow, adverse/fade, no repaint, honest worse outcomes, unchanged original paper execution');
