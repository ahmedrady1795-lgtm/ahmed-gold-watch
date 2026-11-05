const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const ts=require('typescript');
function load(file){
  const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
  }).outputText,{exports,Number,Math,Date},{filename:file});
  return exports;
}
const {inspectM1Intrabar}=load('lib/sniper-m1-intrabar-pulse.ts');
const {updateSampledLiveCandle}=load('lib/sampled-live-candle.ts');
const T=Date.parse('2026-11-05T11:50:00Z');
const forecast={side:'BUY',issuedAt:T,anchorTime:T-60000,
  atr:1,pressure:47,weak:true,pattern:'MOMENTUM'};
const quote=(at,price)=>({
  now:at,at,price,sourceKey:'Exness/MT5',historicalSource:'Exness/MT5',
  lastClosedAt:T
});
let candle=updateSampledLiveCandle(null,quote(T+100,100));
assert.ok(candle&&candle.matchedVenue);
let reading=inspectM1Intrabar({forecast,sampled:candle,
  anchorClose:100,now:T+100});
assert.equal(reading.status,'FIRST_TICK');
candle=updateSampledLiveCandle(candle,quote(T+400,100.26));
reading=inspectM1Intrabar({forecast,sampled:candle,
  anchorClose:100,now:T+400});
assert.equal(reading.status,'ALIGNED');
assert.equal(reading.forecastSide,'BUY');
assert.equal(reading.observedSide,'BUY');
assert.equal(reading.ticks,2);
assert.equal(forecast.side,'BUY','live observations cannot rewrite issued side');
const same=updateSampledLiveCandle(candle,quote(T+400,99.1));
assert.strictEqual(same,candle,'duplicate timestamp cannot change tick history');
const reversal=updateSampledLiveCandle(candle,quote(T+700,99.72));
reading=inspectM1Intrabar({forecast,sampled:reversal,
  anchorClose:100,now:T+700});
assert.equal(reading.status,'COUNTER');
assert.equal(reading.forecastSide,'BUY');
assert.equal(reading.observedSide,'SELL');
const faded={...candle,high:100.44,low:100,close:100.15,
  count:5,lastAt:T+1100};
assert.equal(inspectM1Intrabar({forecast,sampled:faded,
 anchorClose:100,now:T+1100}).status,'FADING',
 'the observed high is not a guaranteed fill, but a later retreat is visible');
const flat={...candle,high:100.08,low:100,close:100.04};
assert.equal(inspectM1Intrabar({forecast,sampled:flat,
 anchorClose:100,now:T+400}).status,'NOISE');
const short=inspectM1Intrabar({forecast,sampled:null,
 anchorClose:100,now:T+400});
assert.equal(short.status,'UNAVAILABLE');
assert.equal(short.forecastSide,'BUY','missing tick never discards the frozen forecast');
const input={forecast,sampled:candle,anchorClose:100,now:T+400};
for(const broken of [
 {...input,sampled:{...candle,matchedVenue:false}},
 {...input,sampled:{...candle,time:T-60000}},
 {...input,sampled:{...candle,lastAt:T-11000},now:T+400},
 {...input,now:T+60000},
 {...input,anchorClose:null},
 {...input,sampled:{...candle,close:NaN}},
 {...input,forecast:{...forecast,issuedAt:T+60000}}
]){
 assert.equal(inspectM1Intrabar(broken).status,'UNAVAILABLE',
 'untrusted/stale/unclosed data cannot claim real-time alignment');
}
const sell={...forecast,side:'SELL'};
assert.equal(inspectM1Intrabar({forecast:sell,sampled:reversal,
 anchorClose:100,now:T+700}).status,'ALIGNED',
 'short direction is evaluated symmetrically');
const panel=fs.readFileSync('components/SniperM1CandleHunter.tsx','utf8');
const component=fs.readFileSync('components/SniperM1IntrabarPulse.tsx','utf8');
assert.match(panel,/SniperM1IntrabarPulse forecast=\{liveEligible\?every:null\}/);
assert.match(component,/updateSampledLiveCandle\(prev/);
assert.match(component,/freshM1QuoteForWatch/);
assert.match(component,/visibleSampledLiveCandle/);
assert.match(component,/inspectM1Intrabar\(/);
assert.doesNotMatch(component,/placeOrder|sendOrder|executeTrade|MARKET_ORDER/,
 'observations must be isolated from broker execution');
console.log('PASS: M1 frozen forecasts, responsive intrabar pulse, freshness/source gaps, no repaint and no broker fills');
