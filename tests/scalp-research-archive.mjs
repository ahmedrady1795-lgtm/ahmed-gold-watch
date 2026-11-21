import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cleanScalpResearch,mergeScalpResearch,
 restoredScalpResearch} from '../scripts/scalp-research-archive.mjs';
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
console.log('PASS: BTC/GOLD M1 checkpoint validation, no venue contamination, no replayed LIMITs or fabricated success, read-only archive API');
