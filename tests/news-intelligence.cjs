// Regression tests for macro-release direction gates.
// A difference between the consensus forecast and the previous result
// MUST NOT become an actionable pre-announcement forecast.
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const exports_={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/news-intelligence.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{exports:exports_});
const now=Date.parse('2026-10-14T12:00:00Z');
const event=(name,time,actual,forecast,previous)=>({
  id:'real-provider-id',name,time,actual,forecast,previous,
  importance:3,exactTime:true,source:'https://www.forexfactory.com/calendar'
});
const {buildNewsIntelligence:assess}=exports_;
const upcoming=event('CPI',now+3600000,'','3.2%','3.0%');
for(const asset of ['GOLD','BTC']){
  const result=assess(asset,[upcoming],now);
  assert.equal(result.phase,'PRE_EVENT');
  assert.equal(result.side,'WAIT','pre-announcement data must not become a trading direction');
  assert.equal(result.directional,false);
  assert.equal(result.weight,0);
  assert.ok(result.risk>0,'news risk is still visible');
}
const released=event('CPI',now-60000,'3.6%','3.2%','3.0%');
const gold=assess('GOLD',[released],now);
assert.equal(gold.phase,'RELEASED');
assert.equal(gold.side,'SELL','CPI above consensus may weigh on gold, conditional on market response');
assert.equal(gold.directional,true);
const btc=assess('BTC',[released],now);
assert.equal(btc.side,'WAIT','BTC macro direction must not blindly inherit gold');
assert.equal(btc.directional,false);
assert.equal(assess('GOLD',[event('Fed Chair Powell Speaks',now+10000,'','','')],now).side,'WAIT');
assert.equal(assess('GOLD',[],now).side,'WAIT');
console.log('PASS: news risk before release, no pre-Actual directional edge, independent BTC direction');
