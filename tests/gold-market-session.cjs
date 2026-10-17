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
