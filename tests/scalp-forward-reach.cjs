const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync('lib/scalp-selection.ts','utf8');
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS
}}).outputText,{module:m,exports:m.exports});
const {observedForwardReach}=m.exports;
const start=Date.parse('2026-10-10T00:00:00Z');
const bars=Array.from({length:230},(_,i)=>({
  time:start+i*60000,open:100+i*.1,
  close:100+(i+1)*.1,high:100+(i+1)*.1+.05,low:100+i*.1-.05
}));
const m1=observedForwardReach(bars,'BUY',1);
assert.ok(m1.samples>=200);
assert.ok(Math.abs(m1.favorableP55-.15)<.00001,
  'M1 reach must begin at a completed close and use the NEXT minute high');
assert.ok(Math.abs(m1.adverseP50-.05)<.00001);
const m5=observedForwardReach(bars,'BUY',5);
assert.ok(m5.samples>=30);
assert.ok(Math.abs(m5.favorableP75-.55)<.00001,
  'M5 reach must use subsequent five true M1 candles');
const sellBars=bars.map(c=>({...c,open:300-c.open,close:300-c.close,
  low:300-c.high,high:300-c.low}));
assert.ok(Math.abs(observedForwardReach(sellBars,'SELL',1).favorableP55-m1.favorableP55)<1e-6);
assert.ok(Math.abs(observedForwardReach(sellBars,'SELL',5).favorableP75-m5.favorableP75)<1e-6);
const broken=bars.map(x=>({...x}));
broken[broken.length-2].time+=30000;
assert.ok(observedForwardReach(broken,'BUY',1).samples<m1.samples,
  'a discontinuous interval must not count as an observed forward window');
const small=observedForwardReach(bars.slice(-50),'BUY',5);
assert.ok(small.samples<30,'not enough independent five-minute trials');
const plans=fs.readFileSync('lib/scalp-opportunities.ts','utf8');
assert.match(plans,/const forwardReach=observedForwardReach\(a,chosen\.side,horizon\)/,
  'BTC as well as GOLD, M1 as well as M5, must use causal lookahead windows');
assert.match(plans,/horizon===1\?forwardReach\.favorableP55:forwardReach\.favorableP75/);
assert.match(plans,/if\(empiricalReach==null\)\{\s*reasons\.push\('لا توجد 30 نافذة/);
assert.match(plans,/b\.includes\('لا توجد 30 نافذة حركة لاحقة'\)/,
  'insufficient forward evidence must cancel even a frozen ARMED plan');
assert.doesNotMatch(plans,/c\.high-c\.open:c\.open-c\.low/,
  'same-candle high-from-open was not a post-entry target reach estimate');
console.log('PASS: causal BTC/GOLD M1/M5 reach, minimum observations, gap filtering and frozen-plan safety');
