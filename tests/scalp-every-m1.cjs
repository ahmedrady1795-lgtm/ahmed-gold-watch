const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('typescript'),cache=new Map();
function load(file){
 file=path.resolve(file);if(cache.has(file))return cache.get(file);
 const out={};cache.set(file,out);
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{
   target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true
 }}).outputText;
 vm.runInNewContext(js,{exports:out,require:name=>name.startsWith('.')?
    load(path.resolve(path.dirname(file),name+'.ts')):require(name),
   console,Date,Math,Number,globalThis:{},process:{env:{}},setTimeout,clearTimeout},
   {filename:file});return out;
}
const {everyM1Direction}=load('lib/sniper-m1-every-direction.ts');
const {advanceEveryM1}=load('lib/scalp-every-candle.ts');
const {buildM1CandleTape}=load('lib/sniper-m1-candle-tape.ts');
const T=Date.parse('2026-11-05T11:00:00Z');
const bars=Array.from({length:43},(_,i)=>{
 const o=100+i*.06,close=o+.035;
 return {time:T+i*60000,open:o,high:close+.05,low:o-.05,close};
});
const issue=bars.at(-1).time+60000;
const guess=everyM1Direction(bars,issue+100);
assert.ok(guess,'fresh latest closed M1 should get a direction');
assert.equal(guess.side,'BUY');
assert.equal(guess.issuedAt,issue);
const weakBars=Array.from({length:43},(_,i)=>({
 time:T+i*60000,open:100,close:100,high:100.1,low:99.9
}));
const weak=everyM1Direction(weakBars,issue+100);
assert.ok(weak,'flat/weak M1 should still get a direction');
assert.equal(weak.weak,true,'label zero-edge prediction as weak, not certified');
assert.ok(['BUY','SELL'].includes(weak.side));
assert.equal(everyM1Direction(bars.slice(0,19),issue+100),null,'missing candle history must not forge a signal');
assert.equal(everyM1Direction(bars,issue+60001),null,'old candle cannot become a fresh new minute');
const q=(bid,ask,at,source='TEST-MT5')=>({price:(bid+ask)/2,bid,ask,at,source});
const first=q(102.5,102.6,issue+100);
let data={version:1,history:[]};
data=advanceEveryM1(data,bars,first,issue+100,.15);
assert.equal(data.history.length,1,'always propose one per new minute');
const a=data.history[0];
assert.equal(a.state,'PENDING','weakness or 1.25R trading gate must not discard shadow attempt');
assert.equal(a.limitType,'BUY_LIMIT');
assert.ok(a.entry<first.bid,'BUY LIMIT must be lower than current bid');
assert.equal(a.filledAt,null,'never market-fill on creation');
const start=a.entry;
data=advanceEveryM1(data,bars,first,issue+500,.15);
assert.equal(data.history.length,1,'same minute and quote never duplicate attempt');
const later=q(start-.04,start-.01,issue+1100);
data=advanceEveryM1(data,bars,later,issue+1200,.15);
assert.equal(data.history[0].state,'ACTIVE','later ask crossing frozen BUY limit activates reference paper');
assert.equal(data.history[0].filledAt,issue+1100);
assert.equal(data.history[0].entry,start,'do not chase a new market entry');
const target=data.history[0].tp;
data=advanceEveryM1(data,bars,q(target+.04,target+.08,issue+2200),issue+2300,.15);
assert.equal(data.history[0].state,'QUICK_TP','later executable BID touching TP closes paper attempt');
assert.ok(data.history[0].netR>0,'document cost-adjusted positive outcome');
const again=advanceEveryM1(data,bars,q(target+.08,target+.12,issue+3200),issue+3300,.15);
assert.equal(again.history.length,1,'no target reused as new candle');
const second=[...bars,{time:issue,open:bars.at(-1).close,
 high:bars.at(-1).close+.03,low:bars.at(-1).close-.07,
 close:bars.at(-1).close-.04}];
const after=issue+60000;
data=advanceEveryM1(data,second,q(102.6,102.7,after+100),after+100,.15);
assert.equal(data.history.length,2,'next closed candle gets a distinct fresh attempt');
const down=data.history[1];
assert.ok(down.side==='BUY'||down.side==='SELL');
assert.equal(down.state,'PENDING');
assert.ok(down.side==='BUY'?down.entry<102.6:down.entry>102.7);
data=advanceEveryM1(data,second,q(102.6,102.7,after+60100),after+60100,.15);
assert.equal(data.history[1].state,'EXPIRED','unfilled LIMIT expires, never converts to market');
const noBook={price:102,at:issue+100,source:'TEST-MT5'};
let absent=advanceEveryM1({version:1,history:[]},bars,noBook,issue+100,.15);
assert.equal(absent.history.length,1,'forecast still appears when broker quote is incomplete');
assert.equal(absent.history[0].state,'NO_BID_ASK');
assert.equal(absent.history[0].filledAt,null);
const tape=buildM1CandleTape(bars,issue+100,9);
assert.equal(tape.marks.length,9);
assert.equal(tape.graded,9,'direction offered each of 9 past nonflat candles');
const weakTape=buildM1CandleTape(weakBars,issue+100,9);
assert.equal(weakTape.marks.length,9);
assert.equal(weakTape.graded,0,'flat outcomes do not count as correct directional guesses');
assert.ok(weakTape.marks.every(x=>x.weak),'unqualified weak forecasts are visible and count toward coverage');
const page=fs.readFileSync('app/scalp/page.tsx','utf8');
assert.match(page,/GoldEveryCandle data=\{desk\?\.gold\?\.everyCandle\}/);
const desk=fs.readFileSync('lib/scalp-desk.ts','utf8');
assert.match(desk,/observeEveryM1\(input\.c1,quote,at/);
assert.match(desk,/const qualityGates=plans\.map/,
 'the strict execution-ready path remains separate from shadow each-candle');
const panel=fs.readFileSync('components/SniperM1CandleHunter.tsx','utf8');
assert.match(panel,/everyM1Direction\(p\.history,p\.now\)/);
assert.match(panel,/توقع الشمعة الحالية/);
console.log('PASS: prediction every valid closed M1, weak predictions counted, per-candle limit lifecycle, no market entries or fake broker wins');
