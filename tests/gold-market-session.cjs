const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('vm'),ts=require('typescript');
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/gold-market-session.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:m,exports:m.exports,require});
for(const [d,open] of [
 ['2026-10-16T20:00:00Z',true],['2026-10-16T21:00:00Z',false],
 ['2026-10-17T07:00:00Z',false],['2026-10-18T21:59:00Z',false],
 ['2026-10-18T22:00:00Z',true],['2026-10-19T21:30:00Z',false],
 ['2026-10-19T22:00:00Z',true]
])assert.equal(m.exports.goldMarketSession(Date.parse(d)).open,open,d);
const ui=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
assert.match(ui,/goldClosed\?'سوق الذهب مغلق/);
console.log('PASS: gold market close distinguished from stale network data');
for(const [d,open] of [
 ['2026-11-18T21:30:00Z',true],['2026-11-18T21:59:59Z',true],
 ['2026-11-18T22:00:00Z',false],['2026-11-18T22:59:59Z',false],
 ['2026-11-18T23:00:00Z',true],['2026-11-20T21:30:00Z',true],
 ['2026-11-20T22:00:00Z',false],['2026-11-22T22:59:59Z',false],
 ['2026-11-22T23:00:00Z',true],
 ['2026-03-08T21:59:59Z',false],['2026-03-08T22:00:00Z',true],
 ['2026-11-01T22:59:59Z',false],['2026-11-01T23:00:00Z',true]
])assert.equal(m.exports.goldMarketSession(Date.parse(d)).open,open,d);
const sessionGap=m.exports.goldM15SessionBreakOnly;
const slots=(...dates)=>dates.map(d=>({time:Date.parse(d)}));
assert.equal(sessionGap(slots('2026-11-18T21:45:00Z','2026-11-18T23:00:00Z')),true);
assert.equal(sessionGap(slots('2026-10-19T20:45:00Z','2026-10-19T22:00:00Z')),true);
assert.equal(sessionGap(slots('2026-11-18T21:30:00Z','2026-11-18T23:00:00Z')),false,
 'a missing live 21:45 bar must remain a data gap');
assert.equal(sessionGap(slots('2026-11-18T23:00:00Z','2026-11-18T23:30:00Z')),false);
assert.equal(sessionGap(slots('2026-11-18T23:00:00Z','2026-11-18T23:15:00Z')),false);
for(const p of ['lib/market-hub.ts','app/api/health/route.ts'])
 assert.match(fs.readFileSync(p,'utf8'),/return goldMarketSession\(now\)\.open/,
  'server and chart must share the DST-aware reference session');
console.log('PASS: winter/summer boundaries, DST Sundays, scheduled vs missing trading slots');
