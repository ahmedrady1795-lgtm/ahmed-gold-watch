const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
let clock=Date.parse('2026-11-09T15:00:00Z');
class Clock extends Date{static now(){return clock;}}
function load(path,requireMock=()=>{throw Error('unexpected import')},extra={}){
 const m={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{
   compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
 }).outputText,{module:m,exports:m.exports,require:requireMock,Date:Clock,
   Number,Math,Promise,AbortSignal,...extra},{filename:path});
 return m.exports;
}
const quality=load('lib/gold-source-quality.ts');
const {gradeGoldQuote:grade,freshGoldCandleSet:barsFresh}=quality;
const fresh={price:4200,sourceTime:clock-1000,status:'live',bid:4199.9,ask:4200.1};
assert.equal(grade(fresh,clock).kind,'LIVE');
assert.equal(grade({...fresh,status:'delayed'},clock).kind,'DELAYED');
assert.equal(grade({...fresh,sourceTime:clock-50000},clock).kind,'DELAYED');
assert.equal(grade({...fresh,sourceTime:clock-25*60000},clock).kind,'REJECTED');
assert.equal(grade({...fresh,sourceTime:null},clock).kind,'REJECTED');
assert.equal(grade({...fresh,sourceTime:clock+10000},clock).kind,'REJECTED');
assert.equal(grade({...fresh,bid:4201,ask:4200},clock).kind,'REJECTED');
assert.equal(grade({...fresh,status:'closed_or_stale'},clock).kind,'DELAYED');
const row=(age)=>[{time:clock-age}];
assert.equal(barsFresh(row(60000),row(4*60000),
 row(14*60000),row(59*60000),clock,true),true);
assert.equal(barsFresh(row(8*60000),row(4*60000),
 row(14*60000),row(59*60000),clock,true),false,
 'stale M1 must make the source ineligible');
assert.equal(barsFresh(row(60000),row(4*60000),
 row(14*60000),row(4*3600000),clock,true),false,
 'a stale H1 cannot silently be mixed with recent M1');
assert.equal(barsFresh(row(60000),row(4*60000),
 row(14*60000),row(59*60000),clock,false),true);
assert.equal(barsFresh(row(-60000),row(4*60000),
 row(14*60000),row(59*60000),clock,false),false,
 'future candle timestamps must not count as broker history');
const requested=[];
const fixedGoldTime=clock-1000;
const mockFetch=async(url)=>{
 requested.push(url);
 if(url.includes('biquote.io/api/XAUUSD?'))
   return {ok:true,json:async()=>({mid:4100,bid:4099.95,ask:4100.05,
      timestamp:new Date(clock-80000).toISOString(),
      quoteAgeSeconds:80,marketState:'open',stale:true})};
 if(url.includes('data-asg.goldprice.org'))
   return {ok:true,json:async()=>({ts:fixedGoldTime,items:[{xauPrice:4112.34}]})};
 return {ok:false,status:503,json:async()=>({message:'unavailable'})};
};
const hub=load('lib/market-hub.ts',id=>{
 if(id==='./runtime')return {getRuntimeEnv:()=>({})};
 if(id==='./gold-mt5-dom')return {
   normalizeMt5GoldDom:()=>({sample:null,reason:'UNAVAILABLE'}),
   analyzeMt5GoldDom:()=>({available:false})};
 if(id==='./mt5-quote-profile')return {buildMt5QuoteProfile:()=>({ready:false})};
 if(id==='./gold-source-quality')return quality;
 throw Error('unexpected market hub dependency '+id);
},{fetch:mockFetch});
(async()=>{
 const quote=await hub.getQuoteData({forceExternal:true});
 assert.match(quote.source,/GoldPrice.org/);
 assert.equal(quote.status,'live');
 assert.equal(quote.price,4112.34);
 assert.equal(quote.sourceTime,clock-1000);
 assert.ok(requested.some(url=>url.includes('biquote.io')),
  'try preferred Biquote first');
 assert.ok(requested.some(url=>url.includes('data-asg.goldprice.org')),
  'stale Biquote must fall through to next current quote');
 const count=requested.length;
 const cached=await hub.getQuoteData({forceExternal:true});
 assert.equal(requested.length,count,'short-term cached live quote should be reused');
 clock+=16000;
 const after=await hub.getQuoteData({forceExternal:true});
 assert.equal(after.status,'delayed','old cache must never stay falsely LIVE');
 assert.equal(after.sourceTime,quote.sourceTime,
   'HTTP re-fetch cannot rewrite a provider event timestamp');
 const main=fs.readFileSync('lib/market-hub.ts','utf8');
 assert.match(main,/c60=candles\(h1\)/,'Twelve Data H1 must be normalized OHLC');
 assert.match(main,/freshGoldCandleSet\(m1,m5,m15,h1,now/);
 console.log('PASS: gold providers fail over on stale data, source-time integrity, full-frame candle checks');
})().catch(e=>{console.error(e);process.exitCode=1;});
