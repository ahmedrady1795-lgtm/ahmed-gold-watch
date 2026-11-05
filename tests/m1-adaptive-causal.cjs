const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const mods=new Map();
function load(file){
 file=path.resolve(file);if(mods.has(file))return mods.get(file);
 const out={};mods.set(file,out);
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,
    esModuleInterop:true}
 }).outputText,{
  exports:out,require:name=>name.startsWith('.')?
    load(path.resolve(path.dirname(file),name+'.ts')):require(name),
  console,globalThis:{},Math,Number,Date
 },{filename:file});
 return out;
}
const {everyM1Direction}=load('lib/sniper-m1-every-direction.ts');
const {buildM1CandleTape}=load('lib/sniper-m1-candle-tape.ts');
const {EVERY_M1_EDGE_V4}=load('lib/scalp-every-m1-economics.ts');
const T=Date.parse('2026-11-05T09:00:00Z');
const make=(signs)=>{
 let last=100;
 return signs.map((sign,i)=>{
  const open=last,close=open+sign*.12;
  last=close;
  return {time:T+i*60000,open,close,
   high:Math.max(open,close)+.07,low:Math.min(open,close)-.07};
 });
};
const alternating=make(Array.from({length:77},(_,i)=>i%2===0?1:-1));
const moment=alternating.at(-1).time+60000;
const adaptive=everyM1Direction(alternating,moment+300);
assert.ok(adaptive);
assert.equal(adaptive.issuedAt,moment);
assert.equal(adaptive.adaptive.improved,true,
 'past-only alternating candles select a tested fading model');
assert.ok(['BODY_FADE','EXHAUSTION_FADE'].includes(adaptive.adaptive.model),
 'adaptive branch must select a reversal when past evidence rejects follow');
assert.equal(adaptive.adaptive.checked,12);
assert.ok(adaptive.adaptive.checkHits>=8);
assert.ok(adaptive.adaptive.checkHits-adaptive.adaptive.simpleCheckHits>=2,
 'out-of-training gate must beat last-body baseline');
assert.equal(adaptive.side,'SELL',
 'reversal from the final positive minute must be preferred on proven alternation');
const prevPrefix=everyM1Direction(alternating.slice(0,-1),
 alternating.at(-1).time+200);
const changed=alternating.map(b=>({...b}));
changed[changed.length-1]={...changed.at(-1),open:102,close:101,high:102.1,low:100.9};
const samePast=everyM1Direction(changed.slice(0,-1),
 changed.at(-1).time+200);
assert.equal(JSON.stringify(prevPrefix),JSON.stringify(samePast),
 'future bar changes cannot repaint a prediction issued before that bar');
const tape=buildM1CandleTape(alternating,moment,9);
assert.equal(tape.marks.length,9);
assert.equal(tape.aligned+tape.marks.filter(x=>x.aligned===false).length,tape.graded,
 'all directional misses count, even for weak predictions');
assert.ok(tape.adaptiveGraded<=tape.graded);
assert.ok(tape.adaptiveAligned<=tape.aligned);
assert.ok(tape.adaptiveAligned<=tape.adaptiveGraded);
const flat=make(Array.from({length:75},()=>1));
const slow=everyM1Direction(flat,flat.at(-1).time+60000);
assert.ok(slow);
assert.equal(slow.adaptive.improved,false,
 'a simple strong trend should not force an adaptive switch to overfit');
assert.equal(slow.side,'BUY');
const short=everyM1Direction(alternating.slice(-43),
 moment+200);
assert.ok(short);
assert.equal(short.adaptive.improved,false);
assert.equal(short.adaptive.trained,0,
 'too little prior context is not a validated adaptive selection');
const mixed=make([
 ...Array.from({length:63},(_,i)=>i%2===0?1:-1),
 ...Array.from({length:12},()=>1)]);
const failed=everyM1Direction(mixed,mixed.at(-1).time+60000);
assert.ok(failed);
assert.equal(failed.adaptive.improved,false,
 'older alternating training cannot override a failing later check window');
const gap=alternating.map(b=>({...b}));gap[gap.length-6].time+=1000;
assert.equal(everyM1Direction(gap,moment+200),null,
 'broken adjacent minute timestamps must never certify a direction');
const ledger=fs.readFileSync('lib/scalp-every-candle.ts','utf8');
assert.match(ledger,/EVERY_M1_EDGE_V4/,
 'changed adaptive model and confirmed limit are a new forward-only prospective proof cohort');
assert.match(ledger,/directionModel:signal\.adaptive\?\.model/,
 'freeze the direction model chosen before the candle begins');
assert.doesNotMatch(ledger,/history\.filter\(.*weak\s*===\s*false\).*resolved/,
 'weak losses must not be excluded from full sample');
assert.ok(EVERY_M1_EDGE_V4.includes('V4'));
console.log('PASS: adaptive M1 causal train/check, reversal wins on alternating fixture, no future leak, unchanged trend and all-error accounting');
