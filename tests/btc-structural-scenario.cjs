const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const module_={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/btc-structural-scenario.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:module_,exports:module_.exports});
const check=module_.exports.assessBtcStructuralScenario;
const now=Date.parse('2026-10-17T13:25:00Z');
const m5=Array.from({length:18},(_,i)=>({
 time:now-(18-i)*300000,open:81390,high:81420,low:81345,close:81394
}));
const base={now,sourceAt:now-20000,price:81394.38,priceFresh:true,m5,
 radar:{status:'ALIGNED',side:'SELL'},forecast:{decisionReady:true,
 pathForecast:{side:'SELL',destination:{low:81357.57,high:81376.33},
 invalidation:{price:81439.71},
 consensusGuard:{m1:{side:'SELL',gate:'PASSED'},
 m5:{side:'SELL',gate:'PASSED'},status:'M1_M5_CONFIRMED',aligned:2}}}};
let z=check(base);
assert.equal(z.status,'ALIGNED');
assert.equal(z.side,'SELL');
assert.equal(z.destination.low,81357.57);
assert.equal(z.invalidation,81439.71);
assert.equal(z.actionable,false,'forecast must never become broker entry');
assert.match(z.title,/توقع هابط/);
assert.doesNotMatch(z.title,/\d+%/,'path forecast is not calibrated probability');
z=check({...base,forecast:{...base.forecast,
 pathForecast:{...base.forecast.pathForecast,
 consensusGuard:{m1:{side:'WAIT',gate:'RECENT_PERFORMANCE_KILL_SWITCH'},
 m5:{side:'SELL',gate:'PASSED'}}}}});
assert.equal(z.status,'SINGLE_FRAME');
assert.equal(z.side,'SELL');
assert.equal(z.actionable,false,'performance kill can be shown as partial observational context only');
z=check({...base,forecast:{...base.forecast,
 pathForecast:{...base.forecast.pathForecast,
 consensusGuard:{m1:{side:'BUY',gate:'PASSED'},m5:{side:'SELL',gate:'PASSED'}}}}});
assert.equal(z.status,'CONFLICT');
assert.equal(z.side,'WAIT','a contradictory validated family blocks the displayed direction');
assert.equal(check({...base,radar:{status:'CONFLICT',side:'WAIT'}}).status,'CONFLICT');
for(const patch of [
 {priceFresh:false},{sourceAt:now-140000},{sourceAt:now+5000},{price:null},
 {m5:m5.slice(1)},{m5:m5.map((b,i)=>i===7?{...b,time:b.time+120000}:b)}
]){const out=check({...base,...patch});
 assert.equal(out.status,'STALE','stale quote, stale model, broken or incomplete M5 must withhold path');
 assert.equal(out.actionable,false);
}
assert.equal(check({...base,forecast:{...base.forecast,
 pathForecast:{...base.forecast.pathForecast,destination:{low:81520,high:81550}}}}).status,
 'NO_PATH','target behind current SELL quote is not a forward destination');
assert.equal(check({...base,forecast:{...base.forecast,
 pathForecast:{...base.forecast.pathForecast,side:'WAIT'}}}).status,'NO_PATH');
const ui=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
const css=fs.readFileSync('app/workspace.css','utf8');
const route=fs.readFileSync('app/api/ai-analysis/route.ts','utf8');
assert.match(route,/pathForecast:hunt\.zoneForecast\.pathForecast\?/,'existing live source is server forecast');
assert.match(ui,/forecast:x\?\.zoneForecast/,'chart uses actual server price destination');
assert.match(ui,/btcScenarioShown&&!planVisible/,'structural path remains visible when NO entry is qualified');
assert.match(ui,/sniper-btc-forecast/,'scenario has a first-class visible explanation');
assert.match(ui,/btc-structural-watch-path/,'actual-price-scaled path is shown on existing SVG');
assert.match(ui,/btc-watch-arrow/,'directional structural arrow distinct from executed trade');
assert.match(ui,/btcScenarioOffscreen/,'off-zoom target remains labelled, not silently projected');
assert.match(ui,/statusReady\?'خطة مسجلة':'ترقب تفعيل الدخول'/,
 'technical directional path must not be interpreted as executable signal');
assert.match(css,/\.sniper-btc-forecast/);
assert.doesNotMatch(ui,/downloadActualChartPng|📷 صورة فعلية/);
console.log('PASS: independently visible BTC server path on WAIT, audited M5, exact destination/invalidation and no fake trades');
