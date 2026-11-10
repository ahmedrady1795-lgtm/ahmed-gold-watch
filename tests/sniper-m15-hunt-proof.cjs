const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),
 path=require('node:path'),ts=require('typescript');
const modules=new Map();
function load(file){
 file=path.resolve(file);if(modules.has(file))return modules.get(file);
 const ex={};modules.set(file,ex);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
 }).outputText;
 vm.runInNewContext(code,{exports:ex,require:p=>p.startsWith('.')?
   load(path.resolve(path.dirname(file),p+'.ts')):require(p),
  Math,Number,Date},{filename:file});return ex;
}
const {auditM15HuntDirection}=load('lib/sniper-m15-hunt-proof.ts');
const {assessM15HuntDisplay}=load('lib/sniper-m15-display-evidence.ts');
const t=Date.parse('2026-11-02T00:00:00Z');
const bars=Array.from({length:105},(_,i)=>{
 const open=75000+i*.50,close=open+.38;
 return {time:t+i*900000,open,close,high:close+.23,low:open-.22};
});
const at=bars.at(-1).time+900000;
const up=auditM15HuntDirection(bars,at);
assert.ok(up.n>=40,'only chart observer quality-eligible past predictions should be graded');
assert.equal(up.modelHits,up.n);
assert.equal(up.baselineHits,up.n,'perfect momentum is not independent edge against momentum');
assert.equal(up.modelOnly,0);
assert.equal(up.baselineOnly,0);
assert.equal(up.status,'COLLECTING','perfect matched trend must not invent paired advantage');
assert.equal(up.isProfitProof,false);
const short=auditM15HuntDirection(bars.slice(-16),at);
assert.equal(short.n,0);
const bearish=bars.map(b=>({...b,open:160000-b.open,close:160000-b.close,
 low:160000-b.high,high:160000-b.low}));
const down=auditM15HuntDirection(bearish,at);
assert.ok(down.n>=40);
assert.equal(down.modelHits,down.n);
const corrupted=bars.map(x=>({...x}));corrupted[65].time+=30000;
const broken=auditM15HuntDirection(corrupted,at);
assert.ok(broken.n<up.n,'time gaps cannot turn into favorable replay rows');
const stale=auditM15HuntDirection(bars,at-900000);
assert.ok(stale.n<=up.n,'future unfinished last candle must be excluded');
// Opposite M1 direction must never be presented as a strong M15 arrow.
const hunt={ready:true,referenceOnly:false,preferred:'SELL',
 observation:{quality:'CLEAR',conflicting:false}};
const m1Buy={ready:true,side:'BUY'};
const proof={status:'COLLECTING',n:1};
const conflict=assessM15HuntDisplay({hunt,m1:m1Buy,proof,marketOpen:true});
assert.equal(conflict.state,'CONFLICT');
assert.equal(conflict.side,'WAIT');
assert.equal(conflict.highlighted,false);
assert.equal(conflict.tradeAuthorized,false);
const noEdge=assessM15HuntDisplay({
 hunt,m1:{ready:true,side:'SELL'},
 proof:{status:'NO_DEMONSTRATED_EDGE'},marketOpen:true});
assert.equal(noEdge.side,'WAIT');
const aligned=assessM15HuntDisplay({
 hunt,m1:{ready:true,side:'SELL'},proof,marketOpen:true});
assert.equal(aligned.state,'ALIGNED_WATCH');
assert.equal(aligned.side,'SELL');
const weak=assessM15HuntDisplay({
 hunt:{...hunt,observation:{quality:'WEAK',conflicting:false}},
 m1:m1Buy,marketOpen:true});
assert.equal(weak.side,'WAIT');
const flowConflict=assessM15HuntDisplay({
 hunt,m1:{ready:true,side:'SELL'},flowSide:'BUY',marketOpen:true});
assert.equal(flowConflict.state,'CONFLICT');
assert.equal(assessM15HuntDisplay({
 hunt,m1:{ready:true,side:'SELL'},marketOpen:true,
 proof:{status:'FORWARD_EDGE_CANDIDATE'}}).state,'PRELIMINARY_EDGE');
const chart=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const overlay=fs.readFileSync('components/SniperM15HuntOverlay.tsx','utf8');
assert.match(chart,/auditM15HuntDirection\(actual,now,120\)/);
assert.match(chart,/forecast=\{huntPreview\} proof=\{huntProof\}/);
assert.match(overlay,/القراءة متعارضة · مساران مشروطان/);
assert.match(overlay,/المسار المرجح/);
assert.match(overlay,/M15 · EARLY PATH/);
assert.match(overlay,/M15 · FRAME CONFLICT/);
assert.match(overlay,/assessM15HuntDisplay/);
assert.match(chart,/m1=\{nextM1\} marketOpen=\{marketOpen\}/);
console.log('PASS: exact M15 WATCH historical replay, paired prior-body baseline, no cross-sample claim, source gaps and early-candle exclusions');
