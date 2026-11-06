const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const js=ts.transpileModule(fs.readFileSync('lib/scalp-m1-fast-exit-shadow.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText;
const out={};vm.runInNewContext(js,{exports:out,Math,Number},{
 filename:'lib/scalp-m1-fast-exit-shadow.ts'});
const {watchM1FastExitShadow,auditM1FastExitShadow,
 M1_FAST_EXIT_SHADOW_V1,M1_FAST_EXIT_GRACE_MS}=out;
assert.equal(M1_FAST_EXIT_GRACE_MS,3000);
const T=Date.parse('2026-11-06T07:01:20Z');
const first={adverseTicks:0,earlyExitAt:null,earlyExitPrice:null};
const quote=(at,bid,ask,prior=first,other={})=>({
 side:'BUY',entry:100,stop:99,tp:100.55,filledAt:T,
 lastQuoteAt:at-1500,now:at+300,quoteAt:at,bid,ask,
 quoteSource:'SAME_FEED',fillSource:'SAME_FEED',
 previous:prior,...other
});
let s=watchM1FastExitShadow(quote(T+2000,99.60,99.70));
assert.equal(s.earlyExitAt,null);
assert.equal(s.adverseTicks,0,'first three seconds are a genuine grace window');
s=watchM1FastExitShadow(quote(T+4000,99.65,99.75));
assert.equal(s.adverseTicks,1);
assert.equal(s.earlyExitAt,null,'never exit from one adverse tick');
s=watchM1FastExitShadow(quote(T+5600,99.59,99.69,s));
assert.equal(s.adverseTicks,2);
assert.equal(s.earlyExitAt,T+5600);
assert.equal(s.earlyExitPrice,99.59,'BUY exits using executable bid');
const frozen=watchM1FastExitShadow(quote(T+9000,99.01,99.11,s));
assert.strictEqual(frozen,s,'a later STOP must not reprice the earlier shadow exit');
const reset=watchM1FastExitShadow(quote(T+5600,100.01,100.11,{
 adverseTicks:1,earlyExitAt:null,earlyExitPrice:null
}));
assert.equal(reset.adverseTicks,0,'recovery resets the adverse streak');
assert.equal(watchM1FastExitShadow(quote(T+4000,98.95,99.05)).earlyExitAt,null,
 'the hard stop on a quote cannot be replaced by an earlier fictional exit');
assert.equal(watchM1FastExitShadow(quote(T+4000,100.6,100.7)).earlyExitAt,null,
 'the quick TP on a quote cannot be repriced as a shadow exit');
assert.equal(watchM1FastExitShadow(quote(T+4000,99.6,99.7,first,{
 quoteSource:'OTHER_FEED'})).adverseTicks,0,
 'a changed venue is never allowed to confirm an early exit');
assert.equal(watchM1FastExitShadow(quote(T+4000,99.6,99.7,first,{
 lastQuoteAt:T+4000})).adverseTicks,0,
 'a duplicated quote cannot confirm a new adverse tick');
assert.equal(watchM1FastExitShadow(quote(T+16000,99.6,99.7,first,{
 lastQuoteAt:T+0})).adverseTicks,0,'gaps greater than 15s unknown');
const short=(at,bid,ask,prior=first)=>watchM1FastExitShadow(quote(at,bid,ask,prior,{
 side:'SELL',entry:100,stop:101,tp:99.45
}));
const sell1=short(T+4000,100.22,100.36);
assert.equal(sell1.adverseTicks,1);
const sell2=short(T+5500,100.28,100.39,sell1);
assert.equal(sell2.earlyExitAt,T+5500);
assert.equal(sell2.earlyExitPrice,100.39,'SELL exits using executable ask');
const rows=[
 {strategyVersion:'V5',shadowExitVersion:M1_FAST_EXIT_SHADOW_V1,
  filledAt:T,state:'STOP',netR:-1.295,shadowEarlyExitNetR:-.54},
 {strategyVersion:'V5',shadowExitVersion:M1_FAST_EXIT_SHADOW_V1,
  filledAt:T,state:'QUICK_TP',netR:.58,shadowEarlyExitNetR:null},
 {strategyVersion:'V5',shadowExitVersion:M1_FAST_EXIT_SHADOW_V1,
  filledAt:T,state:'UNKNOWN',netR:null,shadowEarlyExitNetR:-.2},
 {strategyVersion:'V5',filledAt:T,state:'STOP',netR:-1.3,
  shadowEarlyExitNetR:-.3},
 {strategyVersion:'V4',shadowExitVersion:M1_FAST_EXIT_SHADOW_V1,
  filledAt:T,state:'STOP',netR:-1.1,shadowEarlyExitNetR:-.2}
];
const audit=auditM1FastExitShadow(rows,'V5');
assert.equal(audit.compared,2);
assert.equal(audit.earlyExits,1);
assert.equal(audit.baselineNetR,-.715);
assert.equal(audit.shadowNetR,.04);
assert.equal(audit.shadowMinusBaselineR,.755);
const engine=fs.readFileSync('lib/scalp-every-candle.ts','utf8');
assert.match(engine,/t\.shadowEarlyExitNetR=priceAfterEntry\(t,observation\.earlyExitPrice\)/);
assert.match(engine,/t\.shadowExitVersion===M1_FAST_EXIT_SHADOW_V1/);
assert.match(engine,/shadowExitVersion:M1_FAST_EXIT_SHADOW_V1/);
assert.match(engine,/fastExitShadow=auditM1FastExitShadow\(settled,EVERY_M1_EDGE_V6\)/);
assert.match(engine,/if\(t\.side==='BUY'\?exit<=Number\(t\.stop\)/,
 'paper broker-like stop remains active and has not been loosened');
const screen=fs.readFileSync('app/scalp/page.tsx','utf8');
assert.match(screen,/data\?\.learning\?\.fastExitShadow\?\.shadowNetR/);
console.log('PASS: causal short-grace adverse two-tick fast-exit shadow uses bid/ask, no premature exits or original trading changes');
