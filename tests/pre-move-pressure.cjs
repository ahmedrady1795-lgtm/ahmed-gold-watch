const assert=require('node:assert/strict'),ts=require('typescript'),vm=require('node:vm'),fs=require('node:fs');
const ex={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/pre-move-pressure.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{exports:ex});
const run=ex.detectPreMovePressure;
const start=Date.parse('2026-10-13T01:00:00Z');
const rows=Array.from({length:75},(_,i)=>{
  const time=start+i*60000;
  if(i<59){
    const o=100+Math.sin(i*.63)*.04,c=100+Math.cos(i*.37)*.045;
    return {time,open:o,close:c,high:100.7,low:99.3,tickVolume:100};
  }
  const mid=100+(i-59)*.031;
  return {time,open:mid-.035,close:mid+.045,high:mid+.10,low:mid-.10,tickVolume:30};
});
function five(c1){const out=[];for(let i=0;i+5<=c1.length;i+=5){
 const a=c1.slice(i,i+5);out.push({time:a[0].time,open:a[0].open,
 close:a[4].close,high:Math.max(...a.map(x=>x.high)),low:Math.min(...a.map(x=>x.low))});}return out;}
const now=start+75*60000+2000;
const x={asset:'GOLD',c1:rows,c5:five(rows),now};
const sig=run(x);
assert.equal(sig.ok,true);
assert.equal(sig.side,'BUY','rising lows, compressed bars and rising M5 should identify early buying pressure');
assert.equal(sig.stage,'ARMED');
assert.equal(sig.status,'CONDITIONAL_WATCH');
assert.equal(sig.volumeBasis,'TICK','tick volume must not be labeled real DOM volume');
assert.ok(sig.compression>=70);
assert.ok(sig.trigger>rows.at(-1).close&&sig.trigger>sig.range.high);
assert.ok(sig.invalidation<sig.range.low);
assert.ok(sig.readiness<=68,'cold signal readiness must not imply a measured win chance');
const unclosed={time:now-2000,open:100,high:300,low:40,close:290};
const same=run({...x,c1:[...rows,unclosed]});
assert.equal(same.trigger,sig.trigger,'forming candle must never leak into earlier signals');
assert.equal(same.readiness,sig.readiness);
const stale=run({...x,now:now+320000});
assert.equal(stale.ok,false);
assert.equal(stale.side,'WAIT');
assert.equal(stale.status,'STALE');
const disagree=five(rows).map((z,i,a)=>i<a.length-3?z:{...z,close:100-(i-a.length+3)*.25});
const against=run({...x,c5:disagree});
assert.notEqual(against.stage,'ARMED','higher-frame conflict cannot arm a pre-break signal');
const exploding=[...rows],last={...exploding.at(-1)};
last.close=sig.trigger+.18;last.high=last.close+.05;last.open=rows.at(-2).close;
exploding[exploding.length-1]=last;
const moved=run({...x,c1:exploding});
assert.notEqual(moved.stage,'ARMED','already broken box is not a pre-break signal');
const invalid=run({...x,c1:rows.slice(0,30)});
assert.equal(invalid.ok,false);
assert.equal(invalid.side,'WAIT');
// The same guard must work in both directions, including a wick-only touch
// in the previous candle followed by a quiet close inside the box.
for(const direction of [1,-1]){
 const data=direction===1?rows:rows.map(b=>({...b,open:200-b.open,
  close:200-b.close,high:200-b.low,low:200-b.high}));
 const input={...x,c1:data,c5:five(data)};
 const before=run(input);
 assert.equal(before.stage,'ARMED');
 assert.equal(before.side,direction===1?'BUY':'SELL');
 for(const offset of [1,2]){
  const touched=data.map(b=>({...b}));
  if(direction===1)touched[touched.length-offset].high=before.trigger+.001;
  else touched[touched.length-offset].low=before.trigger-.001;
  const after=run({...input,c1:touched});
  assert.equal(after.stage,'RELEASED','a completed trigger wick is not a fresh pre-break setup');
  assert.equal(after.side,'WAIT');assert.equal(after.trigger,null);
 }
}
const baselineGap=rows.filter((_,i)=>i!==rows.length-40);
assert.equal(run({...x,c1:baselineGap}).ok,false,'missing baseline M1 bar invalidates compression');
const m5Gap=five(rows).filter((_,i,a)=>i!==a.length-10);
assert.equal(run({...x,c5:m5Gap}).ok,false,'missing M5 ATR bar invalidates higher-frame evidence');
const twoSided=rows.map(b=>({...b}));
twoSided.at(-2).low=98;twoSided.at(-2).high=102;
assert.equal(run({...x,c1:twoSided}).side,'WAIT','two-sided sweep must not inherit BUY branch priority');
console.log('PASS: PREMOVE causal M1/M5 compression, future-bar exclusion, directional trigger/invalidation, delayed-feed and no-after-break guards');
