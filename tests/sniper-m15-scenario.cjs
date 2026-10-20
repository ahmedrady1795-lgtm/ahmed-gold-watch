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
const chart=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const wrapper=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
const css=fs.readFileSync('app/workspace.css','utf8');
assert.match(wrapper,/return <SniperM15Panel \{\.\.\.props\}\/>/,
 'legacy M1 screen must not be the active rendered sniper');
assert.match(chart,/chartHigherFrames\?\.m15/,
 'real M15 historical source is selected, never M1 renamed M15');
assert.match(chart,/shownBars\.map/);
assert.match(chart,/scaleLevels\.map/);
assert.match(chart,/const min=important\.length\?Math\.min\(\.\.\.important\)/,
 'M15 viewport minimum must come from observed prices when LIVE is unavailable');
assert.match(chart,/const max=important\.length\?Math\.max\(\.\.\.important\)/,
 'M15 viewport maximum must come from observed prices when LIVE is unavailable');
assert.doesNotMatch(chart,/Math\.min\(\.\.\.important,anchor\?\?1\)/,
 'No $1 synthetic fallback may collapse an 81k BTC candle chart to zero');
assert.match(chart,/formingVisible&&forming\?\[forming\.open,forming\.high,forming\.low,forming\.close\]/,
 'Observed live M15 OHLC must share the exact price scale with closed candles');
assert.match(chart,/scenario|سيناريو/);
assert.doesNotMatch(chart,/AI NEXT|LIVE M1|محرك الاستراتيجيات يعمل|آخر شمعة/);
assert.match(css,/\.sniper-m15-chart-box\{width:100%;height:clamp\(/);
// Exact-price mobile rail and RTL placement must survive source refactors.
assert.match(chart,/left=8,split=184,end=357,axis=359/,
 'a wider, bounded price rail reserves room for complete target values');
assert.match(chart,/railGap=29/,
 'price labels are separated instead of being drawn over each other');
assert.match(chart,/!reserved\.some\(y=>Math\.abs\(y-py\(v\)\)<13\)/,
 'background price ticks cannot be printed over TP / stop labels');
assert.match(chart,/const y=zoneLabelPoints\[i\]\.y,xBadge=split-7/,
 'Compact Arabic zone labels no longer need rectangle badges');
assert.match(chart,/x2=\{split-4\} y1=\{top\} y2=\{top\}/,
 'historical liquidity ranges use thin boundaries, not filled boxes');
assert.match(chart,/const compactZones=compactM15ZoneAnnotations/,
 'only compact nonboxed demand and supply word labels are shown');
assert.match(chart,/textAnchor="start" direction="ltr">\{h\(trueHistory/,
 'left time axis cannot paint Arabic-direction text outside SVG');
assert.match(css,/grid-template-areas:"asset frame liquidity" "price price bias"/,
 'mobile toolbar must wrap to two rows without clipping the market bias');
assert.match(css,/width:100%!important;max-width:100%!important/,
 'no negative-margin overscroll that truncates target labels');
assert.match(chart,/steps:12/,'short original 12-candle scenario is frozen and scored across future closes');
assert.match(chart,/fillOpacity=\{future\?/,
 'the future wick/body is visually distinct, because it is only a simulation');
assert.match(chart,/strokeDasharray=\{future\?'2 2':undefined\}/,
 'hypothetical wicks are dashed, while observed M15 candles remain solid');
assert.match(chart,/compactM15ZoneAnnotations/,'nearby liquidity labels are grouped, not drawn on top of one another');
assert.doesNotMatch(chart,/sniper-m15-caption|sniper-m15-status/,
 'no technical paragraphs or scorecard underneath the mobile chart');
assert.doesNotMatch(chart,/className="sniper-m15-price"/,
 'large duplicated live price must not occupy the header');
assert.match(chart,/W=430,H=704,left=8,split=184,end=357,axis=359/,
 'price column shrinks while real and projected candle viewport expands');
assert.match(css,/Compact full-canvas sniper v3/);
assert.match(css,/display:flex!important;flex-direction:row;flex-wrap:nowrap/,
 'sniper header must use one short mobile row');
assert.match(css,/height:clamp\(530px,calc\(100dvh - 192px\),900px\)!important/,
 'chart takes reclaimed vertical space and responds to viewport');
assert.match(css,/\.sniper-m15-caption,\.sniper-m15-status\{display:none!important\}/,
 'all former diagnostic footers must remain invisible on mobile');
console.log('PASS: M15 historical OHLC, real partial source, scenario motifs, 3 TP levels, no fabricated touches and chart-first UI');
