const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const now=Date.now(),calls=[];let cbDown=true,krDown=false;
const rows=(minutes)=>Array.from({length:minutes===1?720:280},(_,i)=>{
 const length=minutes===1?720:280,period=minutes*60000,t=Math.floor(now/period)*period-(length-i)*period;
 return [t/1000,100,101,99,100.5,100.3,22];
});
const mock=async url=>{
 calls.push(url);const u=new URL(url);
 if(u.hostname.includes('kraken')){
  if(krDown)throw Error('kraken unavailable');
  return {ok:true,json:async()=>({result:{XXBTZUSD:rows(Number(u.searchParams.get('interval')))}})};
 }
 if(cbDown)throw Error('coinbase unavailable');
 if(u.searchParams.has('start'))return new Promise(()=>{});
 const r=rows(Number(u.searchParams.get('granularity'))/60).slice(-280);
 return {ok:true,json:async()=>r.map(b=>[b[0],b[3],b[2],b[1],b[4],b[6]])};
};
const e={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/btc-market.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{exports:e,require,fetch:mock,Date,AbortSignal,URL,URLSearchParams});
(async()=>{
 let m=await e.getBtcMarket(true);assert.ok(m.source.startsWith('Kraken'));assert.equal(m.c1.length,720);
 const n=calls.filter(u=>u.includes('coinbase')).length;
 cbDown=false;m=await e.getBtcMarket(true);assert.ok(m.source.startsWith('Kraken'));
 assert.equal(calls.filter(u=>u.includes('coinbase')).length,n,'healthy fallback venue stays stable across polls');
 krDown=true;m=await e.getBtcMarket(true);assert.ok(m.source.startsWith('Coinbase'),'failed venue can still fail over');
 console.log('PASS: healthy BTC venue continuity, retained 12h M1 evidence, failover on actual provider failure');
})().catch(e=>{console.error(e);process.exitCode=1;});
