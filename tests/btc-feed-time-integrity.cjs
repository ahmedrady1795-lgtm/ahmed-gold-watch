const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const api=fs.readFileSync('app/api/btc/route.ts','utf8');
const page=fs.readFileSync('app/page.tsx','utf8');
const chart=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
assert.match(api,/Coinbase Spot · time unknown/,'a price-only Spot feed must not be called real-time');
assert.match(api,/sourceTime:null,status:'unknown'/,'zero timestamps must never be fabricated');
assert.match(api,/Kraken XBT\/USD Trades/,'fallback fetches timestamped genuine exchange trades');
assert.match(page,/j\?\.status==='live'&&validSourceTime/,'client verifies both provider status and source time');
assert.match(chart,/priceMarkerVisible=m\.price!=null/,'show old price honestly if current quote temporarily unavailable');
assert.match(chart,/آخر سعر · غير حي/,'old quote is not mislabeled LIVE');
assert.match(chart,/historyFresh:breakoutEvidence\.ready/,'independent closed M5 structure survives M1 data gaps');
function instance({exchange=true,kraken=true,spot=true}={}){
 const now=Date.now();
 const module_={exports:{}};
 async function fetchMock(url){
  if(url.includes('api.exchange.coinbase.com')){
   if(!exchange)throw new Error('Coinbase down');
   return {ok:true,json:async()=>({price:'81522.40',time:new Date(now-1300).toISOString()})};
  }
  if(url.includes('api.coinbase.com')){
   if(!spot)throw new Error('Spot down');
   return {ok:true,json:async()=>({data:{amount:'81521.10'}})};
  }
  if(url.includes('api.kraken.com')){
   if(!kraken)throw new Error('Kraken down');
   return {ok:true,json:async()=>({result:{XXBTZUSD:[['81525.60','0.01',(now-1100)/1000,'b','m','']]}})};
  }
  throw new Error('CoinGecko unavailable');
 }
 vm.runInNewContext(ts.transpileModule(api,{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
 }).outputText,{module:module_,exports:module_.exports,fetch:fetchMock,Date,URL,Response,
   Promise,AbortSignal,setTimeout,console},{filename:'app/api/btc/route.ts'});
 return module_.exports.GET;
}
(async()=>{
 let response=await instance()({url:'https://test.invalid/api/btc'});
 let json=await response.json();
 assert.equal(json.source,'Coinbase Exchange','trusted timestamped Coinbase wins over untimed Spot');
 assert.equal(json.status,'live');assert.ok(json.sourceTime>0);
 response=await instance({exchange:false})({url:'https://test.invalid/api/btc'});
 json=await response.json();
 assert.equal(json.source,'Kraken XBT/USD Trades');
 assert.equal(json.status,'live','timestamped trades qualify as fresh live fallback');
 assert.ok(json.sourceTime>0);
 response=await instance({exchange:false,kraken:false})({url:'https://test.invalid/api/btc'});
 json=await response.json();
 assert.equal(json.status,'unknown','price-only fallback is explicitly not live');
 assert.equal(json.sourceTime,null);
 assert.equal(json.degraded,true);
 console.log('PASS: BTC Coinbase/Kraken true exchange timestamps, untimed Spot correctly downgraded, M5 gap-independent view');
})().catch(e=>{console.error(e);process.exitCode=1;});
