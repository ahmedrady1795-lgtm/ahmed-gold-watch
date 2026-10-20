const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(
 fs.readFileSync('lib/institutional-preparation-radar.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:mod,exports:mod.exports});
const {btcPreparation,goldPreparation}=mod.exports;
const micro={ready:true,status:'OBSERVING',snapshots:8,spanSeconds:10,
 bidPersistent:true,askPersistent:false,possibleBidPull:false,
 possibleAskPull:false,possibleBidAbsorption:true,
 possibleAskAbsorption:false,buyQueuePressure:true,
 sellQueuePressure:false};
const btc=btcPreparation({fresh:true,micro,replenishments:3,side:'BUY'});
assert.equal(btc.available,true);
assert.equal(btc.side,'BUY');
assert.equal(btc.phase,'BUY_PREP');
assert.equal(btc.icebergCandidate,true,
 'strong same-venue execution/absorption plus refill is a candidate, not proof');
assert.equal(btc.gcConnected,false,'never fabricate a COMEX futures feed');
assert.equal(btc.actionable,false,'read-only pre-move research never authorizes trades');
assert.equal(btcPreparation({fresh:false,micro,replenishments:3,side:'BUY'}).available,false,
 'stale Coinbase WebSocket quarantines early cues');
assert.equal(btcPreparation({fresh:true,micro:{...micro,ready:false},
 replenishments:3,side:'BUY'}).available,false);
assert.equal(btcPreparation({fresh:true,micro:{...micro,possibleBidAbsorption:false},
 replenishments:3,side:'BUY'}).icebergCandidate,false,
 'replenishment counts without executed absorption do not imply hidden orders');
assert.equal(btcPreparation({fresh:true,micro:{...micro,possibleBidAbsorption:false,
 buyQueuePressure:false,possibleAskPull:true},replenishments:0,
 side:'WAIT'}).phase,'BUY_PREP','real asks vanishing imply only potential upside vacuum');
assert.equal(btcPreparation({fresh:true,micro:{...micro,possibleAskPull:true,
 possibleBidPull:true},replenishments:0,side:'WAIT'}).phase,'MIXED',
 'contradictory withdrawal cannot be treated as certain directional pressure');
assert.equal(btcPreparation({fresh:true,micro:{...micro,possibleAskPull:false,
 possibleBidAbsorption:false,buyQueuePressure:false},
 replenishments:0,side:'WAIT'}).phase,'OBSERVING');
const dom={available:true,status:'OBSERVING',source:'MT5_BROKER_DOM',
 samples:3,spanMs:9000,imbalancePct:34,bidPersistent:true,
 askPersistent:true,bidWall:4121.11,askWall:4122.55,
 possibleBidWithdrawal:false,possibleAskWithdrawal:false};
const gold=goldPreparation({fresh:true,dom});
assert.equal(gold.phase,'BUY_PREP','broker bid dominance can be observed');
assert.equal(gold.icebergCandidate,false,'MT5 DOM has no consolidated prints');
assert.equal(gold.gcConnected,false,'spot broker book is not a GC feed');
assert.equal(goldPreparation({fresh:true,dom:{...dom,imbalancePct:0}}).phase,
 'OBSERVING','balanced normal two-sided displayed walls have no direction');
assert.equal(goldPreparation({fresh:true,dom:{...dom,imbalancePct:0,
 possibleBidWithdrawal:true}}).phase,'SELL_PREP');
assert.equal(goldPreparation({fresh:false,dom}).available,false);
assert.equal(goldPreparation({fresh:true,dom:{...dom,available:false}}).available,false);
assert.equal(goldPreparation({fresh:true,dom:{...dom,source:'NONE'}}).available,false);
const chart=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const btcUI=fs.readFileSync('components/OrderFlowRadar.tsx','utf8');
const goldUI=fs.readFileSync('components/GoldRadarBadge.tsx','utf8');
const css=fs.readFileSync('app/gold-sniper-radar.css','utf8');
assert.match(chart,/className="sniper-m15-preparation-slot"/);
assert.ok(chart.indexOf('className="sniper-m15-preparation-slot"')<
 chart.indexOf('className="sniper-m15-chart-box"'),
 'BTC reading must stay above, not obscuring, candlesticks');
assert.match(btcUI,/btcPreparation\(/);
assert.match(goldUI,/goldPreparation\(/);
assert.match(btcUI,/Iceberg/);
assert.match(goldUI,/مقارنة GC مع XAUUSD: غير مفعّلة/,
 'gold futures comparison clearly states that GC venue data is not connected');
assert.match(css,/\.sniper-m15-preparation-slot \.sniper-flow-radar-chip/);
console.log('PASS: BTC exchange absorption/refill/withdrawal, GOLD broker DOM asymmetry, no fake GC feed, no spoofing claims, clean chart');
