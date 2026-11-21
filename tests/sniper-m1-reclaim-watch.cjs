const assert=require('node:assert/strict'),fs=require('node:fs'),
  vm=require('node:vm'),ts=require('typescript');
function load(path,requireFn){
 const exp={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
 }).outputText,{exports:exp,require:requireFn||require},{filename:path});
 return exp;
}
const {detectM1ReclaimWatch:detect}=load('lib/sniper-m1-reclaim-watch.ts');
const now=Date.parse('2026-11-21T15:50:15Z'),cut=now-15000;
const t0=cut-24*60000;
const bullish=Array.from({length:24},(_,i)=>{
 const p=100+i*.25;
 return {time:t0+i*60000,open:p-.12,close:p+.08,
 high:p+.2,low:p-.2};
});
bullish[22]={...bullish[22],open:105.5,close:105.15,
 high:105.65,low:105.05};
bullish[23]={...bullish[23],open:105.15,close:105.62,
 high:105.8,low:105.10};
const m5=Array.from({length:3},(_,i)=>({
 time:cut-15*60000+i*300000,
 open:102+i*1.3,close:103+i*1.05,
 high:103.5+i*1.1,low:101.7+i*1.1
}));
const a={now,price:105.68,priceFresh:true,marketOpen:true,
 providerTransition:false,m1:bullish,m5};
let r=detect(a);
assert.ok(r,'A closed M1 bull reclaim after a red retracement should issue a forward watch');
assert.equal(r.side,'BUY');
assert.equal(r.asOf,cut,'the watch issue time is the close of the real M1 bar');
assert.ok(r.trigger>a.price&&r.invalidation<a.price,
 'a before-break signal needs a future trigger and protective invalidation');
assert.equal(r.tradeAuthorized,false);
assert.equal(r.evidence,'CLOSED_M1_PULLBACK_RECLAIM');
const mirror=(bars)=>bars.map(b=>({
 time:b.time,open:210-b.open,close:210-b.close,high:210-b.low,low:210-b.high
}));
const inverse={...a,m1:mirror(bullish),m5:mirror(m5),price:210-a.price};
r=detect(inverse);
assert.ok(r,'A mirror-image M1 bear reclaim must appear, not just BUY');
assert.equal(r.side,'SELL');
assert.ok(r.trigger<inverse.price&&r.invalidation>inverse.price);
assert.equal(detect({...a,price:106}),null,'never issue a pre-break BUY after the break');
assert.equal(detect({...inverse,price:103}),null,'never issue a pre-break SELL after the drop');
assert.equal(detect({...a,priceFresh:false}),null,'stale real quote is never executable');
assert.equal(detect({...a,providerTransition:true}),null,'changing candle venue suppresses a fresh cue');
assert.equal(detect({...a,marketOpen:false}),null,'closed markets never create signals');
assert.equal(detect({...a,now:now+91000}),null,'old closed M1 setup cannot reappear as new');
const gap=bullish.map(x=>({...x}));gap[15].time+=60000;
assert.equal(detect({...a,m1:gap}),null,'a missing M1 close cannot be invented');
const gap5=m5.map(x=>({...x}));gap5[1].time+=300000;
assert.equal(detect({...a,m5:gap5}),null,'an M5 hole must invalidate trend confirmation');
const wrong=m5.map(x=>({...x}));wrong[2]={...wrong[2],
 open:wrong[2].open,close:99,low:98,high:106};
assert.equal(detect({...a,m5:wrong}),null,'opposing M5 trend must not qualify a pullback continuation');
const c=load('lib/sniper-m5-early-cue.ts');
const d=c.chartM5EarlyCue({...a,preMove:null,opportunity:null,lean:null,
 m5Follow:null,reclaim:detect(a)});
assert.equal(d.stage,'PREBREAK');
assert.equal(d.side,'BUY');
assert.equal(d.trigger,detect(a).trigger);
assert.match(d.headline,/ترقب شراء/);
assert.equal(d.futureTradeAuthorized,false);
assert.equal(d.flowVerified,false);
const bad=c.chartM5EarlyCue({...a,price:106,preMove:null,opportunity:null,
 lean:null,m5Follow:null,reclaim:detect(a)});
assert.notEqual(bad.stage,'PREBREAK','a reclaim must never resurrect once the quote crosses');
const panel=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
assert.match(panel,/m1Reclaim=useMemo\(\(\)=>detectM1ReclaimWatch/);
assert.match(panel,/reclaim:m1Reclaim/);
assert.match(panel,/sniper-m5-prebreak-cue/);
console.log('PASS: causal BUY/SELL pullback-reclaim M1/M5 pre-trigger watch, quote/source/closed-time guards, no stale after-move signal and no broker orders');
