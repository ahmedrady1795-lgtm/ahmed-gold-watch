const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const out={};vm.runInNewContext(ts.transpileModule(
  fs.readFileSync('lib/spot-radar.ts','utf8'),
  {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}
).outputText,{exports:out});
const now=Date.parse('2026-10-21T14:00:00Z'),minute=60000;
const raw=Array.from({length:71},(_,i)=>{
  const t=now-(71-i)*minute,p=100+i*.008;
  const vol=i>=66?6500:1000;
  const taker=i>=66?vol*.71:vol*.5;
  return [t,String(p),String(p+.08),String(p-.06),String(p+.04),'5',
    t+minute-1,String(vol),55,'3',String(taker),'0'];
});
const closed=out.parseKlines(raw,now-30000);
assert.equal(closed.length,70,'Current unclosed bar must not enter scoring');
assert.equal(closed.at(-1).time,now-2*minute);
const parsed=out.parseKlines(raw,now);
assert.equal(parsed.length,71,'Fully closed minute may be analyzed');
const book=out.parseBook({bids:[['100.52','500'],['100.51','400']],asks:[['100.63','100'],['100.64','100']]},100.57);
assert.ok(book&&book.bidShare>.75);
assert.ok(book.spreadBps>0);
const scored=out.scoreCoin('TESTUSDT',2.1,12000000,parsed,.03,book,now);
assert.ok(scored,'Valid complete candles generate observation');
assert.ok(scored.volumeImpulse>3);
assert.ok(scored.buyShare>.6);
assert.ok(scored.candles.length>=60,'Detail re-scoring requires full history');
assert.ok(scored.invalidation<scored.price);
assert.ok(scored.target1>scored.price&&scored.target2>scored.target1);
const noBook=out.scoreCoin('TESTUSDT',2.1,12000000,parsed,.03,null,now);
assert.notEqual(noBook.phase,'EARLY','An EARLY signal requires valid depth');
const broken=parsed.map(c=>({...c}));broken[31].time+=5000;
assert.equal(out.scoreCoin('TESTUSDT',2,12000000,broken,.03,book,now),null,'Gaps fail closed');
assert.equal(out.scoreCoin('TESTUSDT',2,12000000,parsed,.03,book,now+600000),null,'Stale candles fail closed');
assert.equal(out.scoreCoin('TESTUSDT',20,12000000,parsed,.03,book,now)?.phase,'EXTENDED','Do not chase pumped coins');
assert.equal(out.parseBook({bids:[],asks:[]},100),null);
console.log('PASS: closed candles, executed volume, depth, targets, gaps, stale feed, extended-price guard. No performance claims.');
