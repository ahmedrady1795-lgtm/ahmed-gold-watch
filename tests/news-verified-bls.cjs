const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const source=fs.readFileSync('lib/news-verified-bls.ts','utf8');
const exports_={};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS
}}).outputText,{exports:exports_,Date,Number,Math,String});
const {appendVerifiedBlsReleases}=exports_;
const before=Date.parse('2026-11-10T13:29:59Z');
const after=Date.parse('2026-11-10T13:31:00Z');
let events=[];
assert.equal(appendVerifiedBlsReleases(events,before),2,'Verified BLS CPI/PPI dates are available');
let cpi=events.find(e=>/CPI/.test(e.name));
assert.equal(cpi.time,Date.parse('2026-11-10T13:30:00Z'));
assert.equal(cpi.actual,'','No early Actual before publication');
assert.equal(cpi.forecast,'','No forecast embedded before publication');
assert.equal(appendVerifiedBlsReleases(events,after),0,'Existing event enriched, not duplicated');
assert.equal(cpi.actual,'0.4%','Actual is verified BLS headline month-on-month');
assert.equal(cpi.forecast,'0.3%','Consensus forecast preserved from verified news snapshot');
assert.equal(cpi.previous,'0.6%','BLS previous monthly release');
assert.match(cpi.source,/bls\.gov\/news\.release/);
assert.equal(appendVerifiedBlsReleases(events,after),0,'Idempotent');
assert.equal(events.length,2);
events=[{id:'from-live',name:'CPI m/m',time:cpi.time,
  importance:3,actual:'0.4%',forecast:'0.3%',previous:'0.6%',
  source:'https://provider.example/cpi',exactTime:true}];
assert.equal(appendVerifiedBlsReleases(events,after),1,'A missing PPI is added but CPI remains live');
assert.equal(events[0].source,'https://provider.example/cpi','Do not replace a good live source');
assert.equal(events[0].actual,'0.4%');
events=[{id:'from-live',name:'CPI m/m',time:cpi.time,
  importance:3,actual:'',forecast:'0.3%',previous:'',source:'live',exactTime:true}];
appendVerifiedBlsReleases(events,after);
assert.equal(events[0].actual,'0.4%','Fill missing live-provider Actual from verified BLS');
assert.equal(events[0].forecast,'0.3%','Do not overwrite a live forecast');
assert.match(events[0].source,/bls\.gov/);
events=[{id:'core',name:'Core CPI y/y',time:cpi.time,
  importance:3,actual:'',forecast:'',previous:'',source:'live',exactTime:true}];
appendVerifiedBlsReleases(events,after);
assert.equal(events[0].actual,'','Never mislabel annual/core CPI with headline monthly data');
assert.equal(events.filter(e=>/Consumer Price Index \(CPI\)/.test(e.name)).length,1,
  'Add headline CPI alongside an unrelated core CPI');
assert.equal(appendVerifiedBlsReleases([],Date.parse('2026-11-15T06:20:00Z')),0,
  'Time-limited backup must expire');
console.log('PASS: BLS CPI after-publication result, as-of safety, live-source preservation and no false core values');
