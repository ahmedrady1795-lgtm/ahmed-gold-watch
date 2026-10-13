const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const module_={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/forecast-motion.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:module_,exports:module_.exports,require});
const build=module_.exports.buildForecastMotion;
const base=Date.parse('2026-10-13T10:00:00Z');
const now=base+40*300000+1000;
const m5=Array.from({length:40},(_,i)=>{
  const wide=i<24;
  return {time:base+i*300000,open:100.1,close:100.19,
    high:wide?101.2:100.55,low:wide?99:99.82};
});
const input={visible:true,side:'BUY',price:100.19,
  targets:[{stage:1,price:104},{stage:2,price:108}],
  breakout:{ready:true,trigger:101,confirmed:false,extension:.48},
  now,m5,invalidation:99.1,
  zones:[{kind:'DEMAND',low:100.82,high:101.03}]};
const kinds=points=>points.map(x=>x.kind).join(',');
let p=build(input);
assert.equal(kinds(p),'START,BREAK,HOLD,RETEST,TARGET,TARGET');
assert.equal(p[3].price,101.03,'retest uses a nearby authentic demand boundary');
assert.ok(p[2].price>p[3].price,'BUY route must show an actual dip after the breakout');
assert.deepEqual(p.slice(-2).map(x=>x.price),[104,108],'targets remain server prices');
assert.ok(p.every(x=>x.kind!=='STOP'),'invalidation never joins take-profit path');
p=build({...input,side:'SELL',price:100.19,targets:[{stage:1,price:95}],
  breakout:{ready:true,trigger:99.3,confirmed:false,extension:.48},
  zones:[{kind:'SUPPLY',low:99.26,high:99.6}],invalidation:101.2});
assert.equal(kinds(p),'START,BREAK,HOLD,RETEST,TARGET');
assert.equal(p[3].price,99.26,'SELL retest uses the authentic supply boundary');
assert.ok(p[2].price<p[3].price,'SELL route must rise again on retest before falling');
p=build({...input,breakout:{ready:true,trigger:101,confirmed:true,extension:.48},
  price:101.42});
assert.equal(kinds(p),'START,RETEST,TARGET,TARGET','fresh confirmed breakout includes a supported pullback');
assert.ok(p[1].price<p[0].price);
p=build({...input,breakout:{ready:true,trigger:101,confirmed:true,extension:.48},
  price:103.2});
assert.equal(kinds(p),'START,TARGET,TARGET','already extended move must not fabricate a retest');
p=build({...input,m5:m5.slice(0,20),now});
assert.equal(kinds(p),'START,BREAK,TARGET,TARGET','stale M5 cannot create a historical retest');
p=build({...input,m5:m5.filter((_,i)=>i!==32)});
assert.equal(kinds(p),'START,BREAK,TARGET,TARGET','gapped M5 cannot qualify the retest');
const liquidity={ready:true,phaseKind:'ACCUMULATION',lower:{low:99.7,high:99.9,center:99.8}};
p=build({...input,preMove:{ok:true,side:'BUY',stage:'BUILDING',sweep:'NONE',
    sourceAt:now-45000},liquidity});
assert.equal(kinds(p),'START,SWEEP,RECLAIM,BREAK,TARGET,TARGET',
  'unswept real liquidity shelf should create a conditional down-up wick, not false confirmed history');
assert.ok(p[1].price<p[0].price&&p[2].price>p[1].price);
assert.ok(p[1].price>input.invalidation,'sweep projection must stay above real invalidation');
p=build({...input,preMove:{ok:true,side:'BUY',stage:'BUILDING',sweep:'LOWER',
    sourceAt:now-45000},liquidity});
assert.equal(p.some(x=>x.kind==='SWEEP'),false,'do not project a sweep already observed historically');
p=build({...input,invalidation:99.75,
  preMove:{ok:true,side:'BUY',stage:'BUILDING',sweep:'NONE',sourceAt:now-45000},liquidity});
assert.equal(p.some(x=>x.kind==='SWEEP'),false,'no planned wick through forecast invalidation');
p=build({...input,preMove:{ok:true,side:'BUY',stage:'BUILDING',
    sweep:'NONE',sourceAt:now-999999},liquidity});
assert.equal(p.some(x=>x.kind==='SWEEP'),false,'stale pre-move cannot create future sweep');
p=build({...input,visible:false});
assert.equal(p.length,0,'no forecast means no imaginary arrow');
const source=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
assert.match(source,/m5:x\?\.chartHigherFrames\?\.m5,zones:chartBands/);
assert.match(source,/scenarioKind==='BREAK_RETEST'/);
assert.match(source,/p\.kind==='SWEEP'/);
console.log('PASS: BUY/SELL zigzag, real retest boundaries, closed M5 freshness, actual liquidity sweep, stops and server TP');
