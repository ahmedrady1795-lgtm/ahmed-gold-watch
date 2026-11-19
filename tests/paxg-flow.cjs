const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const context={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/paxg-flow.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,context);
const {readPaxgFlow}=context.exports;
const now=100000,levels=[0,1,2,3,4];
const book=buy=>({bids:levels.map(i=>[100-i,buy?4:1]),asks:levels.map(i=>[101+i,buy?1:4])});
const trades=buy=>levels.map(i=>({a:i,q:'1',T:now-i*1000,m:!buy}));
assert.equal(readPaxgFlow(book(true),trades(true),now).side,'BUY');
assert.equal(readPaxgFlow(book(false),trades(false),now).side,'SELL');
assert.equal(readPaxgFlow(book(false),trades(true),now).side,'NEUTRAL');
assert.equal(readPaxgFlow(book(true),trades(true),now+16000).side,'UNAVAILABLE');
assert.equal(readPaxgFlow(book(true),Array(5).fill(trades(true)[0]),now).side,'UNAVAILABLE');
assert.equal(readPaxgFlow(book(true),trades(true),now-6000).side,'UNAVAILABLE');
assert.equal(readPaxgFlow({},trades(true),now).side,'UNAVAILABLE');
console.log('PASS PAXG book and trade alignment, conflict, freshness and deduplication');
