const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path){
 const m={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{
   compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
 }).outputText,{module:m,exports:m.exports,Math,Number,Date},{filename:path});
 return m.exports;
}
const {assessM15RouteObstacle:assess}=load('lib/sniper-m15-route-obstacle.ts');
const {buildM15Scenario}=load('lib/sniper-m15-scenario.ts');
const t=Date.parse('2026-11-09T16:00:00Z'),M15=900000;
const closed=[{time:t-2*M15,close:4114.6},{time:t-M15,close:4115.71}];
const zones=[{key:'SELL',low:4127.97,high:4130.17,status:'OBSERVED'},
 {key:'BUY',low:4113.23,high:4114.1,status:'OBSERVED'}];
const common={side:'BUY',anchor:4115.71,goals:[{price:4129.69}],
 zones,closed,now:t,atr:5};
const blocked=assess(common);
assert.equal(blocked.blocked,true,'target inside unbroken supply cannot claim a confident rise');
assert.equal(blocked.level,4130.17);
assert.equal(blocked.kind,'SUPPLY');
assert.match(blocked.reason,/إغلاقَي M15/);
const broken=assess({...common,closed:[
 {time:t-2*M15,close:4130.65},{time:t-M15,close:4130.9}
]});
assert.equal(broken.blocked,false,'two genuine closed breakouts clear the watch obstacle');
assert.equal(assess({...common,goals:[{price:4124}]}).blocked,false,
 'a nearer target before supply may remain a conditional watch');
assert.equal(assess({...common,zones:[{...zones[0],status:'NONE'}]}).blocked,false);
assert.equal(assess({...common,closed:[{time:t-M15,close:4131}]}).blocked,true,
 'a single M15 close does not prove a sustained breakout');
const sell=assess({
 side:'SELL',anchor:4120,goals:[{price:4112}],
 zones,closed:[{time:t-2*M15,close:4116},{time:t-M15,close:4115}],
 now:t,atr:5
});
assert.equal(sell.blocked,true,'a bearish route must also respect observed demand');
const sellBreak=assess({
 side:'SELL',anchor:4120,goals:[{price:4112}],
 zones,closed:[{time:t-2*M15,close:4112.8},{time:t-M15,close:4112.6}],
 now:t,atr:5
});
assert.equal(sellBreak.blocked,false);
const code=fs.readFileSync('lib/sniper-m15-scenario.ts','utf8');
assert.doesNotMatch(code,/if\(net<refUnit\*\.18\)continue/,
 'do not filter historical analogues by favorable future direction');
assert.match(code,/nearest\.filter\(x=>x\.net>=x\.refUnit\*\.18\)/,
 'independent nearest historical analogues must be evaluated on both outcomes');
assert.match(code,/if\(best\.net<best\.refUnit\*\.18\)/,
 'do not skip a nearest losing example for a distant winning one');
const panel=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const overlay=fs.readFileSync('components/SniperM15HuntOverlay.tsx','utf8');
assert.match(panel,/const issuance=routeObstacle\.blocked\?/,
 'unbroken supply/demand must veto a new directional M15 projection');
assert.match(panel,/obstruction=\{routeObstacle\}/);
assert.match(overlay,/if\(hits\)break/,
 'stop the speculative drawn path at the observed opposing boundary');
assert.match(panel,/opacity=\{routeObstacle\.blocked\?/,
 'preserve the historical forecast for audit but fade invalidated continuation');
console.log('PASS: target near observed supply guarded, two-bar breakout proof, mirrored demand, unbiased nearest analogues and chart path caution');
