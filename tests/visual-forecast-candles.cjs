const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const module_={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/visual-forecast-candles.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:module_,exports:module_.exports,require},{filename:'lib/visual-forecast-candles.ts'});
const {buildVisualFuture:build}=module_.exports;
const start=Date.parse('2026-10-17T10:00:00Z');
const candles=Array.from({length:65},(_,i)=>({time:start+i*60000,open:100+i*.1,high:100+i*.1+.25,low:100+i*.1-.2,close:100+i*.1+.08}));
const last=candles.at(-1),now=last.time+60000,atr=.6;
const base={candles,forecast:{mode:'RANGE',atr,side:'WAIT',candles:[]},side:'WAIT'};
let f=build(base);
assert.equal(f.length,10,'10 M1-style candles, not 30 forged TP steps');
assert.equal(f[0].time,now);
assert.ok(f.every((c,i)=>c.step===i+1&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)&&
  (i===0||c.open===f[i-1].close)));
assert.ok(f.some(c=>c.close>c.open)&&f.some(c=>c.close<c.open));
assert.ok(f.every(c=>Math.abs(c.close-last.close)<atr*2.5),'cannot draw a huge fake selloff');
assert.equal(build({...base,forecast:{...base.forecast,mode:'OFF'}}).length,0);
const first=Array.from({length:3},(_,i)=>({time:now+i*60000,open:last.close+i*.2,close:last.close+(i+1)*.2,high:last.close+(i+1)*.2+.12,low:last.close+i*.2-.13}));
f=build({...base,side:'SELL',forecast:{mode:'CANDLES',atr,side:'BUY',candles:first}});
assert.equal(f.length,10);
assert.ok(f.slice(0,3).every((c,i)=>c.close===first[i].close&&c.validatedShape));
assert.ok(f.slice(3).every(c=>!c.validatedShape));
assert.ok(f.slice(3).some(c=>c.close<c.open),'retrace rather than straight ladder');
const distant=build({...base,side:'SELL',scenarioPath:[{price:last.close},{price:80,key:'TP1'},{price:50,key:'TP3'}]});
assert.equal(JSON.stringify(distant),JSON.stringify(build(base)),'targets cannot forcibly rewrite M1 OHLC');
assert.ok(distant.every(c=>!c.scenarioShape));
const ui=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
assert.match(ui,/visualCandles\.map\(\(c,i\)=>/);
assert.doesNotMatch(ui,/scenarioPath:planVisible/);
assert.match(ui,/شموع افتراضية/);
console.log('PASS: bounded 10-step illustrated M1 candles; no invented TP3 staircases');
