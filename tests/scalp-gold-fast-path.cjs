const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const file=fs.readFileSync('lib/scalp-desk.ts','utf8');
const route=fs.readFileSync('app/api/scalp/route.ts','utf8');
const page=fs.readFileSync('app/scalp/page.tsx','utf8');
assert.match(route,/getScalpDesk\(asset\)/,'API must pass selected GOLD mode');
assert.match(page,/requestedAsset==='GOLD'\?'GOLD':'ALL'/,
 'standalone GOLD tab must request its independent pipeline');
assert.match(page,/useState<'ALL'\|'GOLD'\|'BTC'>\('GOLD'\)/,
 'GOLD should open first for the user's rapid scalp workflow');

let btcMarketCalls=0,btcBookCalls=0,goldMarketCalls=0;
const failIfUnknown=name=>{throw Error('unexpected real dependency '+name)};
const fakePlan=(asset,h)=>({
 asset,horizon:h,id:asset+'-fixture-'+h,status:'BLOCKED',side:'WAIT',
 setup:'NONE',score:0,cost:1,blockers:['test fixture does not authorize entry'],
 reason:'test fixture',targets:[],entry:null,stop:null,netRR:null,
 expiresAt:Date.now()+60000,strategyReview:[]
});
const fakeSnapshot=()=>({
 market:{c1:[],c5:[],events:[],newsReady:true,checkedAt:Date.now(),source:'TEST'},
 quote:{price:4000,sourceTime:Date.now(),source:'TEST',bid:3999.9,ask:4000.1}
});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const stubs={
 './market-hub':{getMarketSnapshot:async()=>{goldMarketCalls++;return fakeSnapshot()}},
 './btc-market':{
  getBtcMarket:async()=>{btcMarketCalls++;await delay(240);return null},
  peekFreshBtcMarket:()=>null,mergeBtcCandles:()=>failIfUnknown('BTC candles')},
 './scalp-opportunities':{buildScalpPlans:({asset})=>[fakePlan(asset,1),fakePlan(asset,5)]},
 './scalp-paper-ledger':{
  getScalpPaperQualityGate:()=>({blocked:false}),
  updateScalpLedger:(_asset,plans)=>({persisted:false,lanes:plans.map(p=>({
   horizon:p.horizon,current:null,recent:[],stats:{samples:0,wins:0,netR:0,unknown:0}}))})},
 './runtime':{getRuntimeEnv:()=>({})},
 './server-tick-brain':{getCoinbaseServerQuote:()=>null,getCoinbaseClosedCandles:()=>[]},
 './scalp-liquidity':{readScalpLiquidity:()=>({available:false,pressure:'WAIT',scenarios:[]}),
  observeScalpPlanHold:()=>null},
 './liquidity-intelligence':{getBtcLiquidity:async()=>{btcBookCalls++;await delay(240);return null}},
 './scalp-entry-audit':{auditScalpEntry:()=>({approved:false,code:'NO_SETUP',reason:'test'})},
 './direction-walkforward':{validateDirectionChronologically:()=>({status:'SHADOW'})},
 './sniper-decision-engine':{buildSniperDecision:()=>({
  horizon:1,status:'BLOCKED',score:0,blockers:['not qualified'],aiCertification:'NO'})},
 './scalp-lead-audit':{observeScalpLead:()=>({pending:0,total:0}),
  MIN_SCALP_SHADOW_SCORE:55}
};
const output={},context={exports:output,
 require:name=>{
  if(!(name in stubs))throw Error('unexpected dependency '+name);
  return stubs[name];
 },
 console:{info:()=>{},warn:()=>{}},
 Date,Math,Number,Set,Map,Promise,process:{env:{}},setTimeout,clearTimeout};
vm.runInNewContext(ts.transpileModule(file,{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true
}}).outputText,context);
(async()=>{
 const t=Date.now();
 const fast=await output.getScalpDesk('GOLD');
 const goldMs=Date.now()-t;
 assert.equal(fast.ok,true);
 assert.equal(fast.bitcoin,null,'GOLD-only response never computes BTC');
 assert.equal(fast.gold.asset,'GOLD');
 assert.equal(btcMarketCalls,0,'GOLD request must not start BTC exchange fetch');
 assert.equal(btcBookCalls,0,'GOLD request must not start BTC book fetch');
 assert.ok(goldMs<200,'GOLD-only response cannot wait for 240ms BTC delay');
 const combined=await output.getScalpDesk();
 assert.equal(combined.bitcoin.asset,'BTC','full desktop remains backward compatible');
 assert.equal(btcMarketCalls,1);
 assert.equal(btcBookCalls,1);
 const cached=await output.getScalpDesk('GOLD');
 assert.equal(cached.gold.asset,'GOLD');
 assert.ok(goldMarketCalls>=1);
 assert.equal(btcMarketCalls,1,'returning to GOLD must not re-fetch BTC');
 console.log('PASS: GOLD scalp independent latency lane avoids slow BTC fetch; ALL/BTC desk preserved');
})().catch(e=>{console.error(e);process.exitCode=1});
