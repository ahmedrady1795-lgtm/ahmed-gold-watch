const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/sniper-radar-next-candle.ts','utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText,{module:mod,exports:mod.exports});
const decide=mod.exports.assessRadarNextCandle;
const now=1800000000000;
const radar={phase:'CONFIRMED',side:'BUY',delta:-61,imbalance:44,
 confirm:100.1,invalidate:99.9,since:now-60000,replenishments:3};
const m1={qualified:true,lastClosedAt:now-30000,reason:'qualified'};
const base={asset:'BTC',candleSource:'Coinbase BTC-USD',side:'BUY',price:100.3,
 priceFresh:true,now,radar,m1};
assert.equal(decide(base).phase,'VERIFIED');
assert.equal(decide(base).actionable,false,'radar cannot execute trades');
assert.equal(decide({...base,m1:{...m1,lastClosedAt:now-70000}}).phase,'WAIT_M1',
 'pre-radar M1 confirmation is invalid');
assert.equal(decide({...base,m1:{...m1,qualified:false,reason:'weak body'}}).phase,'WAIT_M1');
assert.equal(decide({...base,radar:{...radar,phase:'PREPARE'}}).phase,'PREPARE');
assert.equal(decide({...base,side:'SELL'}).phase,'CONFLICT');
assert.equal(decide({...base,side:'WAIT'}).phase,'WATCH');
assert.equal(decide({...base,radar:{...radar,phase:'INVALIDATED'}}).phase,'CANCELLED');
assert.equal(decide({...base,radar:{...radar,phase:'EXPIRED'}}).phase,'CANCELLED');
assert.equal(decide({...base,price:99.9}).phase,'CANCELLED');
assert.equal(decide({...base,radar:{...radar,since:now-130000}}).phase,'CANCELLED');
assert.equal(decide({...base,candleSource:'Kraken BTC'}).phase,'UNAVAILABLE');
assert.equal(decide({...base,candleSource:'Coinbase / Kraken'}).phase,'UNAVAILABLE');
assert.equal(decide({...base,candleSource:''}).phase,'UNAVAILABLE');
assert.equal(decide({...base,priceFresh:false}).phase,'UNAVAILABLE');
assert.equal(decide({...base,asset:'GOLD'}).phase,'UNAVAILABLE');
assert.equal(decide({...base,radar:null}).phase,'UNAVAILABLE');
assert.equal(decide({...base,radar:{...radar,phase:'OFFLINE'}}).phase,'UNAVAILABLE');
assert.equal(decide({...base,radar:{...radar,confirm:null}}).phase,'UNAVAILABLE');
const chart=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
assert.match(chart,/assessRadarNextCandle/,'the first candle is assessed against radar evidence');
assert.match(chart,/assessSniperEntryCandle/,'closed M1 candle is independently checked');
assert.match(chart,/firstRadarCandle/,'decision is drawn above first projected candle');
assert.match(chart,/validLive&&forming&&candle\(forming\.open/,'live M15 has a real OHLC body');
const display=fs.readFileSync('components/OrderFlowRadar.tsx','utf8');
assert.match(display,/onView\?\./,'radar state reaches M15 decision');
console.log('PASS: radar/M1 two-source first-candle confirmation, expiry, venue isolation and OHLC');
