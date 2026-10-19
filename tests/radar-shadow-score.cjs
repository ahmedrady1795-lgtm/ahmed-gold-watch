const assert=require('node:assert/strict'),fs=require('node:fs'),
 ts=require('typescript'),vm=require('node:vm');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/radar-shadow-score.ts','utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText,{module:mod,exports:mod.exports});
const x=mod.exports;
const t=Date.parse('2026-10-20T12:34:30Z');
const bar=(at,close,open=100)=>({time:at,open,high:Math.max(open,close)+1,
 low:Math.min(open,close)-1,close});
const olds=Array.from({length:6},(_,i)=>bar(Math.floor(t/60000)*60000-(6-i)*60000,100+i));
assert.equal(x.baselineAt(olds,t),'BUY');
assert.equal(x.baselineAt(olds.slice(-4),t),'WAIT');
assert.equal(x.baselineAt([...olds,bar(Math.floor(t/60000)*60000,999)],t),'BUY',
 'in-progress M1 cannot leak into momentum baseline');
const a=x.recordRadarSignal({ledger:x.newLedger(),now:t,sourceAt:t-500,
 side:'BUY',price:105,confirm:106,invalidate:103,
 l2Snapshots:9,baseline:'BUY'});
assert.equal(a.recorded,true,a.reason);assert.equal(a.ledger.events.length,1);
const e=a.ledger.events[0];
assert.equal(e.m1.barAt,Date.parse('2026-10-20T12:35:00Z'));
assert.equal(e.m15.barAt,Date.parse('2026-10-20T12:45:00Z'));
assert.equal(e.m1.status,'PENDING');
assert.equal(x.recordRadarSignal({ledger:a.ledger,now:t+60000,sourceAt:t+59000,
 side:'SELL',price:105,confirm:103,invalidate:106,
 l2Snapshots:9,baseline:'SELL'}).recorded,false,'no burst double count');
assert.equal(x.recordRadarSignal({ledger:x.newLedger(),now:t,sourceAt:t-500,
 side:'BUY',price:105,confirm:106,invalidate:103,
 l2Snapshots:0,baseline:'BUY'}).recorded,false,'without L2 persistence reject');
assert.equal(x.recordRadarSignal({ledger:x.newLedger(),now:t,sourceAt:t-12000,
 side:'BUY',price:105,confirm:106,invalidate:103,
 l2Snapshots:9,baseline:'BUY'}).recorded,false,'stale trade reject');
const partial=x.settleRadarOutcomes({ledger:a.ledger,now:t+40000,
 m1:[bar(e.m1.barAt,112,105)],m15:[]});
assert.equal(partial.changed,0,'never settle forming bar');
const lastM1=bar(e.m1.barAt,110,105),lastM15=bar(e.m15.barAt,112,105);
const scored1=x.settleRadarOutcomes({ledger:a.ledger,
 now:e.m1.barAt+60000+5000,m1:[lastM1],m15:[]});
assert.equal(scored1.changed,1);
assert.equal(scored1.ledger.events[0].m1.direction,'BUY');
assert.equal(scored1.ledger.events[0].m15.status,'PENDING');
const scored2=x.settleRadarOutcomes({ledger:scored1.ledger,
 now:e.m15.barAt+900000+5000,m1:[lastM1],m15:[lastM15]});
assert.equal(scored2.changed,1);
const score=x.radarShadowScore(scored2.ledger);
assert.equal(score.m1.samples,1);assert.equal(score.m15.samples,1);
assert.equal(score.m1.pairedN,1);assert.equal(score.m1.correct,1);
assert.equal(score.m1.pairedRadarCorrect,1);
assert.equal(score.m1.pairedBaselineCorrect,1);
assert.equal(score.m1.qualified,false);
assert.equal(score.modelQualified,false);
assert.equal(score.tradingEnabled,false);
assert.equal(score.m15.edgeProven,false);
const opposite=x.settleRadarOutcomes({ledger:a.ledger,
 now:e.m15.barAt+900000+5000,m1:[bar(e.m1.barAt,100,105)],m15:[]});
assert.equal(opposite.ledger.events[0].m1.correct,false);
assert.equal(x.settleRadarOutcomes({ledger:a.ledger,
 now:e.m15.barAt+900000+5000,m1:[bar(e.m1.barAt+60000,112,105)],
 m15:[]}).ledger.events[0].m1.status,'PENDING',
 'later unrelated bar cannot substitute the first exact M1');
const missing=x.settleRadarOutcomes({ledger:a.ledger,
 now:t+9*3600000,m1:[],m15:[]});
assert.equal(missing.ledger.events[0].m1.status,'NO_DATA');
assert.equal(missing.ledger.events[0].m15.status,'NO_DATA');
const filtered=x.validShadowBars([bar(e.m1.barAt,110,105),
 bar(e.m1.barAt+60000,115,105)],e.m1.barAt===0?0:60000,e.m1.barAt+64000);
assert.equal(filtered.length,1,'future/in-progress bar excluded');
// Immutable archival merge: do not double count and never overwrite an
// independently witnessed score with an unobserved or pending later copy.
const mergedFirst=x.mergeRadarShadowArchives(scored2.ledger,a.ledger,t+86400000);
assert.equal(mergedFirst.events.length,1,'same radar ID must never inflate sample count');
assert.equal(mergedFirst.events[0].m1.status,'SCORED');
assert.equal(mergedFirst.events[0].m15.status,'SCORED');
const mergedSecond=x.mergeRadarShadowArchives(a.ledger,scored2.ledger,t+86400000);
assert.equal(mergedSecond.events[0].m1.status,'SCORED','late result fills pending');
const noData=x.mergeRadarShadowArchives(missing.ledger,scored2.ledger,t+86400000);
assert.equal(noData.events[0].m15.status,'SCORED','real bar outcome outranks missing data');
assert.equal(noData.events[0].price,e.price,'frozen signal issue price does not repaint');
const display=fs.readFileSync('components/OrderFlowRadar.tsx','utf8');
const backup=fs.readFileSync('scripts/checkpoint-radar-shadow.mjs','utf8');
assert.match(display,/\/api\/radar-shadow-score/,'badge reads server-only outcomes');
assert.match(display,/shadow\.m1\.pairedN>=50/,'low sample rates are never displayed as success');
assert.match(display,/shadow\.m1\.pairedRadarRate/,'shown radar performance uses the same cohort as baseline');
assert.match(display,/shadow\?\.m1\.missing/,'unobserved horizons are explicitly disclosed');
assert.match(backup,/mergeRadarShadowArchives/,'checkpoint shares immutable merge semantics');
assert.match(backup,/if\(!remote\.events\.length\)/,
 'empty Render worker cannot overwrite a durable archive');
const restored=x.sanitizeShadowLedger(scored2.ledger,t+86400000);
assert.equal(restored.events.length,1);
assert.equal(x.sanitizeShadowLedger({schema:'BAD',events:[e]},t).events.length,0);
const worker=fs.readFileSync('scripts/radar-shadow-worker.mjs','utf8');
const route=fs.readFileSync('app/api/radar-shadow-score/route.ts','utf8');
const boot=fs.readFileSync('scripts/start-with-audit-archive.mjs','utf8');
assert.match(worker,/wss:\/\/ws-feed\.exchange\.coinbase\.com/);
assert.match(worker,/getHistory\(900000,now\)/);
assert.match(worker,/view\.phase!=='CONFIRMED'/);
assert.match(worker,/view\.micro\.snapshots<5/);
assert.match(worker,/recordRadarSignal/);
assert.match(worker,/settleRadarOutcomes/);
assert.match(boot,/radar-shadow-worker\.mjs/);
assert.match(route,/sanitizeShadowLedger/);
assert.doesNotMatch(route,/export async function POST/,
 'client POST cannot forge server-observed event history');
console.log('PASS: server-only Coinbase radar event freezes, no-lookahead full M1/M15, honest paired metrics and missing bars');
