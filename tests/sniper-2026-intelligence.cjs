const assert=require('node:assert/strict'),fs=require('node:fs'),
 vm=require('node:vm'),ts=require('typescript');
function load(file){
 const exports={};
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
 }).outputText;
 vm.runInNewContext(js,{exports,Math,Number,Date,require:id=>{
  throw Error('unexpected runtime import '+id+' in '+file);
 }},{filename:file});
 return exports;
}
const {detectLiquidityMagnets}=load('lib/sniper-liquidity-magnets.ts');
const {fuseLocalSniper}=load('lib/sniper-local-fusion.ts');
const {detectM1PreBreak}=load('lib/sniper-m1-prebreak.ts');
const DAY=Date.parse('2026-11-03T00:00:00Z');
const M15=900000,MINUTE=60000;
const pivots=Array.from({length:48},(_,i)=>({
 time:DAY+i*M15,open:100.0,close:100.2,
 high:[8,20,32].includes(i)?103:101,
 low:[12,26].includes(i)?97:99
}));
const now15=pivots.at(-1).time+M15;
const radar=detectLiquidityMagnets(pivots,now15);
assert.equal(radar.ready,true);
assert.equal(radar.above.touches,3);
assert.equal(radar.below.touches,2);
assert.equal(radar.above.price,103);
assert.equal(radar.below.price,97);
assert.equal(radar.sweep,'NONE');
assert.equal(radar.above.notOrderBook,true);
assert.equal(radar.notTradeSignal,true);
assert.equal(detectLiquidityMagnets(pivots,now15+4*3600000).ready,false,
 'stale OHLC cannot produce an active liquidity map');
const gap=pivots.map(b=>({...b}));gap[15].time+=30000;
assert.equal(detectLiquidityMagnets(gap,now15).ready,true,
 'an older gap must not block 32 contiguous closed bars after it');
const recentGap=pivots.map(b=>({...b}));recentGap[39].time+=30000;
assert.equal(detectLiquidityMagnets(recentGap,now15).ready,false,
 'a gap in the newest 32 bars cannot be bridged');
const beforeWeekend=pivots.slice(0,24).map((b,i)=>({
 ...b,time:Date.parse('2026-11-06T12:00:00Z')+i*M15
}));
const afterWeekend=pivots.slice(-40).map((b,i)=>({
 ...b,time:Date.parse('2026-11-08T23:00:00Z')+i*M15
}));
const monday=detectLiquidityMagnets([...beforeWeekend,...afterWeekend],
 afterWeekend.at(-1).time+M15);
assert.equal(monday.ready,true,monday.reason);
assert.ok(monday.above?.touches>=2&&monday.below?.touches>=2,
 'Monday liquidity comes from completed post-weekend pivots only');
const tooShort=detectLiquidityMagnets([...beforeWeekend,...afterWeekend.slice(0,31)],
 afterWeekend[30].time+M15);
assert.equal(tooShort.ready,false,
 'the market reopening must first accumulate 32 genuine closed M15 bars');
const future=pivots.map(b=>({...b}));future.at(-1).time+=M15;
assert.equal(detectLiquidityMagnets(future,now15).ready,false,
 'incomplete or future M15 bar must not be used');

const m1=Array.from({length:32},(_,i)=>{
 if(i<28)return {time:DAY+i*MINUTE,open:100,close:100.05,high:101,low:99};
 const lo=100+(i-28)*.08;
 return {time:DAY+i*MINUTE,open:lo+.10,close:lo+.33,high:lo+.40,low:lo};
});
const time=m1.at(-1).time+MINUTE;
const rise=detectM1PreBreak(m1,time);
assert.equal(rise.side,'BUY','rising lows with squeeze should anticipate UP case');
assert.equal(rise.evidence,'RISING_LOWS');
assert.ok(rise.compression>60);
const mirror=m1.map(v=>({time:v.time,open:200-v.open,close:200-v.close,
 high:200-v.low,low:200-v.high}));
const fall=detectM1PreBreak(mirror,time);
assert.equal(fall.side,'SELL','falling highs should mirror rising lows');
assert.equal(detectM1PreBreak(m1,time+62000).ready,false);
const gap1=m1.map(v=>({...v}));gap1[20].time+=20000;
assert.equal(detectM1PreBreak(gap1,time).ready,false);
const expanded=m1.map(v=>({...v}));expanded[30].high=103;
assert.equal(detectM1PreBreak(expanded,time).side,'WAIT',
 'expansion already in progress cannot be relabeled pre-break');

const preMove={ok:true,stage:'ARMED',side:'BUY'};
const hunt={ready:true,referenceOnly:false,preferred:'BUY',
 observation:{quality:'CLEAR',conflicting:false}};
const m1Priority={ready:true,side:'BUY'};
const input={preMove,hunt,m1:m1Priority,liquidity:radar,
 marketOpen:true,fresh:true,providerTransition:false};
const fused=fuseLocalSniper(input);
assert.equal(fused.side,'BUY');
assert.equal(fused.phase,'EARLY_CANDIDATE');
assert.equal(fused.tradeAuthorized,false);
assert.equal(fused.confidenceIsProbability,false);
const conflict=fuseLocalSniper({...input,hunt:{...hunt,preferred:'SELL'}});
assert.equal(conflict.side,'WAIT');
assert.equal(conflict.phase,'DISAGREEMENT');
assert.equal(fuseLocalSniper({...input,marketOpen:false}).side,'WAIT');
assert.equal(fuseLocalSniper({...input,fresh:false}).ready,false);
assert.equal(fuseLocalSniper({...input,providerTransition:true}).side,'WAIT');

const script=fs.readFileSync('lib/sniper-m1-every-direction.ts','utf8');
const ui=fs.readFileSync('components/SniperM15PreMoveConsole.tsx','utf8');
const panel=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const m1Ui=fs.readFileSync('components/SniperM1CandleHunter.tsx','utf8');
const style=fs.readFileSync('app/qannas-2026.css','utf8');
const layout=fs.readFileSync('app/layout.tsx','utf8');
assert.ok(script.includes('detectM1PreBreak(rows,now)'));
assert.ok(script.includes('const flatRecent=rows.slice(-6).filter'));
assert.ok(script.includes('flatCluster||lowActivity||applyRegime||applyEarly||applyRelative'));
assert.ok(script.includes('applyEarly?early!.side'));
assert.ok(ui.includes('LOCAL AI FUSION'));
assert.ok(ui.includes('LIQUIDITY MAP 2026'));
assert.ok(ui.includes('p.fusion.phase'));
assert.ok(panel.includes('liquidity={liquidityMagnets} fusion={localFusion}'));
assert.ok(m1Ui.includes('every?.dataQuality===\'FLAT_CLUSTER\''));
assert.ok(style.includes('sniper-fusion-votes'));
assert.ok(layout.includes('import "./qannas-2026.css";'));
assert.ok(!ui.includes('submitOrder(')&&!ui.includes('placeOrder('));
console.log('PASS: source-true M15 liquidity clusters, local multi-frame fusion, safe M1 squeeze, flat-feed caution, single modern 2026 interface');
