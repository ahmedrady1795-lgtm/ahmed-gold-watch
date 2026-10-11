const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/gold-tick-quality.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:mod,exports:mod.exports});
const {acceptGoldPulse:accept}=mod.exports;
const at=Date.parse('2026-10-11T14:00:00Z');
const quote={price:4200,sourceTime:at-2000,fetchedAt:at-200,status:'live',
  bid:4199.8,ask:4200.2};
const tick=accept(quote,at);
assert.ok(tick&&tick.price===4200,'recent source observation should pass');
assert.equal(accept(quote,at,tick),null,'duplicate snapshot must not count as independent tick');
assert.equal(accept({...quote,price:4200.5},at,tick)?.price,4200.5,'genuine price change accepted');
assert.equal(accept({...quote,sourceTime:at-120000,fetchedAt:at},at),null,
  'recent HTTP fetch must never freshen an old market quote');
assert.equal(accept({...quote,sourceTime:null},at),null,'missing source timestamp fails closed');
assert.equal(accept({...quote,sourceTime:at+5000},at),null,'future data is invalid');
assert.equal(accept({...quote,status:'closed_or_stale'},at),null,'closed market never creates micro ticks');
assert.equal(accept({...quote,fetchedAt:at-120000},at),null,'stale fetch is rejected');
assert.equal(accept({...quote,status:'delayed',sourceTime:at-8000},at)?.price,4200,
  'brief near-live provider delay is accepted conservatively');
assert.equal(accept({...quote,sourceTime:at-10001},at),null,
  'gold microstructure age limit must be enforced');
console.log('PASS: no replayed, closed, future or stale gold provider pulses');
