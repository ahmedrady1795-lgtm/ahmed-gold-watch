const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/liquidity-foundation.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:m,exports:m.exports,require,console});
const {assessLiquidityFoundation:check}=m.exports;
const now=Date.parse('2026-10-12T12:00:00Z');
const ev=(kind,mins)=>({kind,at:now-mins*60000-300000,confirmedAt:now-mins*60000,level:99});
const context={ready:true,side:'SELL',volumeBasis:'TICK',
  events:[ev('SWEEP_HIGH',15),ev('BOS_DOWN',10)]};
let r=check({context,now,side:'BUY'});
assert.equal(r.opposing,true,'paired confirmed adverse liquidity events block fresh entry');
assert.match(r.volumeLabel,/Tick volume/);
assert.match(r.reason,/ضد الاتجاه/);
assert.equal(check({context,now,side:'SELL'}).opposing,false,'aligned events never veto');
assert.equal(check({context:{...context,side:'WAIT'},now,side:'BUY'}).opposing,false,'neutral HTF cannot claim confirmed opposition');
assert.equal(check({context:{...context,events:[ev('SWEEP_HIGH',15)]},now,side:'BUY'}).opposing,false,'single rejection is observation only');
assert.equal(check({context:{...context,events:[ev('SWEEP_HIGH',70),ev('BOS_DOWN',10)]},now,side:'BUY'}).opposing,false,'stale sweep is ignored');
assert.equal(check({context:{...context,events:[ev('SWEEP_HIGH',15),ev('BOS_DOWN',-1)]},now,side:'BUY'}).opposing,false,'future confirmation excluded');
assert.equal(check({context:{...context,events:[ev('SWEEP_HIGH',15),ev('BOS_DOWN',10)],volumeBasis:'NONE'},now,side:'BUY'}).opposing,true,'lack of volume does not create fabricated fills');
assert.equal(check({context:null,now,side:'BUY'}).ready,false,'unavailable liquidity evidence stays explicitly unknown');
assert.equal(check({context:{...context,events:[ev('SWEEP_LOW',15),ev('BOS_UP',10)]},now,side:'BUY'}).opposing,false);
console.log('PASS: causal closed-bar liquidity opposition, no future/stale events, volume provenance and neutral observation');
