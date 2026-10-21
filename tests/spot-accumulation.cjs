const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('typescript'),out={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/spot-accumulation.ts','utf8'),
  {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,
  {exports:out});
const now=Date.parse('2026-10-22T07:00:00Z');
function bars(){
  let p=100;
  return Array.from({length:65},(_,i)=>{
    const open=p,step=i>=60?.07:i>=55?.018:.002;
    p+=step;
    return {time:now-(65-i)*60000,open,close:p,
      high:p+.025,low:open-.025,quoteVolume:i>=60?3100:i>=55?1800:1000,
      buyQuote:i>=60?2200:i>=55?1040:490};
  });
}
function coin(opts={}){
 const candles=bars();
 return {candles,price:candles.at(-1).close,volume24h:8000000,
  change24h:2,change15m:.7,trapRisk:false,volumeImpulse:2.3,
  distancePct:.8,rangeCompression:1.1,book:{bidShare:.58,spreadBps:8},
  ...opts};
}
let r=out.spotAccumulationPulse(coin());
assert.equal(r.state,'BUY_BUILDUP','executed buys accelerate before price extension');
assert.equal(r.flowCandidate,true);assert.equal(r.adjustment,10);
assert.ok(r.netBuyQuote5m>2500);assert.ok(r.buyIntensity>2);
assert.ok(r.buyAccelerationPct>60);
assert.equal(out.spotAccumulationPulse(coin({book:null})).state,'WATCH',
  'cannot claim confirmed demand without a live depth snapshot');
assert.equal(out.spotAccumulationPulse(coin({book:{bidShare:.2,spreadBps:8}})).state,'WATCH');
assert.equal(out.spotAccumulationPulse(coin({book:{bidShare:.9,spreadBps:43}})).state,'WATCH');
assert.equal(out.spotAccumulationPulse(coin({trapRisk:true})).state,'NONE');
assert.equal(out.spotAccumulationPulse(coin({change24h:17})).state,'NONE');
assert.equal(out.spotAccumulationPulse(coin({volume24h:500000})).state,'NONE');
const wrong=bars();wrong[36].time+=1000;
assert.equal(out.spotAccumulationPulse(coin({candles:wrong})).state,'NONE');
const sellers=bars().map((x,i)=>i>=60?{...x,buyQuote:600}:x);
assert.equal(out.spotAccumulationPulse(coin({candles:sellers})).state,'NONE');
const stalled=bars().map((x,i)=>{
 if(i<60)return x;
 return {...x,open:100.5,close:100.5,low:100.45,high:100.65};
});
r=out.spotAccumulationPulse(coin({candles:stalled}));
assert.equal(r.state,'BUY_ABSORBED','heavy aggressive buys without price progress are NOT bullish confirmation');
assert.ok(r.adjustment<0);
assert.equal(out.spotAccumulationPulse(coin({book:null,candles:stalled})).state,'BUY_ABSORBED');
console.log('PASS: three-window buying acceleration and absorption-veto; no fictitious hidden orders');

const sampleStart=coin({freshAt:now});
const priorSignal=out.spotAccumulationPulse(sampleStart);
const snap=out.accumulationSample(sampleStart,priorSignal,now);
assert.ok(snap,'fresh, depth-supported BUY_BUILDUP has a snapshot');
assert.equal(out.verifySpotAccumulation(sampleStart,priorSignal,null,now).state,
  'BUY_BUILDUP','single visit cannot self-confirm');
assert.equal(out.verifySpotAccumulation(sampleStart,priorSignal,snap,now+30000).state,
  'BUY_BUILDUP','scan must be at least 65 seconds apart');
assert.equal(out.verifySpotAccumulation(sampleStart,priorSignal,snap,now+90000).state,
  'BUY_BUILDUP','reusing the same closed 1m candle must not count');
const follow=coin({freshAt:now+120000,price:sampleStart.price*1.006});
const nextSignal=out.spotAccumulationPulse(follow);
const confirmed=out.verifySpotAccumulation(follow,nextSignal,snap,now+130000);
assert.equal(confirmed.state,'BUY_PERSISTENT','fresh independent supportive scan confirms persistence');
assert.equal(confirmed.adjustment,18);
assert.equal(out.verifySpotAccumulation(
  {...follow,price:sampleStart.price*1.12},nextSignal,snap,now+130000).state,
  'BUY_BUILDUP','already-pumped price is not a quiet accumulation');
assert.equal(out.verifySpotAccumulation(
  {...follow,book:{bidShare:.3,spreadBps:8}},nextSignal,snap,now+130000).state,
  'BUY_BUILDUP','withdrawn bid support cannot confirm');
assert.equal(out.verifySpotAccumulation(follow,nextSignal,snap,now+700000).state,
  'BUY_BUILDUP','expired scan cannot confirm');
const passive=coin({candles:stalled,freshAt:now+120000});
const stalledSignal=out.spotAccumulationPulse(passive);
const fade=out.verifySpotAccumulation(passive,stalledSignal,snap,now+130000);
assert.equal(fade.state,'BUY_ABSORBED');
assert.ok(fade.adjustment<=-16,'new passive-selling evidence vetoes bullish ranking');
assert.equal(out.accumulationSample(coin({book:null,freshAt:now}),
  out.spotAccumulationPulse(coin({book:null})),now),null);
console.log('PASS: two genuinely separate Spot accumulation observations, bid/price decay and sell absorption');
