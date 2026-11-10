const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const source=fs.readFileSync('lib/news-verified-bls.ts','utf8');
const exports_={};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS
}}).outputText,{exports:exports_,Date,Number,Math,String});
const {appendVerifiedBlsReleases}=exports_;
const morning=Date.parse('2026-11-10T06:20:00Z');
let events=[];
assert.equal(appendVerifiedBlsReleases(events,morning),2,'BLS official scheduled CPI/PPI are available');
const cpi=events.find(e=>/CPI/.test(e.name));
assert.equal(cpi.time,Date.parse('2026-11-10T13:30:00Z'));
assert.equal(cpi.importance,3);
assert.equal(cpi.actual,'','Do not invent the news Actual');
assert.ok(cpi.source.includes('bls.gov'));
assert.equal(appendVerifiedBlsReleases(events,morning),0,'No repeated fallback');
events=[{id:'from-live',name:'Core CPI m/m',time:cpi.time,
  importance:3,actual:'',forecast:'0.2%',previous:'0.3%',source:'live',exactTime:true}];
assert.equal(appendVerifiedBlsReleases(events,morning),1,'Do not duplicate a live CPI');
assert.equal(events[0].forecast,'0.2%','Preserve original provider forecast');
assert.equal(events.filter(e=>/CPI/.test(e.name)).length,1);
assert.equal(appendVerifiedBlsReleases([],Date.parse('2026-11-15T06:20:00Z')),0,
  'Backup expires after both published release dates');
console.log('PASS: BLS verified schedule is added only when missing, never invents Actual');
