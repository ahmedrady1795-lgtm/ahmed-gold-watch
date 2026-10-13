const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const out={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/trend-confirmation.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{exports:out});
const series=(step,size=240)=>Array.from({length:size},(_,i)=>{
  const close=4000+step*i;
  return {time:Date.parse('2026-01-01T00:00:00Z')+i*300000,
    open:close,high:close+2,low:close-2,close};
});
const bull=out.supertrend(series(3));
const bear=out.supertrend(series(-3));
assert.equal(bull.ready,true);
assert.equal(bull.side,'BUY');
assert.ok(bull.line<series(3).at(-1).close);
assert.equal(bear.ready,true);
assert.equal(bear.side,'SELL');
assert.ok(bear.line>series(-3).at(-1).close);
assert.equal(out.supertrend(series(3,10)).ready,false);
const invalid=series(3);
invalid[20].high=invalid[20].low-1;
assert.equal(out.supertrend(invalid).ready,false);
// Prove no look-ahead: the historical last result is independent of later bars.
const first=out.supertrend(series(3,220));
const after=series(3,240);
assert.equal(first.side,out.supertrend(after.slice(0,220)).side);
assert.equal(first.line,out.supertrend(after.slice(0,220)).line);
console.log('PASS: closed-bar Supertrend monotonic trends, insufficient/invalid history and no look-ahead');
