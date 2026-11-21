const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const moduleRef={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/market-lead-ai.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:moduleRef,exports:moduleRef.exports},{filename:'market-lead-ai.ts'});
const {updateGoldMarketLead:update,getMarketLead}=moduleRef.exports;
const at=Date.parse('2026-11-20T12:00:00Z');
const fast=(stamp,dom=true,velocity=.02)=>({
  ok:true,side:'BUY',stage:'PRE_TRIGGER',score:85,confidence:85,
  receivedAt:stamp,at:stamp,domReady:dom,
  bookImbalance:42,pressureChange:21,replenishDelta:28,
  acceleration:.021,velocity15s:velocity,persistence:86,price:4100
});
let v=update(fast(at-2500,false),at);
assert.equal(v.stage,'OFFLINE');
assert.equal(v.armed,false,'No validated broker book: never arm');
assert.equal(getMarketLead('GOLD',at).armed,false,'Stored lead must be offline');

v=update(fast(at+500,true),at+600);
assert.equal(v.armed,false,'First real broker observation cannot arm');
v=update(fast(at+1000,true),at+1100);
assert.equal(v.mode,'DOM');
assert.equal(v.stage,'ARMED');
assert.equal(v.armed,true);
assert.equal(v.released,false);
assert.ok(v.evidence.some(x=>x.includes('عمق الطلب')));
assert.equal(v.metrics.flowDelta,0,'Price tick votes are not executed trades');
assert.equal(v.windowSeconds,null,'No fabricated time-to-move forecast');

v=update(fast(at+1500,true,1.2),at+1600);
assert.equal(v.armed,false,'Movement already released is not an early signal');
assert.equal(v.stage,'RELEASED');

v=update(fast(at+20000,true),at+1600);
assert.equal(v.stage,'OFFLINE','Future-dated source must be rejected');
assert.equal(v.armed,false);

v=update(fast(at+50000,true),at+50100);
assert.equal(v.armed,false,'Disconnect clears historical votes');
assert.equal(v.stage,'BUILDING');
v=update(fast(at+51000,false),at+51100);
assert.equal(v.stage,'OFFLINE');
assert.equal(getMarketLead('GOLD',at+51100).armed,false,'Offline resets cached signal');

const wave={ok:true,side:'BUY',at:at+55000,confidence:85,score:82,
  imbalance:40,acceleration:.3,velocity1s:.01,persistence:90};
v=update({ok:false},at+55100,wave);
assert.equal(v.mode,'MICRO_FLOW');
assert.equal(v.armed,false,'Price-tick proxy must never arm GOLD alert');
assert.equal(v.metrics.bookImbalance,0,'Biquote tick proxy is not DOM');
assert.equal(v.metrics.flowDelta,0,'No fabricated aggressive flow');
console.log('PASS: Render verified DOM early alert and stale/no-DOM safety');
