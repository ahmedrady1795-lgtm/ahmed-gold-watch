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
const map=fs.readFileSync('components/SniperLiquidityDecisionMap.tsx','utf8');
assert.match(chart,/M15 · LEVEL MAP/);
assert.match(chart,/const recent=actual\.slice\(-72\)/);
assert.match(chart,/const realCandleWidth=clamp\(actualStride\*\.68,2\.2,5\.2\);/);
assert.match(chart,/const split=215|split=215,end=422/);
assert.match(chart,/const longer=buildM15Scenario\(\{\.\.\.modelInput,steps:48\}\)/);
assert.match(chart,/const scenario=buildM15Scenario\(\{\.\.\.modelInput,steps:12\}\)/);
assert.match(chart,/const visualBars=prefixMatches\?longer\.bars:scenario\.bars/);
assert.match(chart,/bars:scenario\.bars\.map\(b=>/,
 'immutable proof ledger still stores original 12-bar hypothetical evidence');
assert.match(chart,/const aligned=stable&&validLive&&forming/);
assert.match(chart,/forecast:\[\]/,'hypotheses do not stretch the real price axis');
assert.doesNotMatch(chart,/futureCandleWidth|renderedBars\.map/,
 'historical hypotheses are no longer painted as live future candles');
assert.match(chart,/sniper-live-candle-bias/,
 'live observed candle retains its direction marker');
assert.match(map,/watch\.upper\.slice\(0,2\)/);
assert.match(map,/watch\.lower\.slice\(0,2\)/);
console.log('PASS: frozen M15 evidence retained for scoring, while UI uses real-price liquidity map');
