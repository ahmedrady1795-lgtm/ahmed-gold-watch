const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('typescript'),cache=new Map();
function load(file){
  file=path.resolve(file);if(cache.has(file))return cache.get(file);
  const out={};cache.set(file,out);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,
      esModuleInterop:true}
  }).outputText,{exports:out,require:name=>name.startsWith('.')?
    load(path.resolve(path.dirname(file),name+'.ts')):require(name),globalThis:{},console});
  return out;
}
const {buildGoldQuickExit,GOLD_QUICK_MIN_NET_R}=load('lib/scalp-quick-exit.ts');
const {advancePaperTrade,evaluatePaperProof,summarizePaperBySetup}=load('lib/scalp-paper-ledger.ts');
const T=Date.parse('2026-11-05T07:20:00Z');
const samplePlan=(side,horizon=5,cost=.10)=>({
  asset:'GOLD',horizon,side,entry:100,stop:side==='BUY'?99:101,
  targets:[{price:side==='BUY'?103:97,kind:'STRUCTURE'}],cost,
  setup:'BREAKOUT',id:'quick-'+side,at:T-1000,expiresAt:T+210000,status:'ARMED',
  costBreakdown:{quoteSource:'fixture'}
});
const buy=samplePlan('BUY'),sell=samplePlan('SELL');
const b=buildGoldQuickExit(buy,100),s=buildGoldQuickExit(sell,100);
assert.equal(b.price,100.43,'micro BUY target must include fee/slippage before a 0.30R gain');
assert.equal(s.price,99.57,'micro SELL target must mirror the BUY move');
assert.equal(b.maxHoldMs,120000,'M5 quick path must cap holding at two minutes');
assert.equal(buildGoldQuickExit(samplePlan('BUY',1),100).maxHoldMs,60000);
assert.equal(GOLD_QUICK_MIN_NET_R,.30);
assert.equal(buildGoldQuickExit({...buy,asset:'BTC'},100),null,'BTC remains unchanged');
assert.equal(buildGoldQuickExit({...buy,cost:3},100),null,'gross price cannot be set above original target');
assert.equal(buildGoldQuickExit({...buy,stop:101},100),null,'opposite stop invalidates quick exit');
assert.equal(buildGoldQuickExit({...buy,cost:0},100),null,'unknown free execution is not a winning setup');
const q=(price,at,source='fixture')=>({price,at,source});
const active=(plan,quick)=>({
 plan,state:'ACTIVE',activatedAt:T,closedAt:null,exit:null,netR:null,
 lastAt:T,lastPrice:100,note:'',quickExitPrice:quick.price,
 quickMaxHoldMs:quick.maxHoldMs,quickQuoteSource:'fixture'
});
const buyActive=active(buy,b);
assert.equal(advancePaperTrade(buyActive,q(100.25,T+1000),T+1000,[]).state,'ACTIVE',
 'profit not yet covering the quick target remains open');
const buyClosed=advancePaperTrade(buyActive,q(100.45,T+2000),T+2000,[]);
assert.equal(buyClosed.state,'QUICK_TP');
assert.equal(buyClosed.exit,100.45,'credit only actual observed quote');
assert.ok(buyClosed.netR>0&&buyClosed.netR<.40,'small gain net of transaction cost');
const sellClosed=advancePaperTrade(active(sell,s),q(99.55,T+2000),T+2000,[]);
assert.equal(sellClosed.state,'QUICK_TP');
assert.ok(sellClosed.netR>0,'SELL quick take must also account for cost');
assert.equal(advancePaperTrade(buyActive,q(99,T+2000),T+2000,[]).state,'STOP',
 'stop cannot be replaced with a fabricated quick profit');
assert.equal(advancePaperTrade(buyActive,q(100.5,T+16000),T+16000,[]).state,'UNKNOWN',
 'quote gaps cannot certify a quick gain');
assert.equal(advancePaperTrade(buyActive,q(100.5,T+2000,'another-price-provider'),T+2000,[]).state,'UNKNOWN',
 'switching feed cannot certify a quick gain');
const nearExpiry={...buyActive,lastAt:T+117000,lastPrice:100.16};
const timeExit=advancePaperTrade(nearExpiry,q(100.16,T+120000),T+120000,[]);
assert.equal(timeExit.state,'TIME_EXIT','M5 paper position cannot remain five minutes');
assert.equal(timeExit.closedAt,T+120000);
const missingExit=advancePaperTrade({...buyActive,lastAt:T+111000,lastPrice:100.5},
 q(100.5,T+122000),T+122000,[]);
assert.equal(missingExit.state,'UNKNOWN','no old quote is treated as an exit');
const both={time:T+60000,open:100,high:103.5,low:98.5,close:101};
const ambiguous=advancePaperTrade({...buyActive,lastAt:T+51000,lastPrice:100},
 q(100.4,T+121000),T+121000,[both]);
assert.equal(ambiguous.state,'STOP','same-bar full target and stop must settle as stop');
const proof=evaluatePaperProof([buyClosed,sellClosed,timeExit],0);
assert.equal(proof.samples,3);
assert.equal(proof.wins,3,'positive time exits count only from a documented quote');
assert.equal(proof.status,'COLLECTING','a couple of quick gains cannot validate strategy');
const breakdown=summarizePaperBySetup([buyClosed,sellClosed,timeExit])[0];
assert.equal(breakdown.quickTargets,2);
assert.equal(breakdown.targets,2);
assert.equal(breakdown.timeExits,1);
const paper=fs.readFileSync('lib/scalp-paper-ledger.ts','utf8');
assert.match(paper,/quickProof:evaluatePaperProof\(lane.history.filter/,
 'new quick-path ledger results must have a separate forward proof cohort');
const scalp=fs.readFileSync('components/ScalpDesk.tsx','utf8');
assert.match(scalp,/هدف ربح صغير سريع/);
assert.match(scalp,/مدة متبقية|المدة المتبقية/);
console.log('PASS: GOLD quick take profit in both directions, fees, fast expiry, loss priority, gaps, separate proof, no broker execution');
