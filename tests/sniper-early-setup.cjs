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
// Order-flow and volume-at-price are part of the live PRE-arm decision,
// but only if genuine same-venue observations predate the decision.
const brokerFlow={ready:true,side:'BUY',asOf:now-3000,observedAt:now-2000,
 quality:'INDICATIVE_BROKER',profileReady:true,poc:99.9,vah:100.2,val:99.6};
const flowAgree=step({...base,opportunity:op,flow:brokerFlow});
assert.equal(flowAgree.phase,'ARMED');
assert.match(flowAgree.reason,/POC/,'aligned broker profile is labelled indicative');
const flowReject=step({...base,opportunity:op,flow:{...brokerFlow,side:'SELL'}});
assert.equal(flowReject,null,'contradictory same-venue DOM/profile cannot arm');
const staleFlow=step({...base,opportunity:op,flow:{...brokerFlow,side:'SELL',asOf:now-20000}});
assert.equal(staleFlow.phase,'ARMED','stale flow never vetoes or confirms');
assert.match(staleFlow.reason,/غير مؤكد/);
const futureFlow=step({...base,opportunity:op,flow:{...brokerFlow,side:'SELL',asOf:now+1000}});
assert.equal(futureFlow.phase,'ARMED','future flow cannot alter an earlier decision');
const liqOpposed={ready:true,sourceAt:now-2000,sweep:'HIGH_RECLAIMED_DOWN'};
assert.equal(step({...base,opportunity:op,liquidity:liqOpposed}),null,
 'confirmed opposing M15 liquidity sweep vetoes early BUY');
const liqAgree={...liqOpposed,sweep:'LOW_RECLAIMED_UP'};
assert.match(step({...base,opportunity:op,liquidity:liqAgree}).reason,/سيولة M15/);
assert.equal(step({...base,opportunity:op,
 liquidity:{...liqOpposed,sourceAt:now-700000}}).phase,'ARMED',
 'expired M15 sweep must not veto');
assert.equal(step({...base,opportunity:op,prior:armed,
 flow:{...brokerFlow,side:'SELL',asOf:now+1000,observedAt:now+1000},
 now:now+2000}).phase,'CANCELLED','opposing fresh flow cancels an armed setup before crossing');
assert.equal(step({...base,opportunity:op,price:100.4}),null,'opening page after breakout cannot backfill preparation');
const movedOp={...op,trigger:101};
const waiting=step({...base,now:now+3000,prior:armed,price:100.1,opportunity:movedOp});
assert.equal(waiting.trigger,100.3,'levels freeze before crossing');
const firstCross=step({...base,now:now+6000,prior:waiting,price:100.32,quoteAt:now+6000});
assert.equal(firstCross.phase,'ARMED','first tick above the level is only a test');
assert.equal(signal(firstCross).phase,'TESTING','first breakout tick never advertises entry');
const repeatedQuote=step({...base,now:now+7000,prior:firstCross,
 price:100.33,quoteAt:now+6000});
assert.equal(repeatedQuote.phase,'ARMED','same quote timestamp must not confirm');
const recross=step({...base,now:now+8000,prior:firstCross,
 price:100.1,quoteAt:now+8000});
assert.equal(recross.phase,'CANCELLED','failed first-tick break is canceled early');
assert.match(recross.reason,/فشل اختبار الاختراق/);
const tooSoon=step({...base,now:now+7500,prior:firstCross,
 price:100.34,quoteAt:now+7500});
assert.equal(tooSoon.phase,'ARMED','minimum quote separation must elapse');
const hit=step({...base,now:now+9000,prior:tooSoon,
 price:100.36,quoteAt:now+9000});
assert.equal(hit.phase,'TRIGGERED','later fresh quote confirms level after the hold');
assert.equal(hit.triggeredAt,now+9000);
assert.equal(hit.priceAt,100.36);
const later=step({...base,now:now+11000,prior:hit,price:100.5});
const falseBreak=step({...base,now:now+12000,prior:hit,price:100.05,
 quoteAt:now+12000});
assert.equal(falseBreak.phase,'CANCELLED','post-confirmation reclaim must cancel stale BUY');
assert.match(falseBreak.reason,/فشل اختراق شراء/);
assert.equal(signal(falseBreak).side,'WAIT','rejected breakout is no longer an active buy');
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
const sellTest=step({...base,prior:sell,now:now+3000,price:99.68,quoteAt:now+3000});
assert.equal(sellTest.phase,'ARMED','SELL also waits for independent observation');
assert.equal(step({...base,prior:sellTest,now:now+6000,price:99.64,
 quoteAt:now+6000}).phase,'TRIGGERED','SELL confirms on later quote');
const reversal=step({...base,price:100,lean:{...lean,reason:'انعكاس محتمل بعد سحب قمة/قاع سابق'}});
assert.equal(reversal.phase,'ARMED');assert.equal(reversal.trigger,100.55);
assert.equal(step({...base,price:101,lean:{...lean,reason:'انعكاس محتمل'}}),null,'late reversal is not chased');
// Fresh closed-M1 compression beside a prior swing creates a WATCH level
// before price breaks it; no DOM or executed volume is claimed.
const compressionBars=bars.map((b,i)=>({
 ...b,open:100,close:100,high:i<14?100.5:100.25,
 low:i<14?99.5:99.85
}));
compressionBars[14]={...compressionBars[14],open:100.15,close:100.05,high:100.43,low:99.94};
compressionBars[15]={...compressionBars[15],open:100.08,close:100.02,high:100.22,low:99.91};
compressionBars[16]={...compressionBars[16],open:100.03,close:99.98,high:100.18,low:99.87};
compressionBars[17]={...compressionBars[17],open:99.99,close:99.95,high:100.15,low:99.86};
const compressed=step({...base,bars:compressionBars,price:99.96});
assert.equal(compressed?.phase,'ARMED','compressed swing should arm before break');
assert.equal(compressed?.side,'SELL');
assert.match(compressed.reason,/انضغاط M1/);
assert.ok(compressed.trigger<99.96,'trigger must be ahead of price');
assert.equal(step({...base,bars:compressionBars,price:compressed.trigger-.01}),null,
 'late quote below the trigger cannot invent an earlier setup');
assert.equal(step({...base,bars:compressionBars,price:99.96,
 flow:{...brokerFlow,side:'BUY'}}),null,'opposing flow vetoes compression');
// Pre-existing M1 support reclaimed by completed candles; watch is emitted
// BEFORE the next local high, never reconstructed after a breakout.
const recoveryBars=bars.map((b,i)=>({
 ...b,open:100,high:101,low:99,close:100
}));
recoveryBars[14]={...recoveryBars[14],open:99.8,high:100,low:98.93,close:99.18};
recoveryBars[15]={...recoveryBars[15],open:99.18,high:99.7,low:99.05,close:99.22};
recoveryBars[16]={...recoveryBars[16],open:99.22,high:99.86,low:99.12,close:99.35};
recoveryBars[17]={...recoveryBars[17],open:99.35,high:99.93,low:99.32,close:99.53};
const reclaimed=step({...base,bars:recoveryBars,price:99.6});
assert.equal(reclaimed?.phase,'ARMED','M1 support reclaim must arm ahead of fresh local high');
assert.equal(reclaimed?.side,'BUY');
assert.match(reclaimed.reason,/استرداد مستوى سعري/);
assert.ok(reclaimed.trigger>99.6);
assert.equal(step({...base,bars:recoveryBars,price:reclaimed.trigger+.03}),null,
 'no late entry after reclaimed high has already broken');
const cancelledOld={...reclaimed,phase:'CANCELLED',sourceAt:now-5*60000,
 armedAt:now-5*60000,lastAt:now-3000,expiresAt:now+2*60000};
assert.equal(step({...base,bars:recoveryBars,price:99.6,prior:cancelledOld})?.phase,
 'ARMED','feed recovery can rearm after two NEW closed M1 bars');
const panel=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
assert.match(panel,/hasDirectionalWatch\?\(watchIsReversal\?/,
 'on-chart status distinguishes reversal and continuation waves');
assert.match(panel,/اتجاه مرصود بعد بدء الحركة/,
 'on-chart tooltip labels continuation as observed after movement starts');
assert.match(panel,/candleLean:hasDirectionalWatch\?candleLean:undefined/,
 'live closed-M1 waves are journaled, not only reversal wicks');
assert.match(panel,/className="sniper-m5-chart-status"/,
 'default compact status is anchored inside actual M5 SVG');
assert.doesNotMatch(panel,/className=\{\x27sniper-m5-early-signal/,
 'giant multi-line early signal banner must not appear above chart');
const markerSvg=fs.readFileSync('components/SniperOpportunityMarkers.tsx','utf8');
assert.match(markerSvg,/رصد بيع/,'bearish wave has visible sell observation on chart');
assert.match(markerSvg,/رصد شراء/,'bullish wave has visible buy observation on chart');
assert.match(panel,/showCrossTest\?'اختبار اختراق /,
 'first quote crossing remains explicitly testing');
assert.match(panel,/showRejected\?'فشل اختراق /,
 'rejected breakout is clearly shown inside chart');
console.log('PASS early setup: frozen prearm, 2.5s distinct quote confirmation, false-break cancellation, audit integrity and no chase');
// New marker timestamps are first observations, never level-touch backfills.
const proofMod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/sniper-movement-proof.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:proofMod,exports:proofMod.exports});
const record=proofMod.exports.advanceMovementProof;
const evidence={prior:[],asset:'GOLD',source:'venue',bars:[],price:100,now,signal:signal(armed)};
const early=record(evidence);
const triggered=record({...evidence,prior:early,now:hit.triggeredAt,price:hit.priceAt,signal:signal(hit)});
assert.equal(triggered.length,2);assert.equal(triggered[1].leadSeconds,9);
assert.equal(triggered[1].issuedAt,hit.triggeredAt);assert.equal(triggered[1].priceAt,100.36);
const unrelated=record({...evidence,prior:[{...early[0],trigger:101}],now:hit.triggeredAt,price:hit.priceAt,signal:signal(hit)});
assert.equal(unrelated[1].leadSeconds,null,'unrelated same-side preparation cannot count as prior warning');
console.log('PASS forward record: exact setup linkage, timestamp and first trigger price');
