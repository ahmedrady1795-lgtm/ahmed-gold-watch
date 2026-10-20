const assert=require('node:assert/strict'),fs=require('node:fs'),
  vm=require('node:vm'),ts=require('typescript');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync('lib/sniper-m15-watch-prices.ts','utf8'),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
  }).outputText,{module:mod,exports:mod.exports});
const {buildM15WatchPriceMap:build}=mod.exports;
const now=Date.parse('2026-10-20T10:15:05Z');
const m15=Array.from({length:90},(_,i)=>{
  const close=4118+Math.sin(i*.31)*11+(i%13===0?2:0);
  return {time:(Math.floor(now/900000)*900000-900000)-(89-i)*900000,open:close-.6,close,
    high:close+2.1,low:close-2.4};
});
const h1=Array.from({length:35},(_,i)=>{
  const close=4120+Math.sin(i*.39)*23;
  return {time:(Math.floor(now/3600000)*3600000-3600000)-(34-i)*3600000,open:close-.5,close,
    high:close+2.6,low:close-2.3};
});
const args={now,price:4118,sourceReady:true,m15,h1};
let x=build(args);
assert.equal(x.ready,true);
assert.ok(x.upper.length>0&&x.lower.length>0,'both upper/lower pools available even in WAIT');
assert.ok(x.upper.every(z=>z.price>4118&&z.actionable===false));
assert.ok(x.lower.every(z=>z.price<4118&&z.actionable===false));
assert.ok(x.upper.every((z,i)=>i===0||z.price>x.upper[i-1].price));
assert.ok(x.lower.every((z,i)=>i===0||z.price<x.lower[i-1].price));
assert.ok(x.upper.every(z=>z.source==='M15'||z.source==='H1'));
assert.equal(build({...args,sourceReady:false}).ready,false,'never print levels with stale quote');
assert.equal(build({...args,now:now+46*60000}).ready,false,'stale chart fail closed');
assert.equal(build({...args,m15:m15.slice(0,-3)}).ready,false,
  'a missing/invalid last M15 bar must block watch references');
assert.equal(build({...args,price:null}).upper.length,0);
const chart=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
assert.match(chart,/className="sniper-m15-watch-target"/);
assert.match(chart,/className="sniper-m15-watch-rail"/);
assert.match(chart,/sniper-m15-watch-strip/);
assert.match(chart,/aligned\.goals\.filter\(g=>targetBridge\?\.connectedStages\.includes\(g\.stage\)\)/,
  'only frozen targets intersected by the separate non-scored bridge appear in the price rail');
console.log('PASS: read-only closed-price M15/H1 watch targets on both sides, stale/gap safety and visible rail');
