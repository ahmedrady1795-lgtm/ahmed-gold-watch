const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const ex={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/optional-market-evidence.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{exports:ex,setTimeout,clearTimeout,Promise});
const optional=ex.optionalMarketEvidence;
(async()=>{
  assert.equal(await optional(Promise.resolve({ok:true}),150).then(x=>x?.ok),true);
  assert.equal(await optional(Promise.reject(Error('provider fail')),150),null);
  const start=Date.now();
  const stalled=await optional(new Promise(()=>{}),40);
  assert.equal(stalled,null,'hung BTC orderbook fails closed with NO fabricated liquidity');
  assert.ok(Date.now()-start<400,'gold analysis must not wait for a BTC provider');
  await assert.rejects(optional(Promise.resolve('OK'),0),/INVALID_OPTIONAL_MARKET_BUDGET/);
  const route=fs.readFileSync('app/api/ai-analysis/route.ts','utf8');
  assert.match(route,/optionalMarketEvidence\(getBtcLiquidity\(\),3500\)/);
  assert.match(route,/perf\.btcLiquidityAvailable=Boolean\(liquidity\?\.ok\)/);
  console.log('PASS: optional BTC liquidity cannot block gold; timeout is neutral and observable');
})().catch(e=>{console.error(e);process.exitCode=1;});
