const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('typescript'),cache=new Map();
function load(file){
 file=path.resolve(file);if(cache.has(file))return cache.get(file);
 const exports={};cache.set(file,exports);
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{
   target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,
   esModuleInterop:true
 }}).outputText;
 vm.runInNewContext(js,{exports,require:n=>n.startsWith('.')?
  load(path.resolve(path.dirname(file),n+'.ts')):require(n),
  Date,Number,Math,console,globalThis:{},process:{env:{}},
  setTimeout,clearTimeout},{filename:file});
 return exports;
}
const {priceEveryM1Limit,priceEveryM1NearLimit,EVERY_M1_EDGE_V5,
 EVERY_M1_EDGE_V6,EVERY_M1_MIN_NET_R}
 =load('lib/scalp-every-m1-economics.ts');
const {advanceEveryM1}=load('lib/scalp-every-candle.ts');
const buy={side:'BUY',bid:100,ask:100.05,atr:1,cost:.15,
 previousOpen:99,previousClose:99.10};
const sell={side:'SELL',bid:100,ask:100.05,atr:1,cost:.15,
 previousOpen:101.10,previousClose:101};
for(const input of [buy,sell]){
 const previous=priceEveryM1Limit(input),near=priceEveryM1NearLimit(input);
 assert.ok(previous&&near,'the identical quote/cost has two feasible passive candidates');
 assert.ok(near.retestDepth<previous.retestDepth-.08,
  'V6 rests closer than V5 body-mid depth for a fast directional move');
 assert.ok(input.side==='BUY'?near.entry<input.bid:near.entry>input.ask,
  'V6 must remain nonmarketable relative to the current BID/ASK');
 assert.ok(input.side==='BUY'?near.stop<near.entry&&near.tp>near.entry:
    near.stop>near.entry&&near.tp<near.entry,
    'stop and reachable profit must be on the correct side');
 assert.ok(near.grossTargetMove<=input.atr*.72+1e-6,
    'TP remains inside bounded minute reach, never an arbitrary distant target');
 assert.ok(near.netRewardR+1e-8>=EVERY_M1_MIN_NET_R,
    'bid/ask and fees/slippage are charged in theoretical net payoff');
 assert.ok(near.retestDepth>0,'never issue a marketable or zero-distance LIMIT');
}
for(const invalid of [
 {...buy,ask:100.31,cost:.38},
 {...buy,cost:2.3},
 {...buy,bid:0},
 {...buy,ask:99.99},
 {...buy,atr:0},
 {...buy,previousClose:NaN}
]){
 assert.equal(priceEveryM1NearLimit(invalid),null,
  'never fabricate a fill or cheap target from invalid quotes or costs');
}
const T=Date.parse('2026-11-06T07:00:00Z');
const bars=Array.from({length:43},(_,i)=>{
 const open=100+i*.06,close=open+.035;
 return {time:T+i*60000,open,high:close+.05,low:open-.05,close};
});
const issue=bars.at(-1).time+60000;
const quote=(bid,ask,at)=>({price:(bid+ask)/2,bid,ask,at,
 source:'TEST-M1-BID-ASK'});
const first=quote(102.50,102.51,issue+100);
const newLedger=advanceEveryM1({version:1,history:[]},bars,first,issue+100,.015);
assert.equal(newLedger.history.length,1);
const newTrade=newLedger.history[0];
assert.equal(newTrade.strategyVersion,EVERY_M1_EDGE_V6);
assert.equal(newTrade.state,'PENDING');
assert.ok(newTrade.entry!=null&&newTrade.filledAt==null,
 'a new minute creates only a pending limit, never a same-quote fill');
const oldExpected=priceEveryM1Limit({side:newTrade.side,bid:first.bid,
 ask:first.ask,atr:newTrade.atr,cost:.015,
 previousOpen:bars.at(-1).open,previousClose:bars.at(-1).close});
const newExpected=priceEveryM1NearLimit({side:newTrade.side,bid:first.bid,
 ask:first.ask,atr:newTrade.atr,cost:.015,
 previousOpen:bars.at(-1).open,previousClose:bars.at(-1).close});
assert.ok(oldExpected&&newExpected);
assert.equal(newTrade.entry,newExpected.entry);
assert.ok(newExpected.retestDepth<=oldExpected.retestDepth,
 'the new order is never intentionally placed farther from the same live quote');
assert.equal(newTrade.stop,newExpected.stop);
assert.equal(newTrade.tp,newExpected.tp);
// A previously issued V5 order waiting for its initial quote should retain
// V5 math, not silently change strategy midway through that old minute.
const held={...newTrade,strategyVersion:EVERY_M1_EDGE_V5,
 state:'AWAIT_QUOTE',entry:null,stop:null,tp:null,quoteSource:'',
 lastQuoteAt:0,lastExecutable:null,filledAt:null};
const carry=advanceEveryM1({version:1,history:[held]},bars,first,
 issue+100,.015).history[0];
assert.equal(carry.strategyVersion,EVERY_M1_EDGE_V5);
assert.equal(carry.entry,oldExpected.entry,
 'old pending cohort retains its original V5 passive entry');
assert.equal(carry.state,'PENDING');
assert.equal(carry.filledAt,null);
// Still no fictional fill at the same tick, regardless of nearer geometry.
const repeated=advanceEveryM1(newLedger,bars,first,issue+200,.015);
assert.equal(repeated.history[0].state,'PENDING');
assert.equal(repeated.history[0].filledAt,null);
assert.equal(repeated.history[0].entry,newExpected.entry);
const api=fs.readFileSync('lib/scalp-every-candle.ts','utf8');
assert.match(api,/strategyVersion:EVERY_M1_EDGE_V6/);
assert.match(api,/t\.strategyVersion===EVERY_M1_EDGE_V6\?/);
assert.match(api,/const settled=completed\.filter\(t=>t\.strategyVersion===EVERY_M1_EDGE_V6\)/);
assert.match(api,/const priorV5=completed\.filter\(t=>t\.strategyVersion===EVERY_M1_EDGE_V5\)/);
assert.doesNotMatch(api,/limitType:'BUY_STOP'|limitType:'SELL_STOP'|marketOrder/);
const page=fs.readFileSync('app/scalp/page.tsx','utf8');
assert.match(page,/V6 نتائج LIMIT محسومة/);
assert.match(page,/V5 السابق:/);
console.log('PASS: V6 nearer passive BUY/SELL LIMIT, cost-constrained TP/SL, version-isolated P&L, V5 carryover, zero same-tick fills');
