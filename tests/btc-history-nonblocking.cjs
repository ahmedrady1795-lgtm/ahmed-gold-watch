const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const now=Date.now(),calls=[],module_={exports:{}};
function candles(interval){
  const unit=interval*1000,latest=Math.floor(now/unit)*unit-unit;
  return Array.from({length:280},(_,i)=>{
    const t=Math.floor((latest-(279-i)*unit)/1000);
    const p=83400+i*.15;
    return [t,p-7,p+9,p,p+1,22];
  });
}
const mockedFetch=async(url)=>{
  calls.push(String(url));
  const u=new URL(url),interval=Number(u.searchParams.get('granularity'));
  if(u.searchParams.has('start')){
    return new Promise(()=>{}); // archival endpoint hangs indefinitely
  }
  return {ok:true,json:async()=>candles(interval)};
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/btc-market.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:module_,exports:module_.exports,require,
  Date,Promise,Number,Math,Map,URL,URLSearchParams,AbortSignal,fetch:mockedFetch});
const get=module_.exports.getBtcMarket;
Promise.race([
  get(),
  new Promise((_,reject)=>setTimeout(()=>reject(new Error('live BTC blocked by archive')),750))
]).then(m=>{
  assert.ok(m.c1.length>=260&&m.c5.length>=260&&m.c15.length>=260&&m.c60.length>=260);
  assert.ok(calls.some(x=>x.includes('start=')),'long history still starts in background');
  assert.equal(m.source,'Coinbase BTC-USD · extended M1');
  console.log('PASS: live BTC OHLC frames return without waiting on indefinitely hung archival M1 fetch');
}).catch(e=>{console.error(e);process.exitCode=1;});
