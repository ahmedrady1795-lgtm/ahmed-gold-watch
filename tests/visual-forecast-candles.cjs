const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const module_={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/visual-forecast-candles.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:module_,exports:module_.exports,require},{filename:'lib/visual-forecast-candles.ts'});
const {buildVisualFuture:build}=module_.exports;
const start=Date.parse('2026-10-17T10:00:00Z');
const candles=Array.from({length:65},(_,i)=>({time:start+i*60000,open:100+i*.1,high:100+i*.1+.25,low:100+i*.1-.2,close:100+i*.1+.08}));
const last=candles.at(-1),now=last.time+60000;
const base={candles,forecast:{mode:'RANGE',atr:.6,side:'WAIT',candles:[]},side:'WAIT'};
let f=build(base);
assert.equal(f.length,16,'draw 16 realistic visual candles instead of an empty range');
assert.ok(f.every(c=>!c.scenarioShape),'neutral mode is time-indexed only');
assert.equal(f[0].time,now,'first step follows the last completed M1 candle');
assert.ok(f.every((c,i)=>c.step===i+1&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)&&
  (i===0||c.open===f[i-1].close)));
assert.ok(f.some(c=>c.close>c.open)&&f.some(c=>c.close<c.open),'neutral market shows both colors');
assert.ok(Math.abs(f.at(-1).close-last.close)<2,'neutral display never fakes a large target hit');
assert.equal(build({...base,forecast:{...base.forecast,mode:'OFF'}}).length,0,'stale / unsafe feed suppresses candles');
const first=Array.from({length:3},(_,i)=>({time:now+i*60000,open:last.close+i*.2,close:last.close+(i+1)*.2,high:last.close+(i+1)*.2+.12,low:last.close+i*.2-.13}));
f=build({...base,side:'SELL',forecast:{mode:'CANDLES',atr:.6,side:'BUY',candles:first}});
assert.equal(f.length,16);
assert.ok(f.slice(0,3).every((c,i)=>c.close===first[i].close&&c.validatedShape),'certified 3 OHLC untouched');
assert.ok(f.slice(3).every(c=>!c.validatedShape),'remaining bars explicitly illustrative');
assert.ok(f.slice(3).some(c=>c.close<c.open),'pullback included');
f=build({...base,side:'SELL'});
assert.ok(f.filter(c=>c.close<c.open).length>f.filter(c=>c.close>c.open).length,'bearish scenario shaped downward');
const scenario=build({...base,side:'SELL',scenarioPath:[{price:last.close},{price:last.close-4,key:'TP1'},{price:last.close-7,key:'TP2'},{price:last.close-10,key:'TP3'}]});
assert.equal(scenario.length,30,'authoritative target route receives enough candles to see full movement');
assert.ok(scenario.every(c=>c.scenarioShape&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)));
assert.ok(Math.abs(scenario.at(-1).close-(last.close-10))<1e-8,'price route ends at exact server target');
assert.ok(scenario.some(c=>c.close>c.open)&&scenario.some(c=>c.close<c.open),'route visually includes realistic pullbacks');
const ui=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
assert.match(ui,/visualCandles\.map\(\(c,i\)=>/);
assert.match(ui,/projectedPath&&!ghostVisible&&visualCandles\.length===0/);
assert.match(ui,/شموع افتراضية/);
console.log('PASS: visible, bounded and labelled 16-candle continuation with 3-bar validation boundary');
