const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/sniper-m5-level-setup.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,
 {module:m,exports:m.exports});
const run=m.exports.assessM5LevelSetup,start=Date.parse('2026-11-16T10:00:00Z');
const bars=Array.from({length:18},(_,i)=>({time:start-(18-i)*60000,open:100,close:100,high:101,low:99}));
Object.assign(bars[15],{open:99.6,close:99.4,high:99.8,low:99.1});
Object.assign(bars[16],{open:99.4,close:99.3,high:99.8,low:98.8});
Object.assign(bars[17],{open:99.35,close:99.6,high:99.75,low:98.85});
const data={now:start+1000,price:99.5,sourceReady:true,m1:bars,m5:[]};
const buy=run(data);assert.equal(buy.side,'BUY');assert.equal(buy.setup,'REJECTION');
assert.ok(buy.invalidation<data.price&&buy.target>data.price);
assert.equal(buy.target,101,'target existed before the reaction');assert.equal(buy.tradeEligible,false);
const mirror=bars.map(b=>({...b,open:200-b.open,close:200-b.close,high:200-b.low,low:200-b.high}));
assert.equal(run({...data,price:100.5,m1:mirror}).side,'SELL');
assert.equal(run({...data,price:102}).side,'WAIT','do not chase after target passed');
assert.equal(run({...data,sourceReady:false}).side,'WAIT');
assert.equal(run({...data,m1:bars.filter((_,i)=>i!==8)}).side,'WAIT');
const future={time:start,open:99.5,close:105,high:110,low:90};
assert.equal(JSON.stringify(run({...data,m1:[...bars,future]})),JSON.stringify(buy),'future candle cannot change setup');
const trend=bars.map((b,i)=>({...b,open:100+i*.16,close:100+i*.16+.12,high:100+i*.16+.22,low:100+i*.16-.1}));
assert.equal(run({...data,price:102.9,m1:trend}).side,'WAIT','positive momentum alone is not a setup');
console.log('PASS: prior-level rejection, mirrored sides, no chasing, no lookahead and stale/gap rejection');
