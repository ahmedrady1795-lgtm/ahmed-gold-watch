const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('vm');
const ex={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/execution-readiness.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{exports:ex});
const now=1792000000000;
const source={
  now,enabled:true,killEnabled:false,tokenConfigured:true,
  ack:ex.LIVE_ACK,expectedLogin:'12345678',expectedSymbol:'XAUUSDm',
  mt5:{connected:true,fresh:true,candlesFresh:true,status:{symbol:'XAUUSDm',
    mode:'live',bid:4000,ask:4000.2,account:{login:12345678,balance:5000,equity:5000}}},
  quote:{ok:true,status:'live',source:'Exness/MT5 · XAUUSDm',
    brokerSymbol:'XAUUSDm',bid:4000,ask:4000.2,spread:.2,sourceTime:now-1100},
  market:{priceSource:'Exness/MT5 · XAUUSDm',newsReady:true,events:[]},
  analysis:{state:'setup',signal:{sideCode:'buy'},regime:{key:'trend'}},
  aiSnapshot:{checkedAt:now-2000,gold:{coreSummary:{qualityReady:true},
    executionQuality:{action:'BUY',quality:'A',confidence:84,dataQuality:92,uncertainty:20,vetoes:[]}}},
  maxSpread:.55
};
const check=x=>ex.assessExecutionReadiness({...source,...x});
assert.equal(check({}).allowed,true,'fully qualified case should pass a dry decision');
for(const [change,reason] of [
  [{enabled:false},'server_live_disabled'],
  [{killEnabled:true},'kill_switch_on'],
  [{ack:''},'explicit_live_ack_missing'],
  [{expectedLogin:'99999999'},'account_identity_unverified'],
  [{mt5:{...source.mt5,fresh:false}},'broker_candles_or_heartbeat_stale'],
  [{quote:{...source.quote,sourceTime:now-10000}},'broker_quote_unverified'],
  [{market:{...source.market,newsReady:false}},'economic_calendar_unavailable'],
  [{market:{...source.market,events:[{importance:3,time:now+80000}]}},'major_news_blackout'],
  [{aiSnapshot:{...source.aiSnapshot,checkedAt:now-150000}},'predator_core_not_qualified_or_stale'],
  [{aiSnapshot:{...source.aiSnapshot,gold:{...source.aiSnapshot.gold,coreSummary:{qualityReady:false}}}},'predator_core_not_qualified_or_stale'],
  [{aiSnapshot:{...source.aiSnapshot,gold:{...source.aiSnapshot.gold,executionQuality:{...source.aiSnapshot.gold.executionQuality,action:'SELL'}}}},'predator_core_not_qualified_or_stale']
]){
  assert.equal(check(change).allowed,false,reason);
  assert.ok(check(change).blockedBy.includes(reason),reason);
}
assert.match(fs.readFileSync('app/api/execution/signal/route.ts','utf8'),/getAiSnapshot/,'live route must use actual Predator snapshot');
assert.match(fs.readFileSync('app/api/execution/signal/route.ts','utf8'),/signal:allowed\?a\.signal:null/,'live route must withhold blocked trade');
assert.match(fs.readFileSync('app/api/execution/signal/route.ts','utf8'),/Math\.abs\(tp-entry\)\/Math\.abs\(entry-sl\)>=2/,'minimum RR 2.0 enforced');
console.log('PASS: two-key live authority, pinned broker account, source freshness, news, Predator and RR gates');
