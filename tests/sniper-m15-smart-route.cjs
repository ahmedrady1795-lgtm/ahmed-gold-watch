const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ts=require('typescript');
const source=fs.readFileSync('lib/sniper-m15-smart-route.ts','utf8');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(source,{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText,{module:mod,exports:mod.exports});
const build=mod.exports.buildConditionalMovementRoute;
const issuedAt=Date.parse('2026-11-06T08:00:00Z');
const watch={ready:true,reason:'observed',atr:1,asOf:issuedAt,
 upper:[
  {key:'UP1',side:'BUY',price:100.8,source:'M15',kind:'SWING',stage:1,actionable:false},
  {key:'UP2',side:'BUY',price:102,source:'H1',kind:'SWING',stage:2,actionable:false}],
 lower:[
  {key:'DOWN1',side:'SELL',price:99.2,source:'M15',kind:'SWING',stage:1,actionable:false},
  {key:'DOWN2',side:'SELL',price:98.5,source:'H1',kind:'RANGE',stage:2,actionable:false}]};
const base={
 now:issuedAt+3000,source:'Gold/MT5',sourceReady:true,
 anchor:100,issuedAt,m1Ready:true,m1Side:'BUY',m15Side:'BUY',
 preMoveReady:true,preMoveSide:'BUY',watch,trigger:100.2,invalidation:99.6
};
const up=build(base);
assert.equal(up.ready,true,up.reason);
assert.equal(up.side,'BUY');
assert.equal(up.anchor,100);
assert.deepEqual(Array.from(up.targets,x=>x.price),[100.8,102],
 'every waypoint must equal a closed M15/H1 price level');
assert.equal(up.evidence,'M1+M15+PREMOVE');
assert.equal(up.trigger,100.2);
assert.equal(up.invalidation,99.6);
assert.equal(up.timeBased,false);
assert.equal(up.certainty,'WATCH_ONLY');
assert.equal(build({...base,now:issuedAt+25000}).key,up.key,
 'quote ticks cannot change a route key inside one closed-M1 epoch');
assert.equal(build({...base,now:issuedAt+60000}).ready,false,
 'stale M1 proposals are not live routes');
assert.equal(build({...base,m1Side:'WAIT'}).ready,false);
assert.equal(build({...base,m15Side:'SELL'}).ready,false,
 'opposed M15 blocks future-path drawing');
assert.equal(build({...base,preMoveSide:'SELL'}).ready,false,
 'confirmed opposing M1/M5 pressure blocks drawing');
assert.equal(build({...base,m15Side:'WAIT',preMoveReady:false}).ready,false,
 'M1 alone does not imply independent edge');
assert.equal(build({...base,sourceReady:false}).ready,false);
assert.equal(build({...base,watch:{...watch,ready:false}}).ready,false);
assert.equal(build({...base,watch:{...watch,upper:[]}}).ready,false);
assert.equal(build({...base,trigger:103}).trigger,null,
 'a faraway trigger beyond the first observed goal is not presented as an entry');
assert.equal(build({...base,invalidation:101}).invalidation,null,
 'an invalidation must be on the opposite side of the fixed anchor');
const down=build({...base,m1Side:'SELL',m15Side:'SELL',preMoveSide:'SELL',
 trigger:99.8,invalidation:100.5});
assert.equal(down.ready,true);
assert.deepEqual(Array.from(down.targets,x=>x.price),[99.2,98.5]);
assert.equal(down.trigger,99.8);
assert.equal(down.invalidation,100.5);
const panel=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const map=fs.readFileSync('components/SniperLiquidityDecisionMap.tsx','utf8');
assert.match(panel,/<SniperLiquidityDecisionMap watch=\{watchMap\}/);
assert.match(panel,/const \[heldMovementRoute,setHeldMovementRoute\]=useState/);
assert.match(panel,/old\?\.key===routeKey\?old:/,
 'first issued route must remain fixed between quote ticks');
assert.match(panel,/qannas-v3-price-path-history-/,
 'original route proposals remain recorded for independent future scoring');
assert.match(panel,/routeClosedM1\?\.time===nextM1\.anchorTime/,
 'live quote cannot create a new anchor without a genuine close');
assert.doesNotMatch(panel,/<SniperM15HuntOverlay|renderedBars\.map/,
 'no simulated future candles or ATR route enters the active chart');
assert.match(map,/sniper-m15-motion-route/);
assert.match(map,/route\.targets\.map\(t=>t\.price\)/);
assert.match(map,/route\.side==='BUY'/);
assert.match(map,/التوقع محفوظ · غير نشط/);
assert.doesNotMatch(map,/candle\(|forecastCandles|\bwinRate\b/,
 'UI has no synthetic candle bodies or invented success rate');
console.log('PASS: V3 conditional price path uses authentic levels, agrees across frames, locks each M1 epoch, and records immutable research proposals');
