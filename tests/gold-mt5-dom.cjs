const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path){
 const m={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
 }).outputText,{module:m,exports:m.exports});
 return m.exports;
}
const {normalizeMt5GoldDom,analyzeMt5GoldDom}=load('lib/gold-mt5-dom.ts');
const {updateGoldMarketLead}=load('lib/market-lead-ai.ts');
const now=Date.parse('2026-10-20T08:00:00Z');
const symbol='XAUUSDm';
const base={available:true,symbol,capturedAt:now,
 bids:[{price:4199.9,volume:10},{price:4199.8,volume:8}],
 asks:[{price:4200.1,volume:8},{price:4200.2,volume:7}]};
const p={now,symbol,tickTimeMs:now-500,bid:4199.9,ask:4200.1};
const sample=normalizeMt5GoldDom(base,p);
assert.equal(sample.reason,'OK');assert.ok(sample.sample);
assert.equal(sample.sample.bidVolume,18);
assert.equal(sample.sample.askVolume,15);
assert.equal(normalizeMt5GoldDom({...base,available:false,reason:'market_book_add_failed'},p).sample,null);
assert.equal(normalizeMt5GoldDom({...base,asks:[]},p).sample,null);
assert.equal(normalizeMt5GoldDom({...base,symbol:'XAUUSDz'},p).sample,null);
assert.equal(normalizeMt5GoldDom({...base,capturedAt:now-18000},p).sample,null);
assert.equal(normalizeMt5GoldDom({...base,asks:[{price:4190,volume:1},{price:4189,volume:2}]},p).sample,null);
assert.equal(normalizeMt5GoldDom({...base,bids:[{price:4199.9,volume:2},{price:4199.9,volume:3}]},p).sample,null);
assert.equal(normalizeMt5GoldDom({...base,asks:[{price:4310,volume:2},{price:4311,volume:3}]},p).sample,null);
assert.equal(normalizeMt5GoldDom({...base,capturedAt:now+3000},p).sample,null);
const s=(at,buy=10,sell=8)=>normalizeMt5GoldDom({
 ...base,capturedAt:at,
 bids:[{price:4199.9,volume:buy},{price:4199.8,volume:buy*.8}],
 asks:[{price:4200.1,volume:sell},{price:4200.2,volume:sell*.875}]
 },{...p,now:at,tickTimeMs:at-100}).sample;
const history=[s(now-12000),s(now-6000),s(now)];
const ready=analyzeMt5GoldDom({now,symbol,snapshots:history});
assert.equal(ready.available,true,ready.reason);
assert.equal(ready.status,'OBSERVING');
assert.equal(ready.bidPersistent,true);
assert.equal(ready.askPersistent,true);
assert.equal(ready.source,'MT5_BROKER_DOM');
assert.equal(ready.actionable,false);
assert.equal(ready.executionAuthority,false);
const withdraw=analyzeMt5GoldDom({now,symbol,
 snapshots:[s(now-12000),s(now-6000,3,8),s(now,3,8)]});
assert.equal(withdraw.available,true);
assert.equal(withdraw.status,'POSSIBLE_WITHDRAWAL');
assert.equal(withdraw.possibleBidWithdrawal,true);
assert.equal(withdraw.possibleAskWithdrawal,false);
const insufficient=analyzeMt5GoldDom({now,symbol,snapshots:[s(now-6000),s(now)]});
assert.equal(insufficient.available,false);
assert.equal(insufficient.status,'WARMUP');
const stale=analyzeMt5GoldDom({now:now+12000,symbol,snapshots:history});
assert.equal(stale.available,false);
assert.equal(stale.status,'STALE');
const symbolSwitch=analyzeMt5GoldDom({now,symbol:'XAUUSDz',snapshots:history});
assert.equal(symbolSwitch.available,false);
assert.equal(symbolSwitch.status,'NO_BRIDGE');
const noFeed=analyzeMt5GoldDom({now,symbol,snapshots:[],
 unavailableReason:'market_book_add_failed'});
assert.equal(noFeed.available,false);
assert.equal(noFeed.status,'UNSUPPORTED');
const lead=updateGoldMarketLead({ok:true,domReady:false,side:'BUY',
 score:95,confidence:99,receivedAt:now,velocity15s:2.5,bookImbalance:99},now);
assert.equal(lead.available,false);
assert.equal(lead.armed,false);
assert.equal(lead.mode,'OFFLINE');
const bridge=fs.readFileSync('mt5_bridge/bridge.py','utf8');
const hub=fs.readFileSync('lib/market-hub.ts','utf8');
const market=fs.readFileSync('lib/market-lead-ai.ts','utf8');
const chart=fs.readFileSync('components/GoldRadarBadge.tsx','utf8');
const api=fs.readFileSync('app/api/gold-radar/route.ts','utf8');
assert.match(bridge,/market_book_get\(SYMBOL\)/);
assert.match(bridge,/capturedAt/);
assert.match(bridge,/len\(bids\)>=2 and len\(asks\)>=2/);
assert.match(hub,/normalizeMt5GoldDom\(ob,/);
assert.match(hub,/mt5DomSamples=\[\]/);
assert.match(hub,/getMt5GoldDomReading/);
assert.match(market,/fast\.domReady!==true/);
assert.match(chart,/brokerDom/);
assert.match(api,/getMt5GoldDomReading\(now\)/);
assert.doesNotMatch(chart,/CME GC order book live/);
console.log('PASS: trustworthy broker XAUUSD two-sided DOM, genuine timestamps, persistence, possible withdrawal and absence of fabricated market-maker evidence');
