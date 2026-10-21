const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/spot-ignition.ts','utf8'),
{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:out});
const t=Date.parse('2026-10-21T20:00:00Z');
const coin=(extra={})=>({price:1,volume24h:8000000,change15m:1,change24h:2,
freshAt:t-30000,buyShare:.65,volumeImpulse:2.3,flowDelta5m:26000,trapRisk:false,
book:{bidShare:.63,spreadBps:8},outlook24h:{takerBuyShare12:.57},
candles:Array.from({length:5},()=>({buyQuote:10000})),...extra});
const prev=out.spotLiquiditySample(coin(),t);
assert.ok(prev);
assert.equal(out.spotIgnition(coin(),null,null,t).state,'BUILDING');
const next=coin({freshAt:t+90000,price:1.009});
const verified=out.spotIgnition(next,null,prev,t+120000);
assert.equal(verified.state,'FLOW_CONFIRMED');
assert.equal(verified.observations,2);
assert.equal(verified.buyQuote5m,50000);
assert.notEqual(out.spotIgnition(next,null,prev,t+50000).state,'FLOW_CONFIRMED');
assert.notEqual(out.spotIgnition(next,null,prev,t+700000).state,'FLOW_CONFIRMED');
assert.notEqual(out.spotIgnition(coin(),null,prev,t+120000).state,'FLOW_CONFIRMED');
assert.equal(out.spotIgnition(coin({freshAt:t+90000,book:{bidShare:.34,spreadBps:8}}),null,prev,t+120000).state,'FADING');
assert.equal(out.spotIgnition(next,{state:'SELL_PRESSURE'},prev,t+120000).state,'FADING');
assert.notEqual(out.spotIgnition(coin({freshAt:t+90000,price:1.07}),null,prev,t+120000).state,'FLOW_CONFIRMED');
assert.equal(out.spotIgnition(coin({book:null}),null,prev,t+120000).state,'NO_EVIDENCE');
console.log('Spot Ignition assertions passed');
