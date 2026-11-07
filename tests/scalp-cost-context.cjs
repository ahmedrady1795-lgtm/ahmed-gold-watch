const assert=require('node:assert/strict'),fs=require('node:fs'),
vm=require('node:vm'),ts=require('typescript');
const out={};
const js=ts.transpileModule(fs.readFileSync('lib/scalp-cost-context.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText;
vm.runInNewContext(js,{exports:out,Number,Math},{filename:'scalp-cost-context.ts'});
const describe=out.describeScalpCostContext;
const T=Date.parse('2026-11-07T10:00:00Z'),MINUTE=60000;
const bars=Array.from({length:30},(_,i)=>({
 time:T+i*MINUTE,open:75000+i*.1,close:75000+i*.1+.4,
 high:75000+i*.1+1.2,low:75000+i*.1-1.0
}));
const now=bars.at(-1).time+MINUTE+1000;
const quote={price:75000,bid:74999,ask:75001,at:now-200,source:'Coinbase BTC-USD'};
const paper=describe({asset:'BTC',quote,plans:[{cost:106.39}],
 bars,now});
assert.equal(paper.quoteVenue,'PUBLIC_SPOT');
assert.equal(paper.brokerExecutionVerified,false);
assert.equal(paper.costMode,'ESTIMATED_NOT_BROKER_VERIFIED');
assert.equal(paper.costPerUnit,106.39);
assert.equal(paper.feasibility,'COST_DOMINATED');
assert.ok(paper.costToRange>30);
assert.match(paper.note,/NOT observed Exness/);
const broker=describe({asset:'GOLD',quote:{...quote,source:'Exness/MT5',
 price:3000,bid:2999.99,ask:3000.01},plans:[{cost:.28}],bars,now});
assert.equal(broker.quoteVenue,'BROKER_FEED');
assert.equal(broker.brokerExecutionVerified,false,
 'broker quote is NOT verified round-trip execution');
const gap=bars.map(b=>({...b}));gap[11].time+=20000;
const invalid=describe({asset:'BTC',quote,plans:[{cost:106.39}],bars:gap,now});
assert.equal(invalid.feasibility,'NO_DATA',
 'discontinuous source cannot borrow profitable historical ranges');
assert.equal(invalid.medianObservedM1Range,null);
const stale=describe({asset:'BTC',quote,plans:[{cost:106.39}],
 bars,now:now+120001});
assert.equal(stale.feasibility,'NO_DATA');
const desk=fs.readFileSync('lib/scalp-desk.ts','utf8');
const ui=fs.readFileSync('app/scalp/page.tsx','utf8');
assert.match(desk,/describeScalpCostContext\(\{/);
assert.match(desk,/executionEconomics,qualityGates/);
assert.match(ui,/ScalpCostContext data=\{desk\?\.bitcoin\?\.executionEconomics\}/);
assert.match(ui,/السعر من بورصة Spot وليس حساب Exness/);
console.log('PASS: public BTC spot cost cannot masquerade as Exness fills; invalid/stale M1 range never certifies attainable scalps');
