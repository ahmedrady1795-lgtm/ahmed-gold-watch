const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const box={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/chart-refresh.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:box,exports:box.exports,Date});
const {chartRefreshDelay}=box.exports;
const minute=Date.parse('2026-11-05T10:53:00Z');
const asset=(close)=>({chartCandles:[{time:close-60000}]});
const chart={gold:asset(minute),bitcoin:asset(minute)};
assert.equal(chartRefreshDelay(chart,minute+53000),8500,
 'a tab opened at :53 fetches the next close at :01.5, not :53 of the next minute');
assert.equal(chartRefreshDelay(chart,minute+61000),10000,
 'a late provider retries instead of leaving expired levels for another minute');
assert.equal(chartRefreshDelay(null,minute+20000),10000,'startup failure retries');
assert.equal(chartRefreshDelay({gold:asset(minute),bitcoin:asset(minute-60000)},minute+10000),10000,
 'a healthy gold feed cannot hide a lagging BTC close');
const saturday=Date.parse('2026-11-07T10:53:00Z');
assert.equal(chartRefreshDelay({bitcoin:asset(saturday)},saturday+2000),59500,
 'closed gold market must not cause repeated polling');
for(let offset=0;offset<120000;offset+=137){
 const delay=chartRefreshDelay(chart,minute+offset);
 assert.ok(delay>0&&delay<=61500,'no busy loop or missed whole minute');
}
console.log('PASS: boundary-aligned chart refresh, bounded late-close retries and weekend budget');
