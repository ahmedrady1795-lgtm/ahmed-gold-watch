const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/chart-zone-merge.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:mod,exports:mod.exports,require,console});
const {collapseChartZones,findOpposingOverlap}=mod.exports;
const zone=(kind,key,low,high)=>({kind,key,label:key,low,high,price:(low+high)/2});
const input=[
  zone('TARGET','TP1',102,102),zone('TARGET','TP2',105,105),
  zone('STOP','S',98,98),
  zone('DEMAND','D1',99,99.5),zone('BUY_REBOUND','B1',99.4,99.8),
  zone('DEMAND','D2',96,96.2),zone('DEMAND','D3',91,91.2),
  zone('SUPPLY','U1',99.42,99.7),zone('SELL_REBOUND','R1',99.6,99.9)];
const out=collapseChartZones(input,100);
assert.equal(out.filter(z=>z.kind==='TARGET').map(z=>z.key).join(','),'TP1,TP2',
  'never deduplicate real target stages');
assert.equal(out.filter(z=>z.kind==='STOP').length,1,'invalidation is never folded');
const buy=out.filter(z=>['DEMAND','BUY_REBOUND'].includes(z.kind));
assert.equal(buy.length,2,'overlapping demand/rebound combine; distant zones stay distinct and capped');
assert.ok(buy.some(z=>z.low===99&&z.high===99.8),'merged zone spans real prices only');
assert.ok(buy.some(z=>z.low===96),'prefer the nearest two zones');
assert.ok(!buy.some(z=>z.low===91),'hide only the remote third zone');
assert.equal(out.filter(z=>['SUPPLY','SELL_REBOUND'].includes(z.kind)).length,1,
  'overlapping sell-side levels combine independently');
assert.equal(out.length,6);
const overlap=findOpposingOverlap(out,99.6);
assert.ok(overlap,'an opposing overlap must be explicitly identified');
assert.equal(overlap.low,99.42);assert.equal(overlap.high,99.8);
assert.equal(findOpposingOverlap(out.filter(z=>z.kind!=='SUPPLY'&&z.kind!=='SELL_REBOUND'),99.6),null);

console.log('PASS: chart overlap merger, opposite zones, all targets and invalidations');
