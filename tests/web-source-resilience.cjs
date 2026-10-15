const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
let now=Date.parse('2026-10-15T04:00:00Z'),calls=0,fail=true;
class Clock extends Date {static now(){return now;}}
const ex={};
const source=fs.readFileSync('lib/web-market-intelligence.ts','utf8')+'\nexport const hooks={fetchSource,buildSignal,SOURCES};';
const feed=()=>`<rss><channel><item><title>Federal Reserve rate cut</title><pubDate>${new Date(now-60000).toUTCString()}</pubDate></item></channel></rss>`;
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,{
  exports:ex,Date:Clock,AbortSignal,
  require:(name)=>name==='node:fs'?{existsSync:()=>false,readFileSync:()=>{throw Error('no saved learning');}}:require(name),
  fetch:async()=>{calls++;return {ok:!fail,status:fail?403:200,text:async()=>feed()};}
});
(async()=>{
  const {fetchSource,buildSignal,SOURCES}=ex.hooks,source=SOURCES[0];
  const failed=await fetchSource(source,now);
  assert.equal(failed.ok,false);assert.equal(failed.retryAt-now,15*60000);
  await fetchSource(source,now);assert.equal(calls,1,'blocked feed must not be hammered');
  now=failed.retryAt;fail=false;
  assert.equal((await fetchSource(source,now)).ok,true);assert.equal(calls,2);
  fail=true;const failedAgain=await fetchSource(source,now);
  assert.equal(failedAgain.retryAt-now,15*60000,'success resets consecutive failure backoff');
  const row={title:'Federal Reserve rate cut',description:'',link:null,publishedAt:now-60000};
  const signal=(rows)=>buildSignal('GOLD',[{source,ok:true,rows}],now);
  assert.equal(signal([row]).side,'BUY');
  for(const publishedAt of [null,undefined,NaN,now+60000,now-721*60000]){
    const value=signal([{...row,publishedAt}]);
    assert.equal(value.side,'WAIT');assert.equal(value.freshCount,0);
  }
  now+=3600000;fail=false;
  const first=await ex.getWebMarketIntelligence(now),count=calls;
  now+=30000;
  const cached=await ex.getWebMarketIntelligence(now);
  assert.equal(cached.cached,true);assert.equal(calls,count);
  assert.equal(cached.checkedAt,first.checkedAt,'cache must retain actual fetch timestamp');
  assert.ok(cached.gold.items[0].ageMinutes>first.gold.items[0].ageMinutes,'cached article ages must advance');
  console.log('PASS: blocked-feed cooldown, recovery, trusted publication times, honest cache age');
})().catch(e=>{console.error(e);process.exitCode=1;});
