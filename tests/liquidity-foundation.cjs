const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/liquidity-foundation.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:m,exports:m.exports,require,console});
const {assessLiquidityFoundation:check}=m.exports;
const now=Date.parse('2026-10-12T12:00:00Z');
const ev=(kind,mins)=>({kind,at:now-mins*60000-300000,confirmedAt:now-mins*60000,level:99});
const context={ready:true,side:'SELL',volumeBasis:'TICK',
  events:[ev('SWEEP_HIGH',15),ev('BOS_DOWN',10)]};
let r=check({context,now,side:'BUY'});
assert.equal(r.opposing,true,'paired confirmed adverse liquidity events block fresh entry');
assert.match(r.volumeLabel,/Tick volume/);
assert.match(r.reason,/ضد الاتجاه/);
assert.equal(check({context,now,side:'SELL'}).opposing,false,'aligned events never veto');
assert.equal(check({context:{...context,side:'WAIT'},now,side:'BUY'}).opposing,false,'neutral HTF cannot claim confirmed opposition');
assert.equal(check({context:{...context,events:[ev('SWEEP_HIGH',15)]},now,side:'BUY'}).opposing,false,'single rejection is observation only');
assert.equal(check({context:{...context,events:[ev('SWEEP_HIGH',70),ev('BOS_DOWN',10)]},now,side:'BUY'}).opposing,false,'stale sweep is ignored');
assert.equal(check({context:{...context,events:[ev('SWEEP_HIGH',15),ev('BOS_DOWN',-1)]},now,side:'BUY'}).opposing,false,'future confirmation excluded');
assert.equal(check({context:{...context,events:[ev('SWEEP_HIGH',15),ev('BOS_DOWN',10)],volumeBasis:'NONE'},now,side:'BUY'}).opposing,true,'lack of volume does not create fabricated fills');
assert.equal(check({context:null,now,side:'BUY'}).ready,false,'unavailable liquidity evidence stays explicitly unknown');
assert.equal(check({context:{...context,events:[ev('SWEEP_LOW',15),ev('BOS_UP',10)]},now,side:'BUY'}).opposing,false);
// Deterministic, network-free BTC integrity regression. Do not interpret
// quote-size withdrawal as proof of manipulation or a guaranteed reversal.
const li={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/liquidity-intelligence.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:li,exports:li.exports,require,console});
const integrity=li.exports.assessBtcLiquidityIntegrity;
const t=Date.parse('2026-10-16T14:00:00Z');
const typical={
  krakenReady:true,okxReady:true,krakenImbalance:12,okxImbalance:9,
  coinbaseTrades:50,okxTrades:45,coinbaseDelta:12,okxDelta:15,
  now:t,bid:100,ask:100.1,bidDepthUsd:350000,askDepthUsd:360000,
  previous:null
};
const good=integrity(typical);
assert.equal(good.status,'NORMAL');
assert.equal(good.blockedSides.length,0);
const crossedDepth=integrity({...typical,krakenImbalance:44,okxImbalance:-46});
assert.equal(crossedDepth.status,'VENUE_CONFLICT');
assert.equal(crossedDepth.blockedSides.includes('BUY'),true);
assert.equal(crossedDepth.blockedSides.includes('SELL'),true);
const crossedTrades=integrity({...typical,coinbaseDelta:60,okxDelta:-62});
assert.equal(crossedTrades.status,'VENUE_CONFLICT');
const prior={at:t-2500,bidDepthUsd:800000,askDepthUsd:850000,bestBid:100,bestAsk:100.1,pressure:0};
const buyLost=integrity({...typical,previous:prior,bidDepthUsd:270000,askDepthUsd:800000});
assert.equal(buyLost.status,'POSSIBLE_DEPTH_WITHDRAWAL');
assert.equal(buyLost.blockedSides.includes('BUY'),true);
assert.equal(buyLost.blockedSides.includes('SELL'),false);
const sellLost=integrity({...typical,previous:prior,askDepthUsd:270000,bidDepthUsd:750000});
assert.equal(sellLost.blockedSides.includes('SELL'),true);
assert.equal(sellLost.blockedSides.includes('BUY'),false);
assert.equal(integrity({...typical,previous:prior,bid:101,bidDepthUsd:100000}).blockedSides.length,0,
  'moving top-of-book must not masquerade as a withdrawn wall');
assert.equal(integrity({...typical,previous:{...prior,at:t-25000},bidDepthUsd:100000}).blockedSides.length,0,
  'old depth is never compared with a new snapshot');
assert.equal(integrity({...typical,krakenReady:false,previous:prior,bidDepthUsd:0}).blockedSides.length,0,
  'failed Kraken feed is not evidence that buy orders disappeared');
const desk=fs.readFileSync('lib/scalp-desk.ts','utf8');
assert.match(desk,/integrity\?\.blockedSides\?\.includes\(plan\.side\)/,
  'BTC paper entry must respect suspected depth loss and cross-venue conflict');
console.log('PASS: cross-venue liquidity disagreements, conservative depth withdrawals, stale/missing venue, paper entry veto');

console.log('PASS: causal closed-bar liquidity opposition, no future/stale events, volume provenance and neutral observation');
