const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const cache=new Map();
function load(file){
 file=path.resolve(file);if(cache.has(file))return cache.get(file);
 const exports={};cache.set(file,exports);
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{
   compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}
 }).outputText;
 vm.runInNewContext(js,{exports,require:id=>id.startsWith('.')?
   load(path.resolve(path.dirname(file),id+'.ts')):require(id),
   console,Date,Math,Number,globalThis:sharedGlobals,process:{env:{}},
   setTimeout,clearTimeout},{filename:file});
 return exports;
}
const sharedGlobals={};
const {observeEveryM1}=load('lib/scalp-every-candle.ts');
// Simulate the Next.js health route with a separate module/global cache.
// It initializes BEFORE the paper worker, then must see later file writes.
function separateReader(){
 const cache=new Map(),globals={};
 function open(file){
  file=path.resolve(file);if(cache.has(file))return cache.get(file);
  const exports={};cache.set(file,exports);
  const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}
  }).outputText;
  vm.runInNewContext(js,{exports,require:id=>id.startsWith('.')?
    open(path.resolve(path.dirname(file),id+'.ts')):require(id),
    console,Date,Math,Number,globalThis:globals,process:{env:{RENDER:'true'}},
    setTimeout,clearTimeout},{filename:file});
  return exports;
 }
 return open('lib/scalp-every-candle.ts');
}
const T=Date.parse('2026-11-05T11:00:00Z'),MINUTE=60000;
const make=(start,step)=>Array.from({length:43},(_,i)=>{
 const open=start+i*step,close=open+step*.6;
 return {time:T+i*MINUTE,open,high:close+step*.3,low:open-step*.3,close};
});
const gold=make(100,.06),btc=make(75000,1.2);
const issued=gold.at(-1).time+MINUTE,now=issued+200;
const reader=separateReader();
reader.readEveryM1Evidence('BTC',now);
const goldQ={price:102.60,bid:102.59,ask:102.61,at:issued+100,source:'MT5-GOLD-TEST'};
const btcQ={price:75051,bid:75050.9,ask:75051.1,at:issued+100,source:'COINBASE-BTC-TEST'};
const g1=observeEveryM1(gold,goldQ,now,.03,'TEST GOLD M1','GOLD');
const b1=observeEveryM1(btc,btcQ,now,1,'TEST BTC M1','BTC');
assert.equal(g1.asset,'GOLD');assert.equal(b1.asset,'BTC');
assert.equal(g1.proposals,1);assert.equal(b1.proposals,1);
assert.ok(g1.latest.anchorClose<200,'GOLD must read GOLD OHLC only');
assert.ok(b1.latest.anchorClose>70000,'BTC must read BTC OHLC only');
assert.equal(g1.latest.chartSource,'TEST GOLD M1');
assert.equal(b1.latest.chartSource,'TEST BTC M1');
assert.equal(g1.latest.issuedAt,b1.latest.issuedAt,
 'same-minute timestamp must be supported independently for each asset');
const g2=observeEveryM1(gold,goldQ,now+100,.03,'TEST GOLD M1','GOLD');
assert.equal(g2.proposals,1,'BTC cannot pollute GOLD sequence');
const btcNext=[...btc,{time:issued,open:btc.at(-1).close,
 high:btc.at(-1).close+1.2,low:btc.at(-1).close-.8,
 close:btc.at(-1).close+.8}];
const b2=observeEveryM1(btcNext,{...btcQ,at:issued+MINUTE+100},
 issued+MINUTE+200,1,'TEST BTC M1','BTC');
assert.equal(b2.proposals,2,'next BTC candle must record a second independent hypothesis');
assert.equal(observeEveryM1(gold,goldQ,now+200,.03,'TEST GOLD M1','GOLD').proposals,1);
const fromOtherModule=reader.readEveryM1Evidence('BTC',issued+MINUTE+300);
assert.equal(fromOtherModule.issued,2,
  'a stale health-route module must pick up worker-written BTC M1 files');
assert.equal(fromOtherModule.asset,'BTC');
assert.equal(fromOtherModule.durable,false,'Render Free must not certify persistence');
assert.equal(fromOtherModule.verifiedBrokerTrades,0);
const goldProof=reader.readEveryM1Evidence('GOLD',issued+MINUTE+300);
assert.equal(goldProof.issued,1,'cross-bundle BTC observations cannot pollute GOLD');
const desk=fs.readFileSync('lib/scalp-desk.ts','utf8');
assert.match(desk,/observeEveryM1\(input\.c1,quote,at,/);
assert.match(desk,/paperCost\),input\.candleSource,asset\)/,
 'GOLD and BTC forward observers must receive explicit asset identity');
const page=fs.readFileSync('app/scalp/page.tsx','utf8');
assert.match(page,/GoldEveryCandle data=\{desk\?\.bitcoin\?\.everyCandle\} asset="BTC"/);
assert.match(page,/asset!=='GOLD'&&<GoldEveryCandle/);
const storage=fs.readFileSync('lib/scalp-every-candle.ts','utf8');
assert.match(storage,/scalp-every-m1-btc-v1\.json/);
assert.match(storage,/const lastSaved:\{GOLD:number;BTC:number\}/);
console.log('PASS: independent BTC and GOLD M1 issued forecasts, distinct prices/source, independent save cadence, historical baseline and no cross-asset ledger');
