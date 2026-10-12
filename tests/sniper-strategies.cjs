const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
const cache=new Map();
function load(file){
  file=path.resolve(file);if(cache.has(file))return cache.get(file);
  const module={exports:{}};cache.set(file,module.exports);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(code,{module,exports:module.exports,require:p=>p.startsWith('.')?load(path.resolve(path.dirname(file),p+'.ts')):require(p),console});
  cache.set(file,module.exports);return module.exports;
}
const {evaluateSniperStrategies:run}=load('lib/sniper-strategies.ts');
const now=Date.parse('2026-10-12T12:00:00Z');
function fixture(side='BUY'){
  const sign=side==='BUY'?1:-1;
  const rows=period=>Array.from({length:110},(_,i)=>{
    const close=100-sign*(109-i)*.08;
    return {time:now-(110-i)*period,open:close-sign*.04,close,high:close+.3,low:close-.3};
  });
  const frames={m5:rows(300000),m15:rows(900000),h1:rows(3600000)};
  const prev=frames.m5.at(-2),prior=frames.m5.slice(-14,-2);
  if(side==='BUY')prev.low=Math.min(...prior.map(b=>b.low))-.15;
  else prev.high=Math.max(...prior.map(b=>b.high))+.15;
  return {now,frames,side,price:100,sourceReady:true,stop:100-sign*3,targets:[{price:100+sign*6}]};
}
for(const side of ['BUY','SELL']){
  const f=fixture(side),s=run(f);
  assert.equal(s.ready,true);assert.equal(s.regime,'TREND');assert.equal(s.eligible,true,s.reason);
  assert.equal(s.frames.h1.side,side);assert.equal(s.rr,2);
  assert.equal(s.strategies.find(x=>x.id==='PULLBACK').state,'CONFIRMED','EMA pullback needs closed continuation and higher-frame agreement');
  const retest=structuredClone(f),sign=side==='BUY'?1:-1;
  for(let i=104;i<110;i++){
    const up=i===104?100:99.96+(i-105)*.055,close=100+sign*(up-100);
    const lo=i===105?99.72:up-.2,hi=up+.3;
    Object.assign(retest.frames.m5[i],{close,open:close-sign*.06,
      low:sign===1?lo:200-hi,high:sign===1?hi:200-lo});
  }
  retest.price=retest.frames.m5.at(-1).close;
  assert.equal(run(retest).strategies.find(x=>x.id==='RETEST').state,'CONFIRMED','closed breakout precedes confirmed retest');
  const failed=structuredClone(retest);
  failed.frames.m5.at(-1).close=100+sign*(99.5-100);
  failed.frames.m5.at(-1).low=Math.min(failed.frames.m5.at(-1).low,failed.frames.m5.at(-1).close);
  failed.frames.m5.at(-1).high=Math.max(failed.frames.m5.at(-1).high,failed.frames.m5.at(-1).close);
  assert.notEqual(run(failed).strategies.find(x=>x.id==='RETEST').state,'CONFIRMED','closing back through broken level rejects retest');

  assert.equal(s.strategies.find(x=>x.id==='SWEEP').state,'CONFIRMED','two closed reclaim bars confirm sweep');
  const oppositeSide=side==='BUY'?'SELL':'BUY';
  const conflictKind=side==='BUY'?['SWEEP_HIGH','BOS_DOWN']:['SWEEP_LOW','BOS_UP'];
  const conflict={ready:true,side:oppositeSide,volumeBasis:'TICK',
    events:conflictKind.map((kind,i)=>({kind,level:100,at:now-(i+3)*300000,
      confirmedAt:now-(i+2)*300000}))};
  const veto=run({...f,liquidityContext:conflict});
  assert.equal(veto.liquidity.opposing,true,'paired liquidity and structure mismatch');
  assert.equal(veto.eligible,false,'liquidity conflict prevents new entry');
  assert.match(veto.blockers.join(' '),/سحب سيولة/);
  assert.equal(run({...f,liquidityContext:{...conflict,events:conflict.events.slice(0,1)}}).eligible,true,
    'single opposing wick does not trigger an unsupported veto');

  assert.equal(run({...f,sourceReady:false}).eligible,false,'old quote/model cannot authorize an entry');
  assert.equal(run({...f,stop:100}).eligible,false,'zero-risk stop rejected');
  assert.equal(run({...f,targets:[{price:100+(side==='BUY'?1:-1)}]}).eligible,false,'insufficient reward rejected');
  assert.equal(run({...f,price:side==='BUY'?103:97}).eligible,false,'do not chase a large live move');
  const noConfirm=structuredClone(f);
  noConfirm.frames.m5.at(-1).time=now; // last reclaim candle is still forming
  assert.notEqual(run(noConfirm).strategies.find(x=>x.id==='SWEEP')?.state,'CONFIRMED','future wick cannot supply second close');
  const opposing=structuredClone(f);opposing.frames.h1=fixture(side==='BUY'?'SELL':'BUY').frames.h1;
  assert.equal(run(opposing).eligible,false,'H1 opposition blocks new entry');
  const gap=structuredClone(f);gap.frames.m15.splice(-5,3);
  assert.equal(run(gap).ready,false,'recent candle gap blocks indicators');
  const shock=structuredClone(f);shock.frames.m5.at(-1).high+=10;
  assert.equal(run(shock).regime,'SHOCK');assert.equal(run(shock).eligible,false);
  const stale=structuredClone(f);stale.frames.m5=stale.frames.m5.map(b=>({...b,time:b.time-3600000}));
  assert.equal(run(stale).ready,false,'stale closed frames rejected');
}
const flat=fixture();for(const rows of Object.values(flat.frames))for(const b of rows)Object.assign(b,{open:100,close:100,high:100.3,low:99.7});
const range=run(flat);assert.equal(range.regime,'RANGE');assert.equal(range.eligible,false,'flat indicators cannot create an entry');
assert.equal(run({...flat,side:'WAIT'}).eligible,false);
const duplicated=fixture();duplicated.frames.m5.push({...duplicated.frames.m5.at(-1)});
assert.equal(run(duplicated).frames.m5.adx,run(fixture()).frames.m5.adx,'duplicate closed bars are deduplicated');
const squeeze=fixture();squeeze.frames.m5.at(-2).low=squeeze.frames.m5.at(-2).close-.3;
squeeze.frames.m15=Array.from({length:160},(_,i)=>{
  const amp=i<100?1.8:1.8*Math.exp(-(i-100)*.08),close=100+Math.sin(i*Math.PI/2)*amp;
  return {time:now-(160-i)*900000,open:close,close,high:close+.15,low:close-.15};
});
const compressed=run(squeeze);assert.equal(compressed.regime,'COMPRESSION');
assert.equal(compressed.strategies.find(x=>x.id==='SQUEEZE').state,'BUILDING','squeeze alone never confirms directional entry');
assert.equal(compressed.eligible,false);
const base=fixture();const changed=structuredClone(base);
changed.frames.m5.push({time:now+300000,open:100,close:150,high:160,low:90});
assert.equal(JSON.stringify(run(changed)),JSON.stringify(run(base)),'future bars cannot alter indicators or strategy');
assert.match(fs.readFileSync('lib/sniper-audit-store.ts','utf8'),/if\(!strategy\.eligible\)blockers\.push/,'server ledger uses eligibility gate');
console.log('PASS: BUY/SELL sweeps, closed-candle confirmation, gap/staleness, H1 opposition, shock, anti-chase, RR, flat market and server gate');
