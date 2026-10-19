const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/sniper-m15-scenario.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:mod,exports:mod.exports});
const {closedM15Bars,buildM15Scenario,sampledLiveM15}=mod.exports;
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
const chart=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const wrapper=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
const css=fs.readFileSync('app/workspace.css','utf8');
assert.match(wrapper,/return <SniperM15Panel \{\.\.\.props\}\/>/,
 'legacy M1 screen must not be the active rendered sniper');
assert.match(chart,/chartHigherFrames\?\.m15/,
 'real M15 historical source is selected, never M1 renamed M15');
assert.match(chart,/projected\.bars\.map/);
assert.match(chart,/scaleLevels\.map/);
assert.match(chart,/scenario|سيناريو/);
assert.doesNotMatch(chart,/AI NEXT|LIVE M1|محرك الاستراتيجيات يعمل|آخر شمعة/);
assert.match(css,/\.sniper-m15-chart-box\{width:100%;height:clamp\(/);
console.log('PASS: M15 historical OHLC, real partial source, scenario motifs, 3 TP levels, no fabricated touches and chart-first UI');
