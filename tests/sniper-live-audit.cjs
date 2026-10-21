const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(
 fs.readFileSync('lib/sniper-live-audit.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
 }).outputText,{module:mod,exports:mod.exports});
const {issueLiveAlertAudit:issue,evaluateLiveAlertAudit:evaluate,
 summarizeLiveAlertAudit:summarize,cleanLiveAuditStorage:clean}=mod.exports;
const MIN=60000, base=Date.parse('2026-10-21T10:00:00Z');
const now=base+60*MIN+2000;
const signal={phase:'BREAK_CONFIRMED',side:'SELL',sourceAt:base+60*MIN,
 trigger:99.4,invalidation:100.3,targets:[98.1,97.3]};
const args={asset:'GOLD',source:'MT5',sourceReady:true,now,signal};
let record=issue([],args);
assert.equal(record.length,1);assert.equal(record[0].issuedAt,now);
assert.equal(record[0].target,98.1);assert.equal(record[0].outcome,'PENDING');
assert.equal(issue(record,args).length,1,'same breakout cannot be double-counted');
assert.equal(issue([], {...args,sourceReady:false}).length,0);
const bar=(offset,high,low,close=98.5)=>({
 time:base+offset*MIN,open:99,close,high,low
});
const hit=bar(61,99.3,97.9,98.0);
let updated=evaluate(record,[hit],base+62*MIN+1000);
assert.equal(updated[0].outcome,'HIT','target hit after the alert, without stop');
assert.equal(updated[0].resolvedAt,base+62*MIN);
assert.equal(updated[0].outcome,'HIT');
assert.equal(summarize(updated).targetHitRate,1);
assert.equal(summarize(updated).avgDetectionLagSeconds,2);
const both=bar(61,100.5,97.9,98.0);
assert.equal(evaluate(record,[both],base+62*MIN+1000)[0].outcome,'AMBIGUOUS',
 'both barriers in one candle must never claim a winner');
const stop=bar(61,100.5,98.5,99.6);
assert.equal(evaluate(record,[stop],base+62*MIN+1000)[0].outcome,'STOP');
const forming=bar(61,99.2,97.4,97.8);
assert.equal(evaluate(record,[forming],base+61*MIN+40000)[0].outcome,'PENDING',
 'unfinished bar cannot be used');
const skipped=bar(62,99.2,97.4,97.8);
assert.equal(evaluate(record,[skipped],base+63*MIN+1000)[0].outcome,'GAP',
 'missing first future candle is unknown, not a win');
const none=issue([], {...args,signal:{...signal,targets:[]}});
assert.equal(none[0].outcome,'NO_TARGET');
assert.equal(summarize(none).targetHitRate,null,'no target never counts as successful');
let early=issue([], {...args,signal:{phase:'PREPARE',side:'SELL',sourceAt:base+60*MIN,
 trigger:99.5,invalidation:100.3,targets:[]}});
assert.equal(early[0].kind,'PREPARE');
early=issue(early,{...args,now:now+MIN,
 signal:{phase:'PREPARE',side:'SELL',sourceAt:base+61*MIN,
 trigger:99.6,invalidation:100.3,targets:[]}});
assert.equal(early.length,1,'same early direction does not spam every minute');
const futureBreak=bar(61,99.8,98.9,99.0);
const earlyResult=evaluate(early,[futureBreak],base+62*MIN+1000);
assert.equal(earlyResult[0].outcome,'BREAK_OBSERVED');
assert.equal(summarize(earlyResult).earlyBreaks,1);
assert.ok(summarize(earlyResult).avgLeadSeconds>0);
assert.equal(clean([{},...updated], 'GOLD','MT5').length,1);
assert.equal(clean(updated,'BTC','MT5').length,0);
console.log('PASS: causal displayed-alert audit, speed, true target-before-stop, ambiguous/gap safeguards, and early detection');
