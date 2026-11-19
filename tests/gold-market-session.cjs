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
// A legitimate gold maintenance interval must not disable read-only M15
// bias for 6.5 hours. NEVER fill missing candles or grade a trade on it.
const biasMod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/sniper-m15-bias.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:biasMod,exports:biasMod.exports,
 require:(name)=>name==='./gold-market-session'?m.exports:require(name)});
const goldBias=biasMod.exports.observedM15Bias;
const frame=[];
for(let at=Date.parse('2026-11-18T18:00:00Z');
 at<=Date.parse('2026-11-19T02:45:00Z');at+=900000){
 if(!m.exports.goldMarketSession(at).open)continue;
 const i=frame.length,close=3780-i*.72;
 frame.push({time:at,open:close+.32,high:close+.55,
   low:close-.65,close});
}
const recent26=frame.slice(-26);
assert.equal(recent26.length,26);
assert.equal(sessionGap(recent26),true);
assert.equal(goldBias(recent26).side,'WAIT',
 'strict historical/scenario functions still reject noncontinuous M15 candles');
assert.equal(goldBias(recent26,true).side,'SELL',
 'M15 observational SELL direction resumes through verified closed maintenance');
assert.match(goldBias(recent26,true).label,/فجوة جلسة رسمية/,
 'post-session label must disclose its scheduled break');
const openGap=recent26.filter(b=>
 b.time!==Date.parse('2026-11-19T01:15:00Z'));
assert.equal(goldBias(openGap,true).side,'WAIT',
 'any missing M15 candle during OPEN gold market invalidates the context');
const preSession=recent26.slice(-16);
const activePanel=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
assert.match(activePanel,/goldM15SessionBreakOnly\(last16M15\)/,
 'M15 observational readiness uses same real exchange maintenance schedule');
assert.match(activePanel,/observedM15Bias\(actual,asset==='GOLD'\)/,
 'GOLD alone opts into scheduled-gap contextual read');
assert.match(activePanel,/const historyFresh=actual\.length>=24&&/,
 'trade history evidence stays strict even though read-only M15 resumes');
assert.equal(goldBias(recent26.slice(-25),true).side,'WAIT',
 'never invent earlier M15 bars to fill a 26-bar window');
console.log('PASS: winter/summer boundaries, DST Sundays, scheduled vs missing trading slots');
