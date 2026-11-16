// Frozen diagnostic slice; each model issues at most one observation per M5 phase.
// OHLC-only replay is not broker execution and excludes spread/slippage.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path,name){const m={exports:{}};vm.runInNewContext(ts.transpileModule(
 fs.readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}
 ).outputText,{module:m,exports:m.exports});return m.exports[name];}
const data=JSON.parse(fs.readFileSync('tests/fixtures/m5-level-comparison-20261116.json'));
const c=data.m1,split=c[Math.floor(c.length*.6)].time;
const result={source:data.source,checkedAt:data.checkedAt,splitAt:split,models:{}};
for(const [name,fn] of [['momentum',load('lib/sniper-m5-candle-lean.ts','assessM5CandleLean')],
 ['levelsExperimental',load('lib/sniper-m5-level-setup.ts','assessM5LevelSetup')]]){
 const group=()=>({signals:0,correct:0,wrong:0,flat:0,target:0,stop:0,ambiguous:0,unresolved:0});
 const stats={development:group(),holdout:group()},seen=new Set();
 for(let i=20;i<c.length-6;i++){
   const now=c[i].time,start=Math.floor(now/300000)*300000,closeAt=start+300000;
   const final=c.find(b=>b.time+60000===closeAt);if(!final)continue;
   const out=fn({now,price:c[i].open,sourceReady:true,m1:c.slice(0,i),m5:data.m5});
   if(out.side==='WAIT')continue;
   const key=start+':'+out.phase;if(seen.has(key))continue;seen.add(key);
   const q=stats[now<split?'development':'holdout'];q.signals++;
   const move=(final.close-c[i].open)*(out.side==='BUY'?1:-1);
   q[Math.abs(move)<.01?'flat':move>0?'correct':'wrong']++;
   if(out.target!=null&&out.invalidation!=null){
     let outcome='unresolved';
     // Exclude the issuance minute: a refreshed live quote may arrive part-way through it.
     for(const b of c.filter(b=>b.time>=now+60000&&b.time<closeAt)){
       const t=out.side==='BUY'?b.high>=out.target:b.low<=out.target;
       const s=out.side==='BUY'?b.low<=out.invalidation:b.high>=out.invalidation;
       if(t||s){outcome=t&&s?'ambiguous':t?'target':'stop';break;}
     }q[outcome]++;
   }
 }
 result.models[name]=stats;
}
console.log(JSON.stringify(result,null,2));
