const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');

let now=Date.parse('2026-11-07T00:00:00Z');
let snapshot={payload:{ok:true,checkedAt:now-10000,
  autopilot:{aiReadiness:{mode:'PARTIAL',readyCount:1,configuredCount:3,
    activeFailures:['neural not certified']}}},at:now-10000,
  ageMs:10000,generation:42};
let audit={ok:true,updatedAt:now-15000,persistence:'NOT_DURABLE',
  current:{GOLD:{status:'ACTIVE'},BTC:null},
  watch:{GOLD:{updatedAt:now-10000},BTC:{updatedAt:now-190000}},
  block:{GOLD:'qualified setup pending',BTC:'data not fresh'}};
class Clock extends Date{static now(){return now;}}
const ex={};
const source=fs.readFileSync('app/api/sniper-health/route.ts','utf8');
const code=ts.transpileModule(source,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS
}}).outputText;
const context=vm.createContext({Date:Clock,Response,console,
 process:{env:{RENDER:'true',ML_ENGINE_URL:'https://ml.invalid',NEURAL_ENGINE_URL:'https://neural.invalid'}}});
const factory=vm.runInContext('(function(exports,require){'+code+'\n})',context);
factory(ex,name=>{
  if(name.endsWith('/ai-snapshot-cache'))
    return {getAiSnapshot:()=>snapshot};
  if(name.endsWith('/sniper-audit-store'))
    return {getSniperAudit:()=>audit};
  if(name.endsWith('/ai-service-backoff'))
    return {aiRateLimitState:(url)=>({
      configured:Boolean(url),limited:Boolean(url&&url.includes('ml.invalid')),
      retryInSeconds:url&&url.includes('ml.invalid')?180:0,consecutive429:url?2:0})};
  if(name.endsWith('/scalp-every-candle'))
    return {readEveryM1Evidence:(asset)=>({
      asset,issued:asset==='BTC'?8:0,
      paired:{status:'COLLECTING',n:0,modelHits:0,baselineHits:0},
      netR:0,resolved:0,storage:'EPHEMERAL',durable:false,
      verifiedBrokerTrades:0})};
  throw Error('Unexpected import '+name);
});

(async()=>{
  const fresh=await (await ex.GET()).json();
  assert.equal(fresh.ok,true);
  assert.equal(fresh.operational,true,'fresh snapshot and ledger can operate on temporary storage');
  assert.equal(fresh.ai.mode,'PARTIAL');
  assert.equal(fresh.ai.readyCount,1);
  assert.equal(fresh.ai.modelsReady,false,'up service must not equal certified model readiness');
  assert.equal(fresh.ai.throttles.ml.limited,true);
  assert.equal(fresh.ai.throttles.ml.retryInSeconds,180);
  assert.equal(fresh.ai.throttles.neural.limited,false);
  assert.equal(fresh.paperM1.bitcoin.asset,'BTC');
  assert.equal(fresh.paperM1.bitcoin.issued,8);
  assert.equal(fresh.paperM1.gold.asset,'GOLD');
  assert.equal(fresh.paperM1.bitcoin.verifiedBrokerTrades,0);
  assert.equal(fresh.paperM1.bitcoin.durable,false);
  assert.equal(fresh.audit.durable,false,
    'a temporary Render Free ledger must never be described as persistent');
  assert.equal(fresh.gold.scenario,'ACTIVE');
  assert.equal(fresh.gold.watchFresh,true);
  assert.equal(fresh.bitcoin.watchFresh,false);
  assert.match(fresh.bitcoin.waitReason,/not fresh/);

  snapshot={...snapshot,payload:{...snapshot.payload,checkedAt:now-120000}};
  const stale=await (await ex.GET()).json();
  assert.equal(stale.operational,false,'old forecasts cannot claim a healthy sniper');
  assert.equal(stale.snapshot.fresh,false);
  assert.equal(stale.ai.mode,'STALE');
  assert.equal(stale.ai.readyCount,0);

  snapshot={...snapshot,payload:{...snapshot.payload,checkedAt:now-1000}};
  audit={...audit,updatedAt:now-200000};
  const deadLedger=await (await ex.GET()).json();
  assert.equal(deadLedger.operational,false,'stale audit must not be hidden by fresh AI');
  assert.equal(deadLedger.audit.fresh,false);
  assert.equal(deadLedger.audit.durable,false);
  console.log('PASS: Render sniper health reports model freshness, AI readiness, temporary storage and wait reasons without granting trades');
})().catch(error=>{console.error(error);process.exitCode=1;});
