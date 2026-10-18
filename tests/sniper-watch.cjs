const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),vm=require('node:vm');
function loader(fakeFs){
  const cache=new Map();
  function load(file){
    file=path.resolve(file);
    if(cache.has(file))return cache.get(file);
    const mod={exports:{}};cache.set(file,mod.exports);
    const resolve=p=>p==='node:fs'&&fakeFs?fakeFs:p.startsWith('.')?load(path.resolve(path.dirname(file),p+'.ts')):require(p);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{
      compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}
    }).outputText,{module:mod,exports:mod.exports,require:resolve,console:{info(){},warn(){}},process},{filename:file});
    return mod.exports;
  }
  return load;
}
const load=loader(),{emptyWatch,advanceWatch}=load('lib/sniper-watch.ts');
const {startScenario,advanceScenario,scorecard}=load('lib/sniper-scorecard.ts');
const {presentServerBias}=load('lib/sniper-stability.ts');
const {scenarioAsJournal}=load('lib/sniper-audit-view.ts');
const at=Date.parse('2026-10-11T12:00:00Z');
const raw=(side='BUY',time=at)=>({side,status:'LIVE',label:'test',reason:'test',agreement:3,
  opposition:false,rangeBound:false,active:true,votes:{m5:side,m15:side,h1:side,h4:'WAIT'},
  lastClosedAt:time,m15ClosedAt:time,invalidation:side==='BUY'?90:110,
  targets:[{stage:1,price:side==='BUY'?102:98,low:side==='BUY'?102:98,high:side==='BUY'?102:98,
    quality:75,kind:'STRUCTURAL',source:'H1',distanceAtr:3}]});
const bar=(minute,low=99,high=101)=>({time:at+minute*60000,open:100,close:100,low,high});
let w=advanceWatch(emptyWatch(),raw(),'BTC',100,[],at,at);
assert.equal(w.records.length,1,'watch records can exist independently of entry eligibility');
assert.equal(w.records[0].expiresAt,at+8*3600000,'far paths receive the stated 8h observation window');
assert.equal(w.records[0].purpose,'OBSERVATION');
assert.equal(scenarioAsJournal(w.records[0]),null,'watch records can never become an entry journal');
assert.equal(startScenario({asset:'BTC',side:'BUY',at,modelAt:at,price:100,stop:90,
  confidence:0,targets:raw().targets}),null,'entry RR gate must stay intact');
const original=JSON.parse(JSON.stringify(w));
const drift={...raw(),targets:[{...raw().targets[0],price:107,low:107,high:107}]};
w=advanceWatch(w,drift,'BTC',100,[bar(0)],at+60000,at+60000);
assert.equal(w.state.targets[0].price,102,'new provider levels cannot replace the original path');
assert.equal(w.records[0].targets[0].price,102);
assert.strictEqual(advanceWatch(w,raw('SELL'),'BTC',100,[],at+120000,at),w,'late response cannot revert memory');
const spike=advanceWatch(w,raw(),'BTC',100,[bar(0),bar(1,99,103)],at+120000,at+120000);
assert.equal(spike.records[0].status,'COMPLETED');
assert.equal(spike.state.targets.length,0,'candle wick reaches are consumed even if quote has retraced');
const restored=JSON.parse(JSON.stringify(spike));
const afterReload=advanceWatch(restored,raw(),'BTC',100,[bar(2)],at+180000,at+180000);
assert.equal(afterReload.state.targets.length,0,'restart must not resurrect reached prices');
assert.equal(afterReload.records.length,1,'no same-bar duplicate after restart');
const stopped=advanceWatch(original,raw(),'BTC',89,[bar(0,88,101)],at+60000,at+60000);
assert.equal(stopped.state,null);assert.equal(stopped.records[0].status,'STOPPED');
const blocked=advanceWatch(stopped,raw(),'BTC',100,[bar(1)],at+16*60000,at+16*60000);
assert.equal(blocked.records.length,1,'broken bias cannot rearm from an old M15 close');
assert.equal(blocked.state,null,'broken direction stays retired until a new independent M15 close');
assert.equal(blocked.bias.targets.length,0);
const paused=advanceWatch(original,{...raw(),active:false,status:'PAUSED'},'BTC',100,[],at+60000,at+60000);
assert.equal(paused.bias.active,false);assert.equal(paused.bias.targets.length,0);
assert.equal(paused.state.side,'BUY','closed-market pause retains history only');
assert.equal(presentServerBias(original.bias,raw('SELL'),100).side,'BUY','browser opposition cannot flip server direction');
assert.equal(presentServerBias(original.bias,raw(),89).side,'WAIT','browser price breach immediately hides path');
assert.equal(presentServerBias(original.bias,{...raw(),active:false},100).targets.length,0);
let reversal=advanceWatch(original,raw('SELL',at+15*60000),'BTC',100,
  Array.from({length:15},(_,i)=>bar(i)),at+15*60000,at+15*60000);
assert.equal(reversal.state.side,'BUY');
reversal=advanceWatch(reversal,raw('SELL',at+30*60000),'BTC',100,
  Array.from({length:30},(_,i)=>bar(i)),at+30*60000,at+30*60000);
assert.equal(reversal.state.side,'SELL');assert.equal(reversal.records[0].status,'REVERSED');
assert.equal(scorecard(reversal.records,'BTC').reversed,1);
const ambiguous=advanceWatch(original,raw(),'BTC',100,[bar(0,89,103)],at+60000,at+60000);
assert.equal(ambiguous.records[0].status,'AMBIGUOUS');
assert.equal(scorecard(ambiguous.records,'BTC').observed,0);
const gap=advanceWatch(original,raw(),'BTC',100,[bar(5)],at+6*60000,at+6*60000);
assert.equal(gap.records[0].status,'UNOBSERVED');
const expiry=advanceScenario(original.records[0],Array.from({length:480},(_,i)=>bar(i)),at+8*3600000);
assert.equal(expiry.status,'EXPIRED','full 8h coverage settles correctly');
const missing=advanceScenario(original.records[0],[],at+8*3600000);
assert.equal(missing.status,'UNOBSERVED');

// Exercise the production store across independent module/process instances.
const files=new Map();
let failWrite=false;
const fakeFs={existsSync:p=>p==='/data',readFileSync:p=>{
  if(!files.has(p))throw Error('ENOENT');return files.get(p);
},writeFileSync:(p,s)=>{if(failWrite)throw Error('IO failure');files.set(p,s);},
  renameSync:(a,b)=>{files.set(b,files.get(a));files.delete(a);}};
const {frames}=require('./long-range-fixture.cjs');
const history=frames(at);
for(const key of ['m5','m15','h1']){
  const rows=history[key];
  for(let i=rows.length-24;i<rows.length;i++){
    const v=99.4+(i-(rows.length-24))*.055;
    Object.assign(rows[i],{open:v-.04,close:v+.04,low:Math.min(rows[i].low,v-.27),high:Math.max(rows[i].high,v+.28)});
  }
}
const price=history.h1.at(-1).close;
const x={livePulse:{price,sourceTime:at},chartHigherFrames:history,
  chartCandles:Array.from({length:240},(_,i)=>({time:at-(240-i)*60000,open:price,close:price,low:price-.1,high:price+.1})),
  forwardMove:{side:'WAIT'}};
const legacy={version:1,updatedAt:at-60000,scenarios:[expiry]};
files.set('/data/predator-sniper-audit-v1.json',JSON.stringify(legacy));
const cachedReader=loader(fakeFs)('lib/sniper-audit-store.ts');
cachedReader.getSniperAudit(at-1000); // another route warms its own cache first
let store=loader(fakeFs)('lib/sniper-audit-store.ts');
let audit=store.updateSniperAudit({ok:true,checkedAt:at,gold:x,bitcoin:x},at);
assert.equal(audit.persistence,'VOLUME');assert.equal(audit.metrics.BTC.observed,1,'legacy qualified history survives migration');
assert.equal(audit.watch.BTC.state.side,'BUY');
assert.ok(audit.block.BTC.length>0&&audit.blockAt.BTC===at,'the actual entry-block reason gets timestamped');
assert.equal(audit.watch.BTC.current.purpose,'OBSERVATION');
const snapshot=JSON.stringify(audit.watch.BTC);
const blockReason=audit.block.BTC;
assert.equal(JSON.stringify(cachedReader.getSniperAudit(at).watch.BTC),snapshot,'already-warmed route reloads later worker writes');
store=loader(fakeFs)('lib/sniper-audit-store.ts');
audit=store.getSniperAudit(at+1000);
assert.equal(JSON.stringify(audit.watch.BTC),snapshot,'independent process restores full direction and target ledger');
assert.equal(audit.persistence,'VOLUME');
assert.equal(audit.block.BTC,blockReason,'the reason survives a fresh server instance');
const asleep=store.getSniperAudit(at+3*60000);
assert.equal(asleep.watch.BTC.state.side,'BUY','historical direction remains in memory');
assert.equal(asleep.watch.BTC.bias.active,false,'server sleep cannot leave LIVE sniper bias visible');
assert.equal(asleep.watch.BTC.bias.targets.length,0,'stale watch must hide all active targets');
assert.equal(asleep.watch.BTC.stale,true,'UI receives explicit staleness indicator');
failWrite=true;
audit=store.updateSniperAudit({ok:true,checkedAt:at+1000,gold:x,bitcoin:x},at+1000);
assert.equal(audit.persistence,'NOT_DURABLE','failed writes cannot claim durable server memory');
console.log('PASS: server restart, legacy migration, frozen levels, wick hits, rearm, reversal, 8h expiry, gaps and entry separation');

const ephemeralReader=loader()('lib/sniper-audit-view.ts').watchForChart;
const transient={...audit,persistence:'NOT_DURABLE',updatedAt:at,watch:{BTC:{...audit.watch.BTC,updatedAt:at,modelAt:at,stale:false,bias:{...audit.watch.BTC.bias,active:true}}}};
const presented=ephemeralReader(transient,'BTC',at+1000,true);
assert.equal(presented.fresh,true,'temporary storage does not disable fresh authoritative observation');
assert.equal(presented.durable,false,'temporary storage still cannot claim durable entry evidence');
assert.equal(ephemeralReader(transient,'BTC',at+91000,true).bias.active,false,'stale server memory must pause');
assert.equal(ephemeralReader({...transient,updatedAt:at+10000},'BTC',at,true).fresh,false,'future audit timestamps rejected');
console.log('PASS: cross-route synchronization, temporary observation and stale/future guards');
const coldFiles=new Map();
const coldFs={existsSync:p=>p==='/data',readFileSync:p=>{if(!coldFiles.has(p))throw Error('ENOENT');return coldFiles.get(p);},
 writeFileSync:(p,s)=>coldFiles.set(p,s),renameSync:(a,b)=>{coldFiles.set(b,coldFiles.get(a));coldFiles.delete(a);}};
const coldStore=loader(coldFs)('lib/sniper-audit-store.ts');
const chartOnly={gold:{chartCandles:x.chartCandles,chartHigherFrames:x.chartHigherFrames,candleSource:'test'},
 bitcoin:{chartCandles:x.chartCandles,chartHigherFrames:x.chartHigherFrames,candleSource:'test'}};
let coldAudit=coldStore.updateStructuralWatchFromChart(chartOnly,at);
assert.equal(coldAudit.watch.BTC.bias.side,'BUY');
assert.equal(coldAudit.watch.BTC.current.purpose,'OBSERVATION');
assert.equal(coldAudit.current.BTC,null,'chart requests never create qualified ENTRY records');
const frozen=JSON.stringify(coldAudit.watch.BTC.state);
coldAudit=coldStore.updateStructuralWatchFromChart(chartOnly,at+1000);
assert.equal(JSON.stringify(coldAudit.watch.BTC.state),frozen,'same completed M1 cannot reset target memory');
coldAudit=coldStore.updateStructuralWatchFromChart(chartOnly,at+91000);
assert.equal(coldAudit.watch.BTC.bias.active,false,'old candles cannot keep observation active');
console.log('PASS: inference-independent closed-candle watch remains observation-only and timestamp bounded');
// A restarted inference process must not strand older active entry records.
const recovering=[1,2].map(i=>({...startScenario({asset:'BTC',side:'BUY',at,
  modelAt:at,price:100,stop:99,confidence:70,targets:[{stage:1,price:102,
  low:102,high:102,quality:75,kind:'STRUCTURAL'}]}),id:'recover-'+i,recoveryPending:true}));
const savedAudit=JSON.parse(coldFiles.get('/data/predator-sniper-audit-v1.json'));
savedAudit.scenarios=recovering;
coldFiles.set('/data/predator-sniper-audit-v1.json',JSON.stringify(savedAudit));
const recoveringStore=loader(coldFs)('lib/sniper-audit-store.ts');
assert.equal(recoveringStore.getSniperAudit(at).current.BTC,null,'restored entry is not actionable before replay');
recoveringStore.updateStructuralWatchFromChart({bitcoin:null},at+3600000);
assert.equal(recoveringStore.getSniperAudit(at).metrics.BTC.unobserved,0,'provider failure does not prematurely discard pending replay');
const replay=recoveringStore.updateStructuralWatchFromChart({bitcoin:{chartCandles:[bar(0,99.5),bar(1,99.5,103)]}},at+600000);
assert.equal(replay.metrics.BTC.completed,2,'settle all saved entries from closed bars even when latest candle is stale');
assert.equal(replay.metrics.BTC.unobserved,0);
assert.equal(replay.watch.BTC.bias.active,false,'historical settlement cannot refresh a live bias');
console.log('PASS: restart pending state, missing provider, all-entry replay and stale-market separation');
assert.equal(ephemeralReader({...transient,updatedAt:at+700,watch:{BTC:{...transient.watch.BTC,updatedAt:at+700,modelAt:at+700}}},'BTC',at,true).fresh,true,'subsecond response publication must not flicker while the UI clock catches up');

const fromCoinbase=advanceWatch(emptyWatch(),raw(),'BTC',100,[],at,at,'Coinbase');
const changed=advanceWatch(fromCoinbase,raw('SELL'),'BTC',100,[],at+1000,at+1000,'Kraken');
assert.equal(changed.state,null,'venue switch retires directional memory');
assert.equal(changed.bias.side,'WAIT');assert.equal(changed.bias.active,false);
assert.equal(changed.records[0].status,'UNOBSERVED');
const sameClose=advanceWatch(changed,raw('SELL'),'BTC',100,[],at+2000,at+2000,'Kraken');
assert.equal(sameClose.state,null,'new source cannot rebuild direction from the same M15 close');
const newClose=advanceWatch(sameClose,raw('SELL',at+900000),'BTC',100,[],at+900000,at+900000,'Kraken');
assert.equal(newClose.state.side,'SELL','fresh source M15 can establish a new observation');
assert.equal(fromCoinbase.state.side,'BUY','source transition does not mutate previous snapshot');
console.log('PASS: source switch retires bias and waits for a new structural close');
