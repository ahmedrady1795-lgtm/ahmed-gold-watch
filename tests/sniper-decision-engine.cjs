const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const cache=new Map();
function load(file){
  file=path.resolve(file);
  if(cache.has(file))return cache.get(file);
  const x={};cache.set(file,x);
  const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{
    target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true
  }}).outputText;
  vm.runInNewContext(js,{exports:x,require:name=>name.startsWith('.')
    ?load(path.resolve(path.dirname(file),name+'.ts')):require(name),Map,Date,Math,Number,Array,console});
  return x;
}
const {buildSniperDecision,requiredScalpNetR}=load('lib/sniper-decision-engine.ts');
const {auditScalpEntry}=load('lib/scalp-entry-audit.ts');
const {chooseEligibleScalpPlan}=load('lib/scalp-selection.ts');
const {summarizePaperBySetup,evaluatePaperProof,SCALP_UNIFIED_PROOF_FROM}=load('lib/scalp-paper-ledger.ts');
const now=Date.parse('2026-10-15T12:00:15Z');
const bars=(length,period)=>Array.from({length},(_,i)=>({
  time:Math.floor(now/period)*period-(length-i)*period,
  open:100,high:100.3,low:99.7,close:100,realVolume:12
}));
const c1=bars(140,60000),c5=bars(75,300000);
const plan={
  id:'GOLD-1-valid',asset:'GOLD',horizon:1,at:now-1000,
  expiresAt:now+65000,side:'BUY',status:'ARMED',setup:'BREAKOUT',
  score:85,entry:100,stop:98,targets:[{price:104,kind:'STRUCTURE'}],
  netRR:1.86,cost:.1,costEstimated:true,
  costBreakdown:{spread:.05,fees:.03,slippage:.02,allMeasured:false},
  blockers:[],reason:'',evidence:[
    {label:'اتجاه M1',side:'BUY',value:'EMA'},
    {label:'سياق M5',side:'BUY',value:'EMA'}
  ]
};
const quote={price:100,at:now-250,source:'synthetic reference'};
const input={plan,quote,now,c1,c5,marketOpen:true,newsReady:true};
const pass=buildSniperDecision(input);
assert.equal(pass.status,'QUALIFIED_WATCH','a good PAPER plan may pass preflight, not become a broker trade');
assert.equal(pass.executionAuthority,false);
assert.equal(pass.aiCertification,'SHADOW_UNQUALIFIED');
assert.equal(pass.scoreBasis,'TECHNICAL_HEURISTIC_NOT_WIN_RATE');
assert.ok(pass.score>0);
assert.equal(pass.factors.find(x=>x.id==='SOURCE').result,'PASS');
assert.equal(pass.factors.find(x=>x.id==='NEWS').result,'PASS');
assert.equal(buildSniperDecision({...input,quote:{...quote,at:now-16000}}).status,'BLOCKED');
assert.equal(buildSniperDecision({...input,c1:c1.filter((_,i)=>i!==138)}).status,'BLOCKED');
assert.notEqual(buildSniperDecision({...input,marketOpen:false}).status,'QUALIFIED_WATCH');
assert.notEqual(buildSniperDecision({...input,externalBlockers:['BTC orderbook stale']}).status,'QUALIFIED_WATCH');
assert.notEqual(buildSniperDecision({...input,plan:{...plan,status:'WATCH'}}).status,'QUALIFIED_WATCH');
const emptyWatch={...plan,status:'WATCH',side:'WAIT',setup:'NONE',entry:null,stop:null,targets:[],netRR:null};
const neutralObservation=buildSniperDecision({...input,plan:emptyWatch});
assert.equal(neutralObservation.status,'WAIT','no setup is WATCH, not a corrupt market feed');
assert.equal(neutralObservation.factors.find(x=>x.id==='SOURCE').result,'PASS',
  'market quote freshness must be checked independently from missing plan targets');
assert.ok(buildSniperDecision({...input,newsReady:false}).factors.some(x=>x.id==='NEWS'&&x.result==='WAIT'));
assert.ok(buildSniperDecision({...input,plan:{...plan,setup:'SWEEP'}}).blockers.some(x=>x.includes('سحب السيولة')));
assert.ok(buildSniperDecision({...input,plan:{...plan,setup:'OB_FVG',setupOriginId:'nonexistent'}}).blockers.some(x=>x.includes('OB/FVG')));
assert.equal(requiredScalpNetR({setup:'OB_FVG'}),3);
assert.equal(requiredScalpNetR({setup:'RETEST'}),1.5);
assert.equal(requiredScalpNetR({setup:'BREAKOUT'}),1.25);
const ob={...plan,id:'OB_test',setup:'OB_FVG',entry:100,stop:99,
  targets:[{price:104,kind:'STRUCTURE'}],netRR:3.54};
assert.equal(auditScalpEntry(ob,quote,now,'CONFIRMED').code,'READY');
const expensive={...ob,cost:.28};
assert.equal(auditScalpEntry(expensive,quote,now,'CONFIRMED').code,'NET_REWARD_TOO_LOW',
  '3R check must be live and unrounded, not 1.25R');
assert.notEqual(chooseEligibleScalpPlan([{...expensive,netRR:3.54}]).status,'ARMED',
  'selection must refuse <3R even with stale cached badge');
assert.equal(chooseEligibleScalpPlan([ob]).status,'ARMED');
assert.equal(summarizePaperBySetup([]).length,6);
assert.ok(summarizePaperBySetup([]).some(x=>x.setup==='OB_FVG'));
const closed=(netR,at)=>({
  activatedAt:at,closedAt:at+60000,netR,state:netR>=0?'TP1':'STOP',
  plan:{...plan,setup:'OB_FVG'}
});
assert.equal(evaluatePaperProof([closed(3,SCALP_UNIFIED_PROOF_FROM-1000)],
  SCALP_UNIFIED_PROOF_FROM).samples,0,
  'pre-launch simulated wins cannot appear as unified engine performance');
assert.equal(evaluatePaperProof([closed(-1,SCALP_UNIFIED_PROOF_FROM+1000)],
  SCALP_UNIFIED_PROOF_FROM).wins,0);
const desk=fs.readFileSync('lib/scalp-desk.ts','utf8');
const ledger=fs.readFileSync('lib/scalp-paper-ledger.ts','utf8');
const chart=fs.readFileSync('components/ScalpDesk.tsx','utf8');
assert.match(desk,/const decision=buildSniperDecision\(/);
assert.match(desk,/plan\.status='WATCH'/);
assert.match(desk,/sniperDecisions:qualityGates\.map\(g=>g\.decision\)/);
assert.match(ledger,/rr>=requiredScalpNetR\(plan\)/);
assert.match(ledger,/unifiedProof:evaluatePaperProof\(lane\.history,SCALP_UNIFIED_PROOF_FROM\)/);
assert.match(chart,/sniper-decision-audit/);
console.log('PASS: unified sniper decision, causal data freshness, strategy-proof gates, strict 3R at audit/selection/fill, independent paper-cohort reporting');
