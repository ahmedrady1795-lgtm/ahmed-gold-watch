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
  const mid=100+(i-59)*.025;
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
console.log('PASS: PREMOVE causal M1/M5 compression, future-bar exclusion, directional trigger/invalidation, delayed-feed and no-after-break guards');
