const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/sniper-m15-scenario.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:mod,exports:mod.exports});
const {closedM15Bars,buildM15Scenario,sampledLiveM15,observeM15Tick}=mod.exports;
const last=Date.parse('2026-10-19T12:00:00Z')-900000;
const start=last-209*900000;
let p=4100;const raw=[];
for(let i=0;i<210;i++){
 const open=p,delta=(i%12===7?-.9:i%12===9?-.3:.6)+.2*Math.sin(i*.7);
 const close=open+delta,high=Math.max(open,close)+.45+(i%3)*.09;
 const low=Math.min(open,close)-.4-(i%5)*.04;
 raw.push({time:start+i*900000,open,high,low,close});
 p=close;
}
const now=last+900000+1000,price=raw.at(-1).close;
const live=closedM15Bars(raw,now);
assert.equal(live.length,210);
assert.equal(closedM15Bars([...raw,{...raw.at(-1),time:now+900000}],now).length,210);
const common={history:raw,now,anchor:price,side:'BUY',targets:[
 {price:price+2},{price:price+6},{price:price+30}],steps:36};
const a=buildM15Scenario(common);
assert.equal(a.ready,true,a.reason);
const shortClassic=buildM15Scenario({...common,steps:12});
const longerClassic=buildM15Scenario({...common,steps:48});
assert.ok(shortClassic.ready&&longerClassic.ready,
 'classic 48-slot chart must be based on a real valid analogue');
assert.ok(longerClassic.bars.length>=shortClassic.bars.length);
assert.equal(JSON.stringify(longerClassic.bars.slice(0,shortClassic.bars.length)),
 JSON.stringify(shortClassic.bars),
 'the old 48-bar view must NEVER alter the originally scored first 12 bars');

// A visually honest forecast needs a directional analogue, not permission
// from a separate execution plan, fabricated targets or fabricated orders.
assert.equal(buildM15Scenario({...common,steps:12,targets:[]}).ready,false,
 'default entry-oriented engine still rejects no-target requests');
const noTarget=buildM15Scenario({...common,steps:12,
 targets:[],allowNoTargets:true,stop:null});
assert.equal(noTarget.ready,true,
 'analysis-only scenario may show actual historical analogue OHLC without TP');
assert.equal(noTarget.touches.length,0,
 'zero audited TP touches when there are zero real structural goals');
assert.equal(noTarget.bars[0].open,price,
 'read-only illustration starts from real observed price, not a synthetic level');
assert.ok(noTarget.bars.every(b=>b.source==='HISTORICAL_ANALOGUE'));

assert.ok(a.bars.length>10);
assert.equal(a.origin,'RECENT_M15');
assert.equal(a.archiveYears,0);
assert.equal(a.bars[0].open,price);
assert.ok(a.bars.every((b,i)=>b.high>=Math.max(b.open,b.close)&&
 b.low<=Math.min(b.open,b.close)&&b.low>0&&
 (i===0||Math.abs(b.open-a.bars[i-1].close)<1e-9)));
const changed=buildM15Scenario({...common,targets:[{price:price+10},{price:price+100}]});
assert.equal(JSON.stringify(changed.bars),JSON.stringify(a.bars),
 'targets must never reshape the projected OHLC');
for(const touched of a.touches){
 const g=common.targets[touched-1].price;
 assert.ok(a.bars.some(b=>b.low<=g&&b.high>=g),
   'an indicated TP needs a real intersecting projected wick');
}
// A fitted six-candle historical motif may trend BUY eventually but touch
// the SELL/BUY original stop in its first candle. Such paths are rejected
// BEFORE drawing, not shown as oversized 4-bar "forecasts" until failure.
const buyerStop=price-.35;
const defended=buildM15Scenario({...common,stop:buyerStop});
assert.equal(defended.stopped,false,
 'an invalidated path must never be presented as an active scenario');
assert.ok(!defended.ready||defended.bars.every(b=>b.low>buyerStop),
 'every displayed forward wick remains on the viable side of original stop');
const sellerStop=price+.35;
const defendedSell=buildM15Scenario({...common,side:'SELL',
 targets:[{price:price-2},{price:price-6}],stop:sellerStop});
assert.equal(defendedSell.stopped,false);
assert.ok(!defendedSell.ready||defendedSell.bars.every(b=>b.high<sellerStop),
 'SELL analogue cannot rise through its own stop before the target');
assert.equal(defendedSell.ready||defendedSell.bars.length===0,true);
assert.equal(buildM15Scenario({...common,side:'WAIT'}).ready,false);
assert.equal(buildM15Scenario({...common,now:now+40*60000}).ready,false,
 'stale M15 is not a live scenario');
assert.equal(buildM15Scenario({...common,targets:[{price:price-1}]}).ready,false);
assert.equal(buildM15Scenario({...common,stop:price+1}).ready,false);
const gap=raw.map(x=>({...x}));gap[gap.length-7].time+=1000;
assert.equal(buildM15Scenario({...common,history:gap}).ready,false);
const localM1=Array.from({length:5},(_,i)=>({
 time:Math.floor(now/900000)*900000+i*60000,
 open:4200+i,close:4200+i+.5,high:4201+i,low:4199+i
}));
const liveSample=sampledLiveM15(localM1,localM1.at(-1).time+60000);
assert.equal(liveSample.minutes,5);
assert.equal(liveSample.open,4200);
assert.equal(liveSample.partial,true);
assert.equal(sampledLiveM15([],now),null);
const candleStart=Math.floor(now/900000)*900000;
const quotedAt=candleStart+5*60000+5100;
const observed=observeM15Tick(null,{now:quotedAt+200,at:quotedAt,
 price:4206,source:'Coinbase WebSocket',historySource:'Coinbase BTC-USD'});
assert.equal(observed.count,1);
const observed2=observeM15Tick(observed,{now:quotedAt+1100,at:quotedAt+1000,
 price:4209,source:'Coinbase WebSocket',historySource:'Coinbase BTC-USD'});
assert.equal(observed2.high,4209);
const evolved=sampledLiveM15(localM1,quotedAt+1200,observed2,'Coinbase BTC-USD');
assert.equal(evolved.close,4209,'sampled tick updates the M15 close before next M1');
assert.equal(evolved.high,4209,'sampled tick extends the partial wick');
assert.equal(evolved.sampledTicks,2);
assert.equal(sampledLiveM15(localM1,quotedAt+1200,observed2,'Kraken XBT/USD').close,4204.5);
assert.equal(observeM15Tick(observed2,{now:quotedAt+1200,at:quotedAt+1100,
 price:4300,source:'Kraken XBT/USD',historySource:'Coinbase BTC-USD'}),null);
assert.equal(sampledLiveM15([],quotedAt+30000,observed2,'Coinbase BTC-USD'),null);
// A gap in M1 must not freeze a verified live M15 tick, or fabricate OHLC.
const gapBars=[localM1[0],localM1[2],localM1[3]];
assert.equal(sampledLiveM15(gapBars,quotedAt+1200,null,'Coinbase BTC-USD'),null);
const gapPartial=sampledLiveM15(gapBars,quotedAt+1200,observed2,'Coinbase BTC-USD');
assert.equal(gapPartial.minutes,0,'gapped minute bars must never be treated as complete');
assert.equal(gapPartial.sampledTicks,2);
assert.equal(gapPartial.open,4206);
assert.equal(gapPartial.high,4209);
assert.equal(gapPartial.close,4209);
assert.equal(sampledLiveM15(gapBars,quotedAt+1200,observed2,'Biquote · MT5 XAUUSD'),null,
 'cannot substitute another venue for missing XAUUSD OHLC');
const chartAfterGap=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
assert.match(chartAfterGap,/const formingVisible=Boolean\(forming&&!providerTransition&&/);
assert.match(chartAfterGap,/const validLive=formingVisible&&m\.historyFresh&&m\.sniper\.view\.priceFresh;/,
 'historical feed gaps may show true live ticks but never bypass forecast requirements');
const chart=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const wrapper=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
const css=fs.readFileSync('app/workspace.css','utf8');
assert.match(wrapper,/return <SniperM15Panel \{\.\.\.props\}\/>/,
 'legacy M1 screen must not be the active rendered sniper');
assert.match(chart,/chartHigherFrames\?\.m15/,
 'real M15 historical source is selected, never M1 renamed M15');
assert.match(chart,/<SniperLiquidityDecisionMap watch=\{watchMap\}/,
 'M15 forward lane renders verified liquidity levels, never synthetic candles');
assert.doesNotMatch(chart,/renderedBars\.map|<SniperM15HuntOverlay/,
 'future candle simulation is no longer part of the live UI');
assert.match(chart,/trueHistory\.map\(\(b,i\)=>candle/,
 'historical M15 OHLC remains authentic');
assert.match(chart,/forecast:\[\]/,
 'future OHLC cannot distort real-price scaling');
assert.match(chart,/const min=important\.length\?Math\.min\(\.\.\.important\)/);
assert.match(chart,/const max=important\.length\?Math\.max\(\.\.\.important\)/);
assert.match(chart,/formingVisible&&forming\?\[forming\.open,forming\.high,forming\.low,forming\.close\]/);
assert.match(chart,/const W=430,H=704,left=8,split=215,end=422/);
assert.match(chart,/steps:12/,'immutable original hypothesis still recorded for forward scoring');
assert.match(chart,/compactM15ZoneAnnotations/);
assert.match(chart,/className="sniper-m15-liquidity-label"/);
assert.match(css,/\.sniper-m15-chart-box\{width:100%;height:clamp\(/);
const map=fs.readFileSync('components/SniperLiquidityDecisionMap.tsx','utf8');
assert.match(map,/watch\.upper\.slice\(0,2\)/);
assert.match(map,/watch\.lower\.slice\(0,2\)/);
const actualSummary=fs.readFileSync('components/SniperM15Summary.tsx','utf8');
const theme=fs.readFileSync('app/m15-scenario-first.css','utf8');
const layout=fs.readFileSync('app/layout.tsx','utf8');
const summaryPos=chart.indexOf('<SniperM15Summary');
const chartPos=chart.indexOf('className="sniper-m15-chart-box"');
const diagnosticPos=chart.indexOf('className="sniper-m15-diagnostics"');
assert.ok(summaryPos>0&&summaryPos<chartPos);
assert.ok(diagnosticPos>chartPos);
assert.match(actualSummary,/خريطة سيولة M15/);
assert.match(theme,/\.sniper-m15-scenario-summary/);
assert.match(layout,/m15-scenario-first\.css/);
console.log('PASS: authentic M15 candles, scored frozen hypotheses and observed level-map UI');
