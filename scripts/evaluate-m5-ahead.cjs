// Diagnostic replay only: zero transport delay, no spread or execution assumptions.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(p){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{module:m,exports:m.exports});return m.exports;}
const {issueM5Ahead,scoreM5Ahead}=load('lib/sniper-m5-ahead.ts');
const {assessM5CandleLean}=load('lib/sniper-m5-candle-lean.ts');
const data=JSON.parse(fs.readFileSync('tests/fixtures/m5-ahead-20261116.json'));
const c=data.bars,split=c[Math.floor(c.length*.6)].time;
const result={source:data.source,model:'current-lean-next-candle-v1',leadMs:60000,splitAt:split,first:c[0].time,last:c.at(-1).time,assumptions:'Last closed M1 close is quote proxy; zero publication delay. Same-day diagnostic, no fees/spread, not execution backtest.',groups:{},records:[]};
for(const name of ['development','holdout'])result.groups[name]={eligible:0,signals:0,CORRECT:0,WRONG:0,FLAT:0,TARGET:0,STOP:0,AMBIGUOUS:0,TIMEOUT:0,GAP:0,UNKNOWN:0,PENDING:0};
for(let i=18;i<c.length;i++){
 const now=c[i].time;if(now%300000!==240000)continue;
 const start=now+60000;if(!c.some(b=>b.time===start+240000))continue;
 const group=result.groups[start<split?'development':'holdout'];group.eligible++;
 const past=c.slice(0,i),price=past.at(-1).close;
 const lean=assessM5CandleLean({now,price,sourceReady:true,m1:past});
 const plans=issueM5Ahead([],{now,source:data.source,model:result.model,side:lean.side,price,quoteAt:now,evidenceAt:past.at(-1).time+60000,bars:past});
 if(!plans.length)continue;
 const scored=scoreM5Ahead(plans[0],{now:start+300000,source:data.source,bars:c});
 group.signals++;group[scored.outcome]++;if(scored.direction)group[scored.direction]++;
 result.records.push(scored);
}
console.log(JSON.stringify(result,null,2));
