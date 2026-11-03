const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file){
 const mod={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{
   compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
 }).outputText,{module:mod,exports:mod.exports},{filename:file});
 return mod.exports;
}
const {mt5M15Viewport}=load('lib/sniper-m15-mt5-viewport.ts');
const {placeHuntWaypoints}=load('lib/sniper-m15-hunt-preview.ts');
const base=Date.parse('2026-11-03T00:00:00Z');
const bars=Array.from({length:72},(_,i)=>{
 const close=3930+(i-50)*.08;
 const open=close-.06;
 return {time:base+i*900000,open,high:close+.3,low:open-.28,close};
});
// An old extreme (as in the user's screenshot) must not flatten the NEW
// watch candles into a nearly straight line.
bars[25].high=3985;
bars[25].close=3936;
bars[25].open=3932;
bars[25].low=3931;
const before=JSON.stringify(bars);
const visible=bars.slice(-18),last=visible.at(-1).close;
const up=Array.from({length:6},(_,i)=>{
 const open=last+i*.35,close=last+(i+1)*.35;
 return {time:base+(72+i)*900000,open,close,low:open-.15,high:close+.18};
});
const down=Array.from({length:6},(_,i)=>{
 const open=last-i*.35,close=last-(i+1)*.35;
 return {time:base+(72+i)*900000,open,close,low:close-.18,high:open+.15};
});
const all=mt5M15Viewport({mode:'ALL',allLow:Math.min(...bars.map(b=>b.low)),
 allHigh:Math.max(...bars.map(b=>b.high)),lastPrice:last,history:bars,
 forecast:[...up,...down],atr:1.2});
const focus=mt5M15Viewport({mode:'FOCUS',allLow:Math.min(...bars.map(b=>b.low)),
 allHigh:Math.max(...bars.map(b=>b.high)),lastPrice:last,history:visible,
 forecast:[...up,...down],atr:1.2});
assert.equal(focus.zoomed,true);
assert.equal(all.zoomed,false);
assert.ok(focus.hi-focus.lo<(all.hi-all.lo)*.32,
 'old historical spike can no longer flatten nearby actual and simulated candles');
assert.ok(focus.lo<=Math.min(...visible.map(b=>b.low),...down.map(b=>b.low)));
assert.ok(focus.hi>=Math.max(...visible.map(b=>b.high),...up.map(b=>b.high)));
assert.equal(JSON.stringify(bars),before,
 'zoom must not change or reconstruct even one real closed M15 candle');
const ready={
 ready:true,buy:up.map((b,i)=>({...b,side:'BUY',step:i+1,illustrative:true})),
 sell:down.map((b,i)=>({...b,side:'SELL',step:i+1,illustrative:true}))
};
const plotTop=26,plotBottom=671;
const py=price=>plotTop+(focus.hi-price)/(focus.hi-focus.lo)*(plotBottom-plotTop);
const marks=placeHuntWaypoints(ready,py,plotTop,plotBottom);
assert.equal(marks.length,4,'two projected stations per direction must be present');
assert.equal([...marks].map(m=>m.side+'-'+m.stage).sort().join(','),
 ['BUY-1','BUY-2','SELL-1','SELL-2'].sort().join(','));
for(const m of marks){
 assert.ok(m.labelY>=plotTop+16&&m.labelY<=plotBottom-8);
 assert.equal(m.lineY,py(m.price),
   'the price line stays on the TRUE watch-price coordinate, only label shifts');
}
for(let i=1;i<marks.length;i++)
 assert.ok(marks[i].labelY-marks[i-1].labelY>=15.99,
   'small-screen target badges must never overlap');
assert.equal(placeHuntWaypoints({...ready,ready:false},py,plotTop,plotBottom).length,0,
 'not-ready scenarios must not synthesize price targets');
assert.equal(placeHuntWaypoints(ready,py,plotTop,plotTop+30).length,0);
const panel=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const overlay=fs.readFileSync('components/SniperM15HuntOverlay.tsx','utf8');
const style=fs.readFileSync('app/hunter-cockpit-layout.css','utf8');
assert.match(panel,/const \[focusView,setFocusView\]=useState\(true\)/,
 'on mobile the first M15 screen must default to an actual-price FOCUS, not ALL');
assert.match(panel,/const trueHistory=focusView\?recent\.slice\(-18\):recent/,
 'only 18 real closed M15 candles are shown in focus mode');
assert.match(panel,/mode:focusView\?'FOCUS':'ALL'/,
 'viewport toggle must affect vertical price scale as well as candle count');
assert.match(panel,/forecast:projected\.ready\?projected\.bars:\[\.\.\.huntPreview\.buy,\.\.\.huntPreview\.sell\]/,
 'both bull and bear routes must determine watch-only focus scale');
assert.match(panel,/onClick=\{\(\)=>setFocusView\(v=>!v\)\}/,
 'user can recover the original full context at any time');
assert.match(overlay,/const stride=\(width-80\)\/6/,
 'candle bodies reserve a genuine right-side target label rail');
assert.match(overlay,/placeHuntWaypoints\(f,p\.py,p\.top,p\.bottom\)/,
 'conditional projected target station badges are rendered on true prices');
assert.match(overlay,/className="sniper-hunt-waypoint"/);
assert.match(overlay,/هدف افتراضي من ATR/,
 'a visual waypoint is not a broker target or proved return');
assert.match(style,/sniper-m15-focus-toggle/);
console.log('PASS: nearby OHLC zoom, accurate two-path M15 target labels, nonoverlapping mobile price rail and restored full-history toggle');
