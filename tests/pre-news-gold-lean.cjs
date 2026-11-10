const assert=require('node:assert/strict'),fs=require('node:fs');
const ts=require('typescript'),vm=require('node:vm');
const src=fs.readFileSync('lib/pre-news-gold-lean.ts','utf8');
const out={};
vm.runInNewContext(ts.transpileModule(src,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
}}).outputText,{exports:out,Date,Math,Number,String,Array});
const analyze=out.buildPreNewsGoldLean;
const release=Date.parse('2026-11-13T13:30:00Z');
const now=release-5*60000;
function bars(change=0.25){
  const first=now-26*60000;
  return Array.from({length:25},(_,i)=>{
    const time=first+i*60000,open=4120+i*change,close=open+change*.7;
    return {time,open,close,low:Math.min(open,close)-.15,high:Math.max(open,close)+.15};
  });
}
const base=candles=>({eventTime:release,now,candles,source:'Exness/MT5 XAUUSD'});
let x=analyze(base(bars(.3)));
assert.equal(x.visible,true);
assert.equal(x.phase,'BEFORE_5');
assert.equal(x.side,'UP');
assert.match(x.reason,/صعود/);
x=analyze(base(bars(-.3)));
assert.equal(x.side,'DOWN');
assert.match(x.reason,/هبوط/);
x=analyze(base(bars(0)));
assert.equal(x.side,'WAIT','Flat market must not force a direction');
x=analyze(base([]));
assert.equal(x.side,'WAIT','Never guess with no M1 evidence');
x=analyze({...base(bars(.3)),providerTransition:true});
assert.equal(x.side,'WAIT','Transitioned quote/candle provider blocks direction');
x=analyze({...base(bars(.3)),source:'Yahoo GC=F COMEX proxy'});
assert.equal(x.side,'WAIT','No fake XAU signal using COMEX proxy');
x=analyze({...base(bars(.3)),now:release-16*60000});
assert.equal(x.visible,false,'Only becomes active during last 15 minutes');
x=analyze({...base(bars(.3)),now:release+1000});
assert.equal(x.visible,false,'Pre-release signal must disappear after release');
const broken=bars(.3);broken[broken.length-5].time+=60000;
x=analyze(base(broken));
assert.equal(x.side,'WAIT','Gaps block directional confidence');
const stale=bars(.3).map(c=>({...c,time:c.time-10*60000}));
x=analyze(base(stale));
assert.equal(x.side,'WAIT','Old candles do not justify a live bias');
const poisoning=bars(.3);poisoning.push({time:now+60000,open:9000,close:11000,low:8500,high:12000});
x=analyze(base(poisoning));
assert.equal(x.side,'UP','Future bars cannot influence the observed result');
const page=fs.readFileSync('app/page.tsx','utf8');
const news=fs.readFileSync('components/NewsCommandCenter.tsx','utf8');
assert.match(page,/goldCandles=\{chartData\?\.gold\?\.chartCandles/,'reuse real chart history');
assert.match(news,/buildPreNewsGoldLean/);
assert.match(news,/news-ticker-prebias/);
assert.match(news,/ترجيح الذهب قبل الخبر/);
assert.match(news,/لا يستخدم Actual المستقبلي/);
console.log('PASS: 15/10/5 min XAU evidence, NO future bar or release leak, stale/gap/provider guards and visible pre-news label');
