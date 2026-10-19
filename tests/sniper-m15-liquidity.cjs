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
console.log('PASS: M15 supply/demand, liquidity pools, true accumulation box, confirmed sweeps/BOS, freshness & mobile toggle');
