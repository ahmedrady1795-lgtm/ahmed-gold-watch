import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cleanScalpResearch,mergeScalpResearch,
 restoredScalpResearch,restoredBtcEarlyForward} from '../scripts/scalp-research-archive.mjs';
const now=Date.parse('2026-11-21T12:00:00Z'),issuedAt=now-120000;
const good={asset:'BTC',id:issuedAt,issuedAt,side:'BUY',state:'QUICK_TP',
 note:'paper-only',chartSource:'Kraken XBT/USD · fresh-candle fallback',
 directionObserved:'BUY',directionEvaluatedAt:issuedAt+60000,filledAt:issuedAt+1000,
 closedAt:issuedAt+2200,netR:0.35,lastQuoteAt:issuedAt+2000};
const envelope=records=>({schema:1,savedAt:now,records});
const validated=cleanScalpResearch(envelope([good]),now);
assert.equal(validated.records[0].netR,0.35);
const restored=restoredScalpResearch(validated,'BTC',now);
assert.equal(restored.history[0].state,'QUICK_TP',
 'verified research-only paper outcome stays frozen after reboot');
assert.equal(restored.history[0].directionObserved,'BUY');
assert.equal(restoredScalpResearch(validated,'GOLD',now).history.length,0,
 'BTC and GOLD never share an archive row');
const pending={...good,id:issuedAt+60000,issuedAt:issuedAt+60000,
 state:'PENDING',directionObserved:null,directionEvaluatedAt:null,
 filledAt:null,closedAt:null,netR:null};
const reboot=restoredScalpResearch(envelope([pending]),'BTC',now).history[0];
assert.equal(reboot.state,'UNKNOWN');
assert.equal(reboot.netR,null);
assert.equal(reboot.filledAt,null);
assert.equal(reboot.directionObserved,'UNKNOWN');
const old=envelope([good]);
const regression=envelope([{...good,state:'UNKNOWN',
 directionObserved:'UNKNOWN',netR:null,closedAt:now}]);
const combined=mergeScalpResearch(old,regression,now);
assert.equal(combined.records[0].netR,0.35,
 'a newer partial/pending process cannot erase an already observed paper exit');
const conflict=mergeScalpResearch(old,envelope([{...good,
 chartSource:'Coinbase BTC-USD'}]),now).records[0];
assert.equal(conflict.directionObserved,'UNKNOWN',
 'switching BTC venues at same issue time cannot be counted as a WIN');
assert.equal(conflict.netR,null);
assert.throws(()=>cleanScalpResearch(envelope([good,good]),now),/Duplicate/);
assert.throws(()=>cleanScalpResearch(envelope([{...good,id:good.id+1}]),now),/Invalid/);
assert.throws(()=>cleanScalpResearch(envelope([{...good,directionEvaluatedAt:issuedAt+2000}]),now),/Invalid/);
assert.throws(()=>cleanScalpResearch(envelope([{...good,asset:'OTHER'}]),now),/Invalid/);
assert.throws(()=>cleanScalpResearch(envelope([{...good,issuedAt:now+90000,id:now+90000}]),now),/Invalid/);
const library=fs.readFileSync('lib/scalp-every-candle.ts','utf8');
const boot=fs.readFileSync('scripts/start-with-audit-archive.mjs','utf8');
const endpoint=fs.readFileSync('app/api/scalp-research/route.ts','utf8');
const checkpoint=fs.readFileSync('scripts/checkpoint-scalp-research.mjs','utf8');
assert.match(library,/export function exportEveryM1Research/);
assert.match(library,/readEveryM1Rows\(asset,now\)/);
assert.match(boot,/restoredScalpResearch\(archive,asset\)/);
assert.match(boot,/before|BEFORE/);
assert.match(endpoint,/exportEveryM1Research\(\)/);
assert.match(checkpoint,/mergeScalpResearch\(previous,live\)/);
assert.doesNotMatch(checkpoint,/placeOrder|OrderSend|MT5_EXECUTE/);
// Independent early-flow audit is forward quote-only, never a paper LIMIT
// exit or an Exness trade; no reboot may revive an old watcher as ACTIVE.
const early={
 id:'BTC_M1_'+issuedAt+'_BUY',lane:'BTC_EARLY_M1',side:'BUY',
 score:76,setup:'SWEEP_RECLAIM',status:'WATCH',source:'Kraken XBT/USD',
 startedAt:issuedAt,lastQuoteAt:issuedAt+3000,expiresAt:issuedAt+60000,
 startPrice:100,threshold:.25,maxFavorable:.31,maxAdverse:.05,
 result:'FAVORABLE_FIRST',resolvedAt:issuedAt+3000,reason:'FORWARD_MOVE_OBSERVED'
};
const earlyPacket={...envelope([good]),earlyObservations:[early]};
assert.equal(cleanScalpResearch(earlyPacket,now).earlyObservations.length,1);
const earlyBoot=restoredBtcEarlyForward(earlyPacket,now);
assert.equal(earlyBoot.lanes.BTC_EARLY_M1.history[0].result,'FAVORABLE_FIRST');
assert.equal(earlyBoot.lanes.BTC_EARLY_M1.active,null);
const openEarly={...early,result:'OPEN',resolvedAt:null,maxFavorable:0,
 maxAdverse:0,lastQuoteAt:issuedAt};
const rebootOpen=restoredBtcEarlyForward({...envelope([]),earlyObservations:[openEarly]},now)
 .lanes.BTC_EARLY_M1;
assert.equal(rebootOpen.history[0].result,'UNKNOWN');
assert.equal(rebootOpen.history[0].reason,'UNOBSERVED_RENDER_RESTART');
assert.equal(rebootOpen.active,null);
const earlyMerged=mergeScalpResearch(earlyPacket,
 {...envelope([]),earlyObservations:[openEarly]},now);
assert.equal(earlyMerged.earlyObservations[0].result,'FAVORABLE_FIRST',
 'a healthy old forward observation cannot be erased by a new boot');
const venueConflict=mergeScalpResearch(earlyPacket,
 {...envelope([]),earlyObservations:[{...early,source:'Coinbase BTC-USD'}]},now);
assert.equal(venueConflict.earlyObservations[0].result,'UNKNOWN',
 'different venues cannot combine into an apparent early BUY win');
const afterExpiry=cleanScalpResearch({...envelope([]),earlyObservations:[
 {...early,resolvedAt:early.expiresAt+1000}]},now);
assert.equal(afterExpiry.earlyObservations[0].result,'UNKNOWN',
 'late first-touch cannot prove a win on the closed 60-second window');
assert.throws(()=>cleanScalpResearch({...envelope([]),
 earlyObservations:[early,early]},now),/Duplicate BTC/);
assert.throws(()=>cleanScalpResearch({...envelope([]),
 earlyObservations:[{...early,lane:'GOLD_EARLY_M1'}]},now),/Invalid BTC/);
assert.match(boot,/restoredBtcEarlyForward\(archive\)/);
assert.match(endpoint,/exportBtcEarlyForwardObservations\(\)/);
console.log('PASS: BTC early lead forward cohort archived, frozen source/timing, late outcome UNKNOWN and no revived orders');

console.log('PASS: BTC/GOLD M1 checkpoint validation, no venue contamination, no replayed LIMITs or fabricated success, read-only archive API');
