const assert=require('node:assert/strict'),fs=require('node:fs'),
 ts=require('typescript'),vm=require('node:vm');
const loaded={};
function load(path){
 const mod={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
 }).outputText;
 vm.runInNewContext(code,{module:mod,exports:mod.exports,
   require:(p)=>{if(p==='./sniper-m15-bias')return load('lib/sniper-m15-bias.ts');
   throw Error('unexpected_dependency_'+p)}});
 return mod.exports;
}
const a=load('lib/sniper-m15-archive-store.ts');
const {m15WalkForward}=load('lib/sniper-m15-walkforward.ts');
const {buildM15Scenario}=load('lib/sniper-m15-scenario.ts');
const now=Date.parse('2026-10-19T19:00:00Z'),start=now-340*900000;
const rows=Array.from({length:340},(_,i)=>{
 const open=4140+i*.13+Math.sin(i*.32)*.9,close=open+.16+
   Math.sin(i*.2)*.13;
 return {time:start+i*900000,open,close,
 high:Math.max(open,close)+.25,low:Math.min(open,close)-.2};
});
assert.equal(a.acceptedArchiveSource('GOLD','Yahoo Finance · COMEX GC=F proxy'),false);
assert.equal(a.acceptedArchiveSource('GOLD','Biquote · MT5 XAUUSD candles'),true);
assert.equal(a.acceptedArchiveSource('GOLD','Exness/MT5 · XAUUSDm'),true);
assert.equal(a.acceptedArchiveSource('GOLD','MadeUp Vendor'),false);
const source='Biquote · MT5 XAUUSD candles';
const one=a.appendSourceM15({old:null,asset:'GOLD',source,
 rows:rows.slice(0,300),now});
assert.equal(one.added,300);
const two=a.appendSourceM15({old:one.ledger,asset:'GOLD',source,
 rows:rows.slice(240),now});
assert.equal(two.added,40);
const duplicate=a.appendSourceM15({old:two.ledger,asset:'GOLD',source,
 rows:rows.slice(240),now});
assert.equal(duplicate.added,0);
const conflict=rows.slice(240).map(x=>({...x}));
conflict[0].close+=8;conflict[0].high+=8;
const rejected=a.appendSourceM15({old:two.ledger,asset:'GOLD',source,
 rows:conflict,now});
assert.equal(rejected.conflicts,1);
assert.equal(rejected.added,0);
const verified=a.verifiedM15Archive({ledger:two.ledger,asset:'GOLD',
 source,now,live:rows.slice(-65)});
assert.equal(verified.ready,true,verified.reason);
assert.equal(verified.storedBars,340);
assert.equal(a.verifiedM15Archive({ledger:two.ledger,asset:'GOLD',
 source:'Twelve Data · XAU/USD',now,live:rows.slice(-65)}).ready,false);
const altered=rows.slice(-65).map(x=>({...x}));
altered[50].close+=10;altered[50].high+=10;
assert.equal(a.verifiedM15Archive({ledger:two.ledger,asset:'GOLD',
 source,now,live:altered}).ready,false,
 'an altered overlap must never be used to train price structure');
const dir=buildM15Scenario({history:rows.slice(-110),
 archive:verified.rows,archiveYears:0,now,
 anchor:rows.at(-1).close,side:'BUY',
 targets:[{price:rows.at(-1).close+7}],steps:6});
assert.equal(dir.ready,true,dir.reason);
assert.equal(dir.origin,'CAPTURED_M15');
assert.equal(dir.sourceBars,340);
const unmixed=buildM15Scenario({history:rows.slice(-110),
 archive:verified.rows.map(b=>({...b,close:b.close+30,high:b.high+30})),
 archiveYears:0,now,anchor:rows.at(-1).close,side:'BUY',
 targets:[{price:rows.at(-1).close+7}],steps:6});
assert.equal(unmixed.origin,'RECENT_M15',
 'historical fallback must not silently bridge OHLC provider mismatches');
const score=m15WalkForward(rows,now,100);
assert.ok(score.evaluated>50);
assert.equal(score.qualified,false,'walkforward is observational not an ML promotion');
assert.ok(score.selected<=score.evaluated);
assert.equal(score.accuracy,score.selected?Number((score.correct/score.selected).toFixed(4)):0);
const withFuture=m15WalkForward([...rows,{...rows.at(-1),time:now,
 close:999999,high:999999}],now,100);
assert.equal(withFuture.evaluated,score.evaluated,'unclosed future price cannot backfill outcomes');
assert.equal(withFuture.correct,score.correct);
const feed=fs.readFileSync('scripts/capture-m15-archive.mjs','utf8');

const route=fs.readFileSync('app/api/sniper-m15-archive/route.ts','utf8');
const ui=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
assert.match(feed,/\/api\/chart-history/);
assert.match(feed,/provider_revised_/);

assert.match(route,/raw\.githubusercontent\.com/);
assert.match(ui,/verifiedM15Archive/);
assert.match(ui,/m15WalkForward/);
assert.match(ui,/archive:verifiedArchive\.ready\?verifiedArchive\.rows/);
console.log('PASS: persistent source-isolated GOLD M15 capture, real-OHLC crossover, captured analogue and read-only OOS scorecard');
