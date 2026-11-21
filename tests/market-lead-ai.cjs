const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/market-lead-ai.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:mod,exports:mod.exports},{filename:'market-lead-ai.ts'});
const {updateGoldMarketLead:update}=mod.exports;
const at=Date.parse('2026-11-20T12:00:00Z');
const fast=(stamp,dom=true,velocity=.02)=>({
  ok:true,side:'BUY',stage:'PRE_TRIGGER',score:85,confidence:85,receivedAt:stamp,
  domAvailable:dom,bookImbalance:42,pressureChange:21,replenishDelta:28,
  acceleration:.021,velocity15s:velocity,persistence:86,price:4100
});

// A broker tick stream WITHOUT depth must not arm DOM BUY/SELL, even if its
// direction and velocity scores look compelling.
let v=update(fast(at-2500,false),at);
v=update(fast(at-2000,false),at+500);
assert.equal(v.mode,'MICRO_FLOW');
assert.equal(v.armed,false);
assert.ok(!v.source.includes('broker DOM'));
assert.equal(v.metrics.bookImbalance,0,'price tick votes are not order-book depth');
assert.ok(!v.evidence.some(x=>x.includes('عمق الطلب')));

// Fresh independent broker depth may arm while price is still quiet.
v=update(fast(at+500,true),at+600);
assert.equal(v.armed,false,'single fresh broker snapshot is not persistent proof');
v=update(fast(at+1000,true),at+1100);
assert.equal(v.mode,'DOM');
assert.equal(v.stage,'ARMED');
assert.equal(v.armed,true);
assert.equal(v.released,false);
assert.ok(v.evidence.some(x=>x.includes('عمق الطلب')));
assert.ok(v.windowSeconds===null,'unmeasured time-to-move must not be fabricated');

// If price already moves, this is follow-through, never a new early alert.
v=update(fast(at+1500,true,1.2),at+1600);
assert.equal(v.armed,false);
assert.equal(v.stage,'RELEASED');

// A replayed/future-dated tick must turn off the signal.
v=update(fast(at+20000,true),at+1600);
assert.equal(v.stage,'OFFLINE');
assert.equal(v.armed,false);

// A long source gap clears historical supporting votes.
v=update(fast(at+50000,true),at+50100);
assert.equal(v.armed,false,'the first quote after a disconnect needs new observations');
assert.equal(v.stage,'BUILDING');

console.log('PASS: verified early DOM alerts, non-DOM safety, release, source freshness and reconnect');
