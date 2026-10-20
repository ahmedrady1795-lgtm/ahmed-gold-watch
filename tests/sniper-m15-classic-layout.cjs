const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(
 fs.readFileSync('lib/sniper-m15-snapshot.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
 }).outputText,{module:mod,exports:mod.exports});
const validate=mod.exports.validateFrozenM15Snapshot;
const M15=900000,t=Date.parse('2026-10-20T09:00:00Z');
const bars=Array.from({length:48},(_,i)=>({
 step:i+1,open:4000+i*.5,close:4000+(i+1)*.5,
 high:4000+(i+1)*.5+.2,low:4000+i*.5-.2,source:'HISTORICAL_ANALOGUE'
}));
const frozen={
 asset:'GOLD',source:'Biquote',side:'BUY',closedTime:t-M15,anchorTime:t,
 createdAt:t+60000,stop:3990,goals:[{stage:1,price:4027}],
 scenario:{ready:true,bars:bars.slice(0,12),sourceBars:320,archiveYears:0,
  origin:'RECENT_M15',touches:[],stopped:false,atr:2,reason:'analogue'},
 visualBars:bars,reactions:{bands:[],marks:[]}
};
const args={asset:'GOLD',source:'Biquote',now:t+120000};
assert.ok(validate(frozen,args),'48 unscored analogue bodies can be persisted');
assert.equal(validate({...frozen,visualBars:bars.slice(0,10)},args),null,
 'a truncated guide cannot silently replace 12 scored bars');
assert.equal(validate({...frozen,visualBars:bars.map((b,i)=>i===18?{...b,open:5000}:b)},args),null,
 'broken projected candle continuity must be rejected');
assert.equal(validate({...frozen,visualBars:bars.map((b,i)=>i===4?{...b,close:4200}:b)},args),null,
 'visual forecast cannot rewrite original scored prefix');
assert.equal(validate({...frozen,visualBars:[...bars,bars[0]]},args),null,
 'extra route cannot extend beyond 48 M15 cells');
const chart=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
assert.match(chart,/M15 · FORECAST/);
assert.match(chart,/const recent=actual\.slice\(-42\)/);
assert.match(chart,/const projectedStride=\(end-split-8\)\/48;/);
assert.match(chart,/const futureCandleWidth=clamp\(projectedStride\*\.62,1\.5,3\.1\);/);
assert.match(chart,/const realCandleWidth=clamp\(actualStride\*\.60,1\.7,4\);/);
assert.match(chart,/const longer=buildM15Scenario\(\{\.\.\.modelInput,steps:48\}\)/);
assert.match(chart,/const scenario=buildM15Scenario\(\{\.\.\.modelInput,steps:12\}\)/);
assert.match(chart,/const visualBars=prefixMatches\?longer\.bars:scenario\.bars/);
assert.match(chart,/bars:scenario\.bars\.map\(b=>/,'proof ledger only stores 12 genuine scored bars');
assert.match(chart,/const displayBars=aligned\?\.visualBars\?\.slice\(elapsedSteps\)\?\?shownBars/);
assert.doesNotMatch(chart,/extendIllustrativeM15ToTargets\(/,
 'no forced target-reaching staircase can appear');
assert.match(chart,/const aligned=stable&&validLive&&forming/);
console.log('PASS: classic 42/48 M15 chart, authentic saved 12-bar prefix, immutable causal score, no forced TP staircase');
