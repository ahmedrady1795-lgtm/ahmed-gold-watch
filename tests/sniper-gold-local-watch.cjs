const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const exp={};
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync('lib/sniper-gold-local-watch.ts','utf8'),
  {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}
).outputText,{exports:exp,require:()=>{throw Error('No external runtime dependencies allowed')}});
const {selectGoldLocalWatch:select}=exp;
const now=Date.parse('2026-11-23T19:57:32Z');
const view={
 status:'EARLY_WATCH',side:'SELL',score:64,
 evidenceClass:'CLOSED_M1_ONLY',
 issuedFromClosedM1At:now-40000,checkedAt:now-2000,
 quoteAt:now-2600,quotePrice:3642.1,
 quoteSource:'Biquote · MT5 XAUUSD',
 candleSource:'Biquote · MT5 XAUUSD candles',
 reason:'تحضير سعري مبكر فقط؛ لا يوجد عمق MT5 مؤهل'
};
const base={now,marketOpen:true,priceFresh:true,providerTransition:false,
 price:3642.18,chartSource:view.candleSource,
 quoteSource:view.quoteSource,view};
let s=select(base);
assert.ok(s,'existing GOLD scalp EARLY_WATCH must reach the chart');
assert.equal(s.side,'SELL');assert.equal(s.score,64);
assert.equal(s.issuedAt,view.issuedFromClosedM1At);
assert.equal(Object.hasOwn(s,'trigger'),false,'price-only watch cannot invent an entry');
assert.equal(select({...base,view:{...view,side:'BUY'}})?.side,'BUY');
assert.equal(select({...base,marketOpen:false}),null);
assert.equal(select({...base,priceFresh:false}),null);
assert.equal(select({...base,providerTransition:true}),null);
assert.equal(select({...base,price:3644.0}),null,'chasing a moved quote is forbidden');
assert.equal(select({...base,chartSource:'Exness/MT5 · XAUUSDm'}),null);
assert.equal(select({...base,quoteSource:'Twelve Data'}),null);
assert.equal(select({...base,now:now+94000}),null);
assert.equal(select({...base,view:{...view,checkedAt:now-40000}}),null);
assert.equal(select({...base,view:{...view,issuedFromClosedM1At:now+10000}}),null);
assert.equal(select({...base,view:{...view,evidenceClass:'MT5_BROKER_DISPLAYED_DEPTH'}}),null,
 'real broker DOM requires its own qualified route, not the price-only fallback');
assert.equal(select({...base,view:{...view,status:'LATE'}}),null);
assert.equal(select({...base,view:{...view,status:'ENTRY_CANDIDATE'}}),null);
assert.equal(select({...base,view:{...view,status:'WAIT'}}),null);
const radar=fs.readFileSync('app/api/gold-radar/route.ts','utf8');
const badge=fs.readFileSync('components/GoldRadarBadge.tsx','utf8');
const panel=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const desk=fs.readFileSync('lib/scalp-desk.ts','utf8');
assert.match(desk,/export function peekScalpGold\(/);
assert.match(radar,/peekScalpGold\(35000\)/,
 'reuse cached GOLD scout, never issue extra inference requests');
assert.doesNotMatch(radar,/getScalpDesk\(/,
 'the background feed is enough and must not start an extra expensive analysis');
assert.match(badge,/onScalpEarlyView\?\.\(data\?\.ok\?data\.scalpEarly\?\?null:null\)/);
assert.match(panel,/selectGoldLocalWatch\(/);
assert.match(panel,/commandLocalGold\?/);
assert.match(panel,/const commandLive=commandFastLive&&m\.historyFresh/,
 'only strongly qualified entries are gated by full history');
assert.match(panel,/const commandM1=commandFastLive&&/,
 'honest M1 watches must not be silently suppressed by unrelated M15 gaps');
assert.match(panel,/commandFollowing\?'حركة مرصودة بعد بدايتها/,
 'a retrospective trend observation must not look like a sniper entry');
console.log('PASS: existing GOLD closed-M1 scout visible on main chart, source/time/price protection, no DOM or fabricated price, no new backend polling');
