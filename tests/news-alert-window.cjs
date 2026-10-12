const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const exports_={};
const source=fs.readFileSync('lib/news-alert-window.ts','utf8');
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS
}}).outputText,{exports:exports_});
const {economicNewsTimeline,NEWS_EARLY_MS}=exports_;
const now=Date.parse('2026-10-11T09:00:00Z');
const evt=(name,diff,extra={})=>({id:name,name,time:now+diff,...extra});
assert.equal(NEWS_EARLY_MS,8*60*60*1000);
let result=economicNewsTimeline([
  evt('Nine hours',9*3600000),
  evt('Eight hours exactly',8*3600000),
  evt('Eight hours plus 1ms',8*3600000+1),
  evt('In one second',1000),
  evt('Now',0),
  evt('Already released',-30000,{actual:'2.1%'}),
  evt('Empty date',NaN),
  evt('Made up',0,{name:''}),
],null,now);
assert.equal(result.alerts.length,3,'Only <=8h confirmed future events');
assert.equal(result.alerts[0].name,'Now');
assert.equal(result.alerts[2].name,'Eight hours exactly');
assert.equal(result.upcoming.length,5,'Calendar retains all scheduled news');
assert.equal(result.recent.length,1,'Real released event can remain briefly');
result=economicNewsTimeline([],evt('Featured important',4*3600000),now);
assert.equal(result.alerts.length,1,'Featured next-event is included even without agenda list');
result=economicNewsTimeline(
  [evt('Duplicate',3600000),evt('Duplicate',3600000,{id:'other-id'})],
  evt('Duplicate',3600000,{id:'other-featured'}),now);
assert.equal(result.alerts.length,1,'Same event time/name is not shown three times');
result=economicNewsTimeline([],null,now);
assert.equal(result.alerts.length,0,'No fake event when feed is empty');
console.log('PASS: news alert appears exactly eight hours prior, never early or without source event');
