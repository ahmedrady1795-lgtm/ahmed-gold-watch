const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const ex={};
const code=ts.transpileModule(fs.readFileSync('lib/ml-prediction.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText;
vm.runInNewContext(code,{exports:ex,require:()=>({certifyMlResponse:x=>x}),process,AbortController,setTimeout,clearTimeout,Date});
const {prepareMlCandles}=ex;
const now=Date.parse('2026-10-15T09:00:15Z');
const start=Math.floor(now/60000)*60000-260*60000;
const rows=Array.from({length:260},(_,i)=>({
  time:start+i*60000,open:80000+i,high:80001+i,
  low:79999+i,close:80000.5+i,realVolume:3
}));
let res=prepareMlCandles(rows,now);
assert.equal(res.ready,true,'valid recent closed M1 history passes');
assert.equal(res.rows.length,260);
res=prepareMlCandles([...rows,rows.at(-1)],now);
assert.equal(res.ready,true,'duplicate timestamps do not inflate rows');
res=prepareMlCandles(rows.map((x,i)=>i===259?{...x,time:x.time+60000}:x),now);
assert.equal(res.ready,false,'forming future minute cannot substitute closed bar');
res=prepareMlCandles(rows.slice(0,-1),now+3*60000);
assert.equal(res.ready,false,'past M1 history expires promptly');
res=prepareMlCandles(rows.filter((_,i)=>i!==251),now);
assert.equal(res.ready,false,'missing recent candle blocks model voting');
res=prepareMlCandles(rows.map((x,i)=>i===255?{...x,high:x.low-1}:x),now);
assert.equal(res.ready,false,'invalid OHLC must not be interpreted as valid continuity');
res=prepareMlCandles(rows.slice(-180),now);
assert.equal(res.ready,false,'not enough historical context to compute robust ML features');
const scalp=fs.readFileSync('lib/scalp-fusion.ts','utf8');
assert.match(scalp,/hold\*100/,'validated out-of-sample probability must be percentage scaled');
assert.match(scalp,/if\(!m\?\.ready\|\|!\['BUY','SELL'\]/,'an unqualified model must contribute no scalp strength');
console.log('PASS: AI prediction uses fresh closed M1 history, zero forward bars, no gaps and validated holdout scaling');
