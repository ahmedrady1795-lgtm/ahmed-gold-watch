const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/sniper-m15-forward-proof.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:mod,exports:mod.exports,require},{filename:'lib/sniper-m15-forward-proof.ts'});
const verify=mod.exports.evaluateM15ForwardProof,T=900000,anchorTime=Date.parse('2026-10-20T09:45:00Z');
const record={asset:'GOLD',source:'TEST',anchorTime,createdAt:anchorTime+11*60000,anchorPrice:100,
 bars:[{open:100,high:103,low:99,close:102},{open:102,high:104,low:100,close:103}]};
const future1={time:anchorTime+T,open:101,high:103,low:100,close:102};
const future2={time:anchorTime+2*T,open:102,high:103,low:100,close:101};
assert.equal(verify(record,[future1,future2],anchorTime+T).evaluated,0,
 'an open predicted candle can never be counted as a correct prediction');
const score=verify(record,[future1,future2],anchorTime+3*T);
assert.equal(score.evaluated,2);
assert.equal(score.directionMatches,1,'opposing second real candle is a miss');
assert.equal(score.meanAbsoluteCloseError,1,'uses close-price MAE not illustrated TP touches');
assert.equal(verify(record,[future2],anchorTime+3*T).evaluated,0,
 'must not skip missing first closed candle to cherry-pick a later outcome');
assert.equal(verify({...record,createdAt:anchorTime+T},[future1,future2],anchorTime+3*T).evaluated,0,
 'retrospective snapshots must never pass as before-the-event predictions');
const panel=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
assert.match(panel,/const anchor=validLive&&forming\?forming\.close:null/);
assert.match(panel,/sniper-m15-anchor-link/);
assert.match(panel,/anchorTime:forming\.time|const anchorTime=forming!\.time/);
assert.match(panel,/evaluateM15ForwardProof\(savedProof,actual,now\)/);
assert.doesNotMatch(panel,/const anchor=actual\.at\(-1\)\?\.close/,
 'do not start future candles from the old completed M15 while a live candle forms');

assert.match(panel,/stable\.anchorTime===forming\.time\?stable:null/,
 'pinned forecast must remain visible when live quote changes in same M15');
assert.doesNotMatch(panel,/stable\.scenario\.bars\[0\]\?\.open===anchor/,
 'do not hide a frozen forecast after a new quote tick');

assert.match(panel,/p\.anchorTime\+2\*900000<=now/,
 'show newest verification only once a full future bar has actually CLOSED');
