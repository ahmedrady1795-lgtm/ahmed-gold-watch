const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/spot-aggressive.ts','utf8'),
{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:out});
const coin={volume24h:2200000,change24h:1.5,change15m:.4,buyShare:.59,
  volumeImpulse:1.9,flowDelta5m:4700,trapRisk:false,book:{bidShare:.58,spreadBps:9}};
const h={rankScore:28,state:'AVOID',hardVeto:false,reason:'ضعف نشاط 24 ساعة',
  hourlyChange24:2,volumeRatio24:.83,takerBuyShare12:.49,freshAt:Date.now()};
assert.equal(out.isSpotFastLane(coin),true);
const early=out.rankSpotFastLane(coin,h);
assert.equal(early.state,'POSSIBLE');assert.equal(early.fastLane,true);
assert.equal(out.rankSpotFastLane(coin,{...h,hardVeto:true}).state,'AVOID');
assert.equal(out.rankSpotFastLane({...coin,book:null},h).state,'AVOID');
assert.equal(out.rankSpotFastLane({...coin,trapRisk:true},h).state,'AVOID');
assert.equal(out.rankSpotFastLane({...coin,buyShare:.42},h).state,'AVOID');
assert.equal(out.rankSpotFastLane({...coin,volume24h:500000},h).state,'AVOID');
assert.equal(out.rankSpotFastLane({...coin,book:{bidShare:.6,spreadBps:50}},h).state,'AVOID');
assert.equal(out.rankSpotFastLane({...coin,change15m:9},h).state,'AVOID');
assert.equal(out.rankSpotFastLane(coin,{...h,rankScore:59,takerBuyShare12:.54,volumeRatio24:.92}).state,'HIGH');
console.log('PASS: aggressive early Spot detection with safe data and fakeout veto');
