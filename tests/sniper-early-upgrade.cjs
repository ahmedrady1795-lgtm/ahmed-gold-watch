const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:mod,exports:mod.exports});return mod.exports;}
const {advanceEarlySetup:step,earlySetupOpportunity:signal}=load('lib/sniper-early-setup.ts');
const lean=load('lib/sniper-m5-candle-lean.ts').assessM5CandleLean;
const now=Date.parse('2026-11-17T10:00:00Z')+1000;
const bars=Array.from({length:18},(_,i)=>({time:now-1000-(18-i)*60000,
 open:100,high:100.5,low:99.5,close:100}));
// Completed drive followed by a shallow, contracting two-candle pullback.
bars[12]={...bars[12],open:100,close:100.4,high:100.5,low:99.9};
bars[13]={...bars[13],open:100.4,close:100.8,high:100.9,low:100.3};
bars[14]={...bars[14],open:100.8,close:101.2,high:101.3,low:100.7};
bars[15]={...bars[15],open:101.2,close:101.6,high:101.82,low:101.1};
bars[16]={...bars[16],open:101.6,close:101.4,high:101.62,low:101.3};
bars[17]={...bars[17],open:101.4,close:101.38,high:101.48,low:101.28};
const idle={phase:'WATCH',side:'WAIT',trigger:null,invalidation:null,sourceAt:null,targets:[]};
const base={prior:null,scope:'GOLD:test',now,price:101.4,ready:true,bars,
 opportunity:idle,lean:{side:'WAIT',reason:''},m1Side:'BUY',m15Side:'BUY'};
const buy=step(base);
assert.equal(buy.setupKind,'PULLBACK');assert.equal(buy.side,'BUY');
assert.ok(buy.trigger>base.price);assert.ok(buy.invalidation<base.price);
assert.ok(buy.targets.length,'targets exist even when pressure detector is WAIT');
assert.ok(buy.targets.every(t=>bars.some(b=>b.high===t)),'targets are observed prices');
const mirror=b=>({...b,open:200-b.open,close:200-b.close,high:200-b.low,low:200-b.high});
const sell=step({...base,price:200-base.price,bars:bars.map(mirror),m1Side:'SELL',m15Side:'SELL'});
assert.equal(sell.setupKind,'PULLBACK');assert.equal(sell.side,'SELL');
assert.ok(Math.abs(sell.trigger-(200-buy.trigger))<1e-9,'symmetric buy and sell logic');
assert.notEqual(step({...base,m15Side:'WAIT'})?.setupKind,'PULLBACK','no direction solely from a preceding drive');
assert.equal(step({...base,price:buy.trigger+.1}),null,'no hindsight setup after local break');
assert.equal(step({...base,bars:[...bars,{time:now-1000,open:101.4,high:buy.trigger+.2,low:101.3,close:101.4}]}),null,
 'an already-touched live edge cannot be armed on return');
const future=step({...base,bars:[...bars,{time:now+59000,open:80,high:120,low:70,close:110}]});
assert.equal(future.trigger,buy.trigger,'future candles cannot affect preparation');
const cross=step({...base,prior:buy,now:now+3000,quoteAt:now+3000,price:buy.trigger+.05});
const activated=step({...base,prior:cross,now:now+6000,quoteAt:now+6000,price:buy.trigger+.07});
assert.equal(activated.phase,'TRIGGERED');
assert.equal(signal(activated).quality,'OBSERVATION','near obstacle does not become a qualified entry');
assert.equal(step({...base,prior:buy,now:now+3000,price:buy.trigger+.05}).crossedAt,null,
 'render clock without a quote timestamp is not a price sample');
assert.equal(step({...base,prior:cross,now:now+6000,quoteAt:now+3000,price:buy.trigger+.07}).phase,'ARMED',
 'repeating one quote cannot confirm');
const flow={ready:true,side:'SELL',asOf:now+7000,observedAt:now+7000};
assert.equal(step({...base,prior:activated,now:now+8000,price:activated.priceAt,flow}).phase,'CANCELLED',
 'opposing fresh flow also invalidates an activated setup');
const lateFailure=step({...base,prior:{...activated,lastAt:now+70000},now:now+72000,
 price:buy.trigger-buy.atr*.15});
assert.equal(lateFailure.phase,'CANCELLED','failed breakout stays invalidatable after the first minute');
const invalid={...buy,phase:'CANCELLED',sourceAt:buy.sourceAt-60000};
assert.equal(step({...base,prior:invalid}).phase,'ARMED','one fresh closed bar can release cancelled setup');
assert.equal(step({...base,prior:{...invalid,sourceAt:buy.sourceAt}}).phase,'CANCELLED',
 'same source cannot continuously recycle a failed setup');
const qualified={...activated,score:6,trendSide:'BUY',priceAt:100.4,
 trigger:100.3,invalidation:100,targets:[101.2],atr:1};
assert.equal(signal(qualified).quality,'SETUP','qualified prearmed signal can reach BUY/SELL renderer');
assert.equal(signal({...qualified,trendSide:'SELL'}).quality,'COUNTERTREND');
assert.equal(signal({...qualified,targets:[]}).quality,'OBSERVATION');
assert.equal(signal({...qualified,targets:[100.5]}).quality,'OBSERVATION');
assert.equal(signal(qualified).tradeEligible,false,'chart signals never enable broker execution');
const rising=Array.from({length:18},(_,i)=>({...bars[i],open:100+i*.2,
 close:100+i*.2+.15,high:100+i*.2+.25,low:100+i*.2-.1}));
assert.equal(lean({now,price:rising.at(-1).close,m1:rising,sourceReady:true}).side,'BUY');
assert.equal(lean({now,price:rising.at(-1).low-.2,m1:rising,sourceReady:true}).side,'WAIT',
 'live quote invalidates stale bullish continuation without inventing a SELL');
console.log('PASS early upgrade: symmetric pullbacks, frozen real levels, causal quotes, recovery, flow invalidation and honest quality');
