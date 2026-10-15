const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const output={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/market-tool-quality.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{exports:output});
const {freshEvidence,spotPriceConsensus,independentToolConsensus}=output;
const now=Date.parse('2026-10-15T05:00:00Z');
assert.equal(freshEvidence({ok:true,sourceAt:now-2000},now),true);
assert.equal(freshEvidence({ok:true,sourceTime:new Date(now-1000).toISOString()},now),true);
assert.equal(freshEvidence({ok:true,checkedAt:now-9000},now),false);
assert.equal(freshEvidence({ok:true,sourceAt:now+8000},now),false);
assert.equal(freshEvidence({ok:true,available:false,sourceAt:now},now),false);
assert.equal(freshEvidence({sourceAt:0,checkedAt:now},now),false,'do not overwrite explicitly invalid source time');
const p=(id,value,unit='USD',side='WAIT',score=0,quality=80)=>({
  id,category:'PRICE',ok:true,value,unit,side,score,quality
});
const gold=spotPriceConsensus('GOLD',[
  p('biquote_xau',4142),p('goldprice_spot',4146),
  p('comex_gc',4260),p('untrusted_spot',3000)
]);
assert.equal(gold.mid,4144,'must use true even-number median rather than high-side bias');
assert.equal(gold.sourceCount,2);
assert.ok(gold.spreadBps<15,'future contract mismatch must not trigger spot-dispersion warning');
const btc=spotPriceConsensus('BTC',[
  p('coinbase_ticker',81000),p('kraken_ticker',81020),
  p('okx_ticker',82500,'USDT')
]);
assert.equal(btc.mid,81010,'USDT quote is not USD spot confirmation');
assert.equal(btc.sourceCount,2);
const lone=spotPriceConsensus('GOLD',[p('biquote_xau',4142)]);
assert.equal(lone.spreadBps,null,'one venue cannot prove that venues agree');
assert.equal(spotPriceConsensus('BTC',[p('okx_ticker',81000,'USDT')]).mid,null);
const flow=(id,side,score=65)=>({
  id,category:id==='market_lead'?'TRADES':'ORDER_BOOK',ok:true,
  value:null,unit:null,side,score,quality:85
});
let vote=independentToolConsensus([flow('market_lead','BUY'),flow('liquidity_engine','BUY')]);
assert.equal(vote.independentVotes,1,'reused microstructure is a single vote family');
assert.equal(vote.side,'WAIT','two correlated feeds must never certify an independent edge');
vote=independentToolConsensus([flow('market_lead','BUY'),flow('liquidity_engine','BUY'),
  {...flow('web_scout','BUY'),category:'WEB'}]);
assert.equal(vote.side,'BUY','two distinct sources may corroborate a direction');
assert.equal(vote.independentVotes,2);
vote=independentToolConsensus([flow('market_lead','BUY'),{...flow('web_scout','SELL'),category:'WEB',score:65}]);
assert.equal(vote.side,'WAIT','balanced independent evidence must not force a direction');
const mesh=fs.readFileSync('lib/market-tool-mesh.ts','utf8');
assert.match(mesh,/independentToolConsensus\(tools\)/);
assert.match(mesh,/spotPriceConsensus\(args\.asset,tools\)/);
assert.match(mesh,/freshEvidence\(data,now\)/);
assert.match(mesh,/spotMismatch\?'WAIT':c\.side/);
assert.doesNotMatch(mesh,/side:ps\.side,score:ps\.score/,'24h price trend is never a scalp directional vote');
assert.doesNotMatch(mesh,/side:side\(imbalance,4\)/,'spread position is not signed market order flow');
assert.match(mesh,/id:'okx_funding'[\s\S]{0,250}side:'WAIT',score:0/,
  'funding rate must be context only');
console.log('PASS: sniper venue verification blocks stale, correlated, fake micro and cross-contract evidence');
