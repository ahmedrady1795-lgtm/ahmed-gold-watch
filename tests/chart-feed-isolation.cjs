const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync('app/api/chart-history/route.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText;
const gold={chartCandles:[{close:4200}],candleSource:'same gold feed'};
const bitcoin={chartCandles:[{close:65000}],candleSource:'same btc feed'};
async function run(goldFeed,btcFeed,url='https://test/api/chart-history'){
 const box={exports:{}},calls={gold:0,btc:0},never=()=>new Promise(()=>{});
 vm.runInNewContext(code,{module:box,exports:box.exports,URL,Response,Date,Promise,
  setTimeout:(fn,ms)=>{assert.ok(ms<=8000);return setTimeout(fn,5);},clearTimeout,
  require:id=>id.includes('market-hub')?{getMarketData:()=>{calls.gold++;return goldFeed==='hang'?never():goldFeed==='fail'?Promise.reject(Error('gold down')):Promise.resolve(gold);}}:
   id.includes('btc-market')?{getBtcMarket:()=>{calls.btc++;return btcFeed==='hang'?never():btcFeed==='fail'?Promise.reject(Error('btc down')):Promise.resolve(bitcoin);}}:
   id.includes('chart-history')?{chartAssetFromMarket:x=>x}:
   id.includes('sniper-audit-store')?{updateStructuralWatchFromChart:()=>({})}:
   (()=>{throw Error('Unexpected import '+id);})()
 });
 const response=await box.exports.GET({url});return {response,body:await response.json(),calls};
}
(async()=>{
 const slowBtc=await run('ok','hang');
 assert.equal(slowBtc.response.status,200);assert.equal(slowBtc.body.gold.candleSource,gold.candleSource);
 assert.equal(slowBtc.body.bitcoin,null,'stalled BTC cannot withhold ready GOLD');
 const slowGold=await run('hang','ok');assert.equal(slowGold.body.gold,null);
 assert.equal(slowGold.body.bitcoin.candleSource,bitcoin.candleSource);
 const goldOnly=await run('ok','hang','https://test/api/chart-history?asset=GOLD');
 assert.equal(goldOnly.calls.btc,0,'gold observer must not even start a BTC request');
 assert.equal(goldOnly.body.gold.candleSource,gold.candleSource);
 assert.equal((await run('fail','fail')).response.status,503);
 console.log('PASS: GOLD and BTC fail independently within a response budget; GOLD-only observation skips BTC entirely');
})().catch(e=>{console.error(e);process.exitCode=1;});
