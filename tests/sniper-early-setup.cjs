const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/sniper-early-setup.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:mod,exports:mod.exports});
const {advanceEarlySetup:step,earlySetupOpportunity:signal}=mod.exports;
const now=Date.parse('2026-11-17T10:00:00Z')+1000;
const bars=Array.from({length:18},(_,i)=>({time:now-1000-(18-i)*60000,
 open:100,close:100,high:100.5,low:99.5}));
const idle={phase:'WATCH',side:'WAIT',trigger:null,invalidation:null,sourceAt:null,targets:[]};
const lean={side:'BUY',phase:'OPEN',reason:'استمرار محتمل من زخم مغلق'};
const base={prior:null,scope:'GOLD:venue',now,price:100,ready:true,bars,opportunity:idle,lean};
assert.equal(step(base),null,'momentum alone never generates a BUY');
const op={...idle,phase:'PREPARE',side:'BUY',trigger:100.3,invalidation:99.4,sourceAt:now-1000,targets:[102]};
const armed=step({...base,opportunity:op});
assert.equal(armed.phase,'ARMED');
assert.equal(signal(armed).phase,'PREPARE');
assert.equal(armed.armedAt,now);
assert.equal(step({...base,opportunity:op,price:100.4}),null,'opening page after breakout cannot backfill preparation');
const movedOp={...op,trigger:101};
const waiting=step({...base,now:now+3000,prior:armed,price:100.1,opportunity:movedOp});
assert.equal(waiting.trigger,100.3,'levels freeze before crossing');
const hit=step({...base,now:now+6000,prior:waiting,price:100.32});
assert.equal(hit.phase,'TRIGGERED','live tick activates without waiting for M1 close');
assert.equal(hit.triggeredAt,now+6000);
assert.equal(hit.priceAt,100.32);
const later=step({...base,now:now+8000,prior:hit,price:100.5});
assert.equal(later.triggeredAt,hit.triggeredAt);assert.equal(later.priceAt,hit.priceAt);
assert.equal(step({...base,now:now+3000,prior:armed,price:101.5}).phase,'CANCELLED','no gap chase');
assert.equal(step({...base,now:now+3000,prior:armed,price:99.3}).phase,'CANCELLED');
assert.equal(step({...base,now:now+16000,prior:armed,price:100.32}).phase,'CANCELLED','no activation across stale polling gap');
const offline=step({...base,prior:armed,ready:false});
assert.equal(offline.phase,'CANCELLED');
assert.equal(step({...base,prior:offline,ready:false}),offline,'offline state is idempotent');
assert.equal(step({...base,prior:armed,now:armed.expiresAt}).phase,'EXPIRED');
assert.equal(step({...base,prior:armed,scope:'BTC:venue'}),null,'source/asset switch discards setup');
const touched={time:now-1000,open:100,high:100.4,low:99.9,close:100};
assert.equal(step({...base,opportunity:op,bars:[...bars,touched]}),null,'intrabar breakout and return is not a new preparation');
const sell=step({...base,opportunity:{...op,side:'SELL',trigger:99.7,invalidation:100.6,targets:[98]}});
assert.equal(sell.phase,'ARMED');
assert.equal(step({...base,prior:sell,now:now+3000,price:99.68}).phase,'TRIGGERED');
const reversal=step({...base,price:100,lean:{...lean,reason:'انعكاس محتمل بعد سحب قمة/قاع سابق'}});
assert.equal(reversal.phase,'ARMED');assert.equal(reversal.trigger,100.55);
assert.equal(step({...base,price:101,lean:{...lean,reason:'انعكاس محتمل'}}),null,'late reversal is not chased');
console.log('PASS early setup: pre-arm, frozen levels, live crossing, no momentum/backfill/chase, stale/gap cancellation and source isolation');
// New marker timestamps are first observations, never level-touch backfills.
const proofMod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/sniper-movement-proof.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:proofMod,exports:proofMod.exports});
const record=proofMod.exports.advanceMovementProof;
const evidence={prior:[],asset:'GOLD',source:'venue',bars:[],price:100,now,signal:signal(armed)};
const early=record(evidence);
const triggered=record({...evidence,prior:early,now:hit.triggeredAt,price:hit.priceAt,signal:signal(hit)});
assert.equal(triggered.length,2);assert.equal(triggered[1].leadSeconds,6);
assert.equal(triggered[1].issuedAt,hit.triggeredAt);assert.equal(triggered[1].priceAt,100.32);
const unrelated=record({...evidence,prior:[{...early[0],trigger:101}],now:hit.triggeredAt,price:hit.priceAt,signal:signal(hit)});
assert.equal(unrelated[1].leadSeconds,null,'unrelated same-side preparation cannot count as prior warning');
console.log('PASS forward record: exact setup linkage, timestamp and first trigger price');
