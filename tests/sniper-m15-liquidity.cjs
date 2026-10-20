const assert=require('node:assert/strict'),fs=require('node:fs'),
 vm=require('node:vm'),ts=require('typescript');
const module_={exports:{}};
vm.runInNewContext(ts.transpileModule(
 fs.readFileSync('lib/sniper-m15-liquidity.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:module_,exports:module_.exports});
const build=module_.exports.buildSniperM15Liquidity;
const compact=module_.exports.compactM15ZoneAnnotations;
const now=Date.parse('2026-10-19T15:00:00Z');
const data=Array.from({length:48},(_,i)=>{
 const open=100+Math.sin(i*.38)*.75;
 const close=open+Math.cos(i*.43)*.17;
 return {time:now-(48-i)*900000,open,close,
   high:Math.max(open,close)+.26,low:Math.min(open,close)-.24};
});
const ctx={low:99.1,high:100.7,from:now-6*900000,
 to:now-900000,label:'تجميع محتمل',kind:'ACCUMULATION'};
const fourHour={ready:true,phase:'تجميع محتمل',
 zones:[
 {side:'BUY',low:99.1,high:99.55,source:'M5_PIVOT',confirmedAt:now-3600000},
 {side:'SELL',low:100.65,high:101.15,source:'M5_PIVOT',confirmedAt:now-2700000},
 {side:'BUY',low:99.1,high:99.55,source:'duplicated',confirmedAt:now-3600000},
 {side:'SELL',low:102.2,high:98.3,source:'bad range',confirmedAt:now-3600000},
 {side:'BUY',low:99,high:99.3,source:'future',confirmedAt:now+300000}
 ],contextBox:ctx,
 events:[
 {kind:'SWEEP_LOW',at:now-3000000,confirmedAt:now-2700000,
  price:99.25,level:99.3,label:'سحب سيولة قاع'},
 {kind:'BOS_UP',at:now-1500000,confirmedAt:now-1200000,
  price:100.3,level:100.1,label:'كسر صاعد'},
 {kind:'BOS_DOWN',at:now-600000,confirmedAt:now+300000,
  price:99.8,level:100.1,label:'غير مؤكد'},
 ]};
const pools={ready:true,upper:{low:101.4,high:101.7},
 lower:{low:98.7,high:99.0}};
const common={now,price:100,history:data,sourceReady:true,
 fourHour,pools};
const x=build(common);
assert.equal(x.ready,true,x.reason);
assert.equal(x.context.kind,'ACCUMULATION');
assert.equal(x.context.label,'تجميع محتمل');
assert.equal(x.events.length,2,'never plot future unconfirmed sweep/BOS');
assert.equal(x.zones.some(z=>z.kind==='DEMAND'),true);
assert.equal(x.zones.some(z=>z.kind==='SUPPLY'),true);
assert.equal(x.zones.some(z=>z.kind==='HIGH_POOL'),true);
assert.equal(x.zones.some(z=>z.kind==='LOW_POOL'),true);
assert.equal(x.zones.filter(z=>z.kind==='DEMAND').length,1,
 'deduplicate overlapping price-true pivot liquidity levels');
assert.ok(x.zones.every(z=>z.low<=z.high&&z.high>0));
assert.equal(build({...common,sourceReady:false}).zones.length,0);
assert.equal(build({...common,history:data.slice(0,5)}).ready,false);
assert.equal(build({...common,now:now+50*60000}).ready,false,
 'stale M15 cannot paint confirmed liquidity');
const gap=data.map(v=>({...v}));gap[gap.length-3].time+=1000;
assert.equal(build({...common,history:gap}).ready,false);
const futureBox=build({...common,fourHour:{...fourHour,contextBox:{
 ...ctx,to:now+3600000
}}});
assert.equal(futureBox.context,null,'future consolidation box is rejected');
const noH4=build({...common,fourHour:{ready:false},pools:null});
assert.equal(noH4.context,null,'do not invent accumulation when H4 was not qualified');
assert.equal(noH4.events.length,0);
assert.match(noH4.phase,/M15 فقط/);
const clustered=compact([
 {kind:'DEMAND',low:100,high:100.1,label:'طلب',source:'M15',confirmedAt:now},
 {kind:'LOW_POOL',low:100.15,high:100.25,label:'سيولة قيعان',source:'M5',confirmedAt:null},
 {kind:'SUPPLY',low:102,high:102.2,label:'عرض',source:'M15',confirmedAt:now},
 {kind:'HIGH_POOL',low:104.2,high:104.3,label:'سيولة قمم',source:'M5',confirmedAt:null}
],100.5,p=>500-(p-100)*100,3,30);
assert.ok(clustered.length<=3,'only three compact annotations should paint over candles');
assert.ok(clustered.some(z=>z.count===2&&z.kind==='MIXED'&&z.label.includes('×2')),
 'overlapping demand and low-side liquidity share one badge');
assert.ok(clustered.find(z=>z.count===2).detail.includes('100.00'),
 'full underlying price levels remain available in a tooltip');
assert.equal(compact([],100,p=>p).length,0);
// Reactions must require an observed sweep AND later fully closed follow-through.
const start=now-52*900000;
const bars=Array.from({length:52},(_,i)=>({
 time:start+i*900000,open:100,close:100.04,high:100.18,low:99.86
}));
bars[43]={time:start+43*900000,open:100.05,close:100.14,high:100.26,low:99.25};
bars[44]={time:start+44*900000,open:100.14,close:100.32,high:100.38,low:100.03};
const got=build({...common,history:bars,price:100.4,
 fourHour:{ready:false},pools:null});
const rebound=got.zones.find(z=>z.kind==='REBOUND_UP');
assert.ok(rebound,'a completed sweep plus bullish follow-through must show bounce');
assert.equal(rebound.invalidation,99.25);
assert.ok(rebound.confirmedAt<=now);
assert.ok(!build({...common,history:bars.slice(0,44),
 now:bars[43].time+900000,price:100.4,fourHour:{ready:false},pools:null})
 .zones.some(z=>z.kind==='REBOUND_UP'),'a sweep alone is not a confirmed bounce');
const broken=bars.map(b=>({...b}));
broken[50]={...broken[50],open:100,high:100.15,low:99,close:99.15};
assert.ok(!build({...common,history:broken,price:100.4,
 fourHour:{ready:false},pools:null}).zones.some(z=>z.kind==='REBOUND_UP'),
 'a closed breach must invalidate the observed bounce');
const bear=bars.map(b=>({...b}));
bear[43]={time:start+43*900000,open:100.1,close:99.9,high:101.2,low:99.8};
bear[44]={time:start+44*900000,open:99.9,close:99.7,high:100,low:99.66};
assert.ok(build({...common,history:bear,price:99.6,fourHour:{ready:false},pools:null})
 .zones.some(z=>z.kind==='REBOUND_DOWN'),'downward rejection must be symmetric');
assert.ok(compact(got.zones,100.4,p=>500-(p-100)*100)
 .some(z=>z.label.includes('ارتداد')),'rebound should remain visible near demand');

const chart=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const css=fs.readFileSync('app/workspace.css','utf8');
assert.match(chart,/buildSniperM15Liquidity/);
assert.match(chart,/buildChartOverlay/);
assert.match(chart,/liquidity\.zones\.map/);
assert.match(chart,/liquidity\.context/);
assert.match(chart,/liquidity\.events\.map/);
assert.match(chart,/sniper-m15-liquidity-toggle/);
assert.match(chart,/aria-pressed=\{showLiquidity\}/);
assert.match(chart,/scaleLevels\.map/,'keep the original target/invalidation scale');
assert.match(css,/\.sniper-m15-liquidity-toggle/);

// Buyer/seller zones are exact price bands from closed history, not fake DOM.
const boardModule={exports:{}};
vm.runInNewContext(ts.transpileModule(
 fs.readFileSync('lib/sniper-m15-liquidity-board.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:boardModule,exports:boardModule.exports});
const makeBoard=boardModule.exports.buildM15LiquidityBoard;
const flat=data.map(b=>({...b,open:100,high:100.3,low:99.7,close:100}));
const sampleBoard=makeBoard({now,price:100,history:flat,liquidity:x,
 watch:{ready:true,upper:[{price:102.4}],lower:[{price:98.4}],atr:1,asOf:now,reason:''}});
assert.equal(sampleBoard.ready,true);
assert.equal(sampleBoard.items.length,4,'sell buy upper and lower liquidity all visible');
assert.equal(sampleBoard.items[0].key,'SELL');
assert.equal(sampleBoard.items[0].low,100.65,'sell price band is not a projection');
assert.equal(sampleBoard.items[1].high,99.55,'buy price band from closed OHLC');
assert.equal(sampleBoard.items[2].low,101.4,'upper stop pool keeps exact bounds');
assert.equal(sampleBoard.items[3].low,98.7,'lower stop pool keeps exact bounds');
assert.equal(sampleBoard.context.label,'تجميع سعري مرصود');
const breaker=flat.map(b=>({...b}));
breaker[breaker.length-1]={...breaker.at(-1),high:101.65,close:101.50};
const brokenBoard=makeBoard({now,price:100,history:breaker,liquidity:x,
 watch:{ready:false,upper:[],lower:[],atr:null,asOf:null,reason:''}});
assert.equal(brokenBoard.items[0].low,null,
 'sell area must vanish after a subsequent closed M15 breaks above supply');
const unavailable=makeBoard({now,price:100,history:flat,
 liquidity:build({...common,sourceReady:false}),
 watch:{ready:false,upper:[],lower:[],atr:null,asOf:null,reason:''}});
assert.equal(unavailable.ready,false);
assert.ok(unavailable.items.every(i=>i.low===null),'stale inputs must never show old prices');
assert.match(chart,/buildM15LiquidityBoard/);
assert.match(chart,/sniper-m15-board-grid/);
assert.match(fs.readFileSync('app/gold-sniper-radar.css','utf8'),
 /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,
 'mobile readout must not block the same-size MetaTrader candles');


const cleanCss=fs.readFileSync('app/gold-sniper-radar.css','utf8');
assert.match(chart,/const \[showExtra,setShowExtra\]=useState\(false\)/,
 'the first view must not be dominated by secondary annotations');
assert.match(chart,/data-clean=\{!showExtra\}/,
 'clean annotations are an explicit visual mode, never price data changes');
assert.match(chart,/showLiquidity&&showExtra&&<div className="sniper-m15-watch-strip"/,
 'the redundant liquidity strip must not steal candle space by default');
assert.match(chart,/sniper-m15-extra-toggle/,
 'secondary BOS, microstructure and pattern marks stay available on request');
assert.match(cleanCss,/\[data-clean="true"\] \.sniper-m15-reaction-mark/,
 'rejection icons hidden until requested');
assert.match(cleanCss,/\[data-clean="true"\] \.sniper-m15-rail-turn/,
 'secondary price rail notes hidden until requested');
assert.match(cleanCss,/\[data-clean="true"\] \.sniper-flow-radar-chip/,
 'chart-side secondary radar chip must not obstruct classic candles');
assert.doesNotMatch(cleanCss,/\[data-clean="true"\] \.sniper-m15-(real|projected)\b/,
 'clean mode must never hide true or projected OHLC');

console.log('PASS: M15 supply/demand, liquidity pools, true accumulation box, confirmed sweeps/BOS, freshness & mobile toggle');
